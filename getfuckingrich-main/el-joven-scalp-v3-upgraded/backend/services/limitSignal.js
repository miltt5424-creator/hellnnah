'use strict';
/**
 * Limit Signal Engine — El Joven Scalp PRO
 * ==========================================
 * MODULE LIMIT ORDER : surveille les zones détectées par zoneEngine
 * et émet des signaux LIMIT quand le prix s'approche d'une zone active.
 *
 * Différence fondamentale avec autoSignal.js :
 *  - autoSignal   → attend que tout soit confirmé → MARKET order → retard
 *  - limitSignal  → place le signal AVANT le move → LIMIT order → entrée précise
 *
 * Pipeline :
 *  1. Toutes les 10s : récupère le prix live de chaque symbole
 *  2. Récupère les zones calculées par zoneEngine (cache 60s)
 *  3. Si prix dans zone → émet signal LIMIT avec entry/sl/tp précis
 *  4. Confirmation M1 optionnelle (rejection candle ou liquidity sweep)
 *  5. Broadcast WebSocket aux clients + Telegram
 *  6. Cooldown 20min par symbole+zone pour éviter le spam
 */

const logger    = require('../utils/logger');
const telegram  = require('./telegram');
const { getCachedZones, getZoneSignal } = require('./zoneEngine');

const clients     = new Set();
let   scheduler   = null;
let   isRunning   = false;

const SCAN_INTERVAL_MS = 10 * 1000;   // scan toutes les 10s
const COOLDOWN_MS      = 20 * 60 * 1000; // cooldown 20min par zone
const cooldown         = {};           // { 'XAU/USD:ob:2341.5': timestamp }
const lastLimitSignals = {};           // dernier signal limit par symbole

const SYMBOLS     = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'];
const DXY_SYMBOLS = ['XAU/USD', 'EUR/USD', 'GBP/USD'];
const DECIMALS    = { 'BTC/USD': 0, 'ETH/USD': 2, 'XAU/USD': 2, 'EUR/USD': 5, 'GBP/USD': 5, default: 2 };

// ── Broadcast ─────────────────────────────────────────────────────

function broadcastLimitSignal(sig) {
    const payload = JSON.stringify({ type: 'limit_signal', ...sig });
    let sent = 0;
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); sent++; } catch { /* ignore */ }
        }
    }
    return sent;
}

// ── Micro-confirmation M1 ─────────────────────────────────────────
// Vérification légère (1 seul indicateur) pour filtrer les fausses zones.
// On n'attend PAS la close de la candle — on regarde le wick live.

function getMicroConfirmation(liveCandle, zoneSignal, m1Candles) {
    if (!liveCandle || !m1Candles || m1Candles.length < 5) {
        return { confirmed: true, reason: 'no_candle_data' };
    }

    const last  = m1Candles[m1Candles.length - 1];
    const prev  = m1Candles[m1Candles.length - 2];
    const atr   = zoneSignal.entry * 0.002; // approximation rapide

    if (zoneSignal.direction === 'BUY') {
        // Confirmation BUY : wick inférieur long (rejection à la baisse) ou candle bullish
        const lowerWick = last.open - last.low;
        const body      = Math.abs(last.close - last.open);
        const isRejection = lowerWick > body * 1.5;
        const isBullishBar = last.close > last.open && last.close > prev.close;

        if (isRejection || isBullishBar) return { confirmed: true, reason: isRejection ? 'pin_bar_rejection' : 'bullish_bar' };
        return { confirmed: false, reason: 'no_bullish_confirmation_yet' };
    } else {
        // Confirmation SELL : wick supérieur long ou candle bearish
        const upperWick = last.high - last.open;
        const body      = Math.abs(last.close - last.open);
        const isRejection = upperWick > body * 1.5;
        const isBearishBar = last.close < last.open && last.close < prev.close;

        if (isRejection || isBearishBar) return { confirmed: true, reason: isRejection ? 'pin_bar_rejection' : 'bearish_bar' };
        return { confirmed: false, reason: 'no_bearish_confirmation_yet' };
    }
}

// ── Zone alert (pré-alerte) ───────────────────────────────────────
// Émis AVANT que le prix touche la zone (distATR 1-3)
// Permet au trader de se préparer sans que le signal limit ne soit encore déclenché

function broadcastZoneAlert(symbol, zone, currentPrice) {
    const dec     = DECIMALS[symbol] ?? DECIMALS.default;
    const payload = JSON.stringify({
        type:          'zone_alert',
        symbol,
        direction:     zone.type === 'bullish' ? 'BUY' : 'SELL',
        zoneKind:      zone.kind,
        zoneEntry:     +zone.entry.toFixed(dec),
        zoneTop:       +zone.top.toFixed(dec),
        zoneBottom:    +zone.bottom.toFixed(dec),
        currentPrice:  +currentPrice.toFixed(dec),
        distATR:       zone.distATR,
        distPct:       zone.distPct,
        strength:      zone.strength,
        desc:          zone.desc || `Zone ${zone.kind} @ ${zone.entry.toFixed(dec)}`,
        message:       `⚡ Prix s'approche d'une zone ${zone.kind.toUpperCase()} ${zone.type === 'bullish' ? 'BUY' : 'SELL'} à ${zone.distATR.toFixed(1)} ATR`,
        timestamp:     Date.now(),
    });

    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); } catch { /* ignore */ }
        }
    }
}

// ── Scan principal ────────────────────────────────────────────────

async function scanLimitSignals() {
    const { getPriceHistory, getPrice } = require('./priceAggregator');
    const now = Date.now();

    // Scan en parallèle pour tous les symboles
    await Promise.all(SYMBOLS.map(async (symbol) => {
        try {
            // ── 1. Prix live ──────────────────────────────────────
            const priceData  = await getPrice(symbol);
            const livePrice  = priceData?.price;
            if (!livePrice || livePrice <= 0) return;

            // ── 2. Candles H1 (zones structurelles) ──────────────
            const h1Hist = await getPriceHistory(symbol, '1h', 100);
            if (!h1Hist?.candles?.length || h1Hist.source === 'synthetic') return;

            // M15 pour zones plus fines
            let m15Candles = null;
            try { m15Candles = (await getPriceHistory(symbol, '15min', 60))?.candles; } catch {}

            // M1 pour micro-confirmation
            let m1Candles = null;
            try { m1Candles = (await getPriceHistory(symbol, '1min', 20))?.candles; } catch {}

            // ── 3. Zones actives (cache 60s) ──────────────────────
            const zoneData = getCachedZones(h1Hist.candles, m15Candles, livePrice, symbol);
            if (!zoneData?.zones?.length) return;

            // ── 4. Pré-alerte : zones qui s'approchent ────────────
            const approaching = zoneData.zones.filter(z => z.status === 'approaching' && z.distATR < 2.5);
            for (const zone of approaching.slice(0, 2)) {
                const alertKey = `alert:${symbol}:${zone.kind}:${zone.entry.toFixed(0)}`;
                if (!cooldown[alertKey] || now - cooldown[alertKey] > COOLDOWN_MS) {
                    broadcastZoneAlert(symbol, zone, livePrice);
                    cooldown[alertKey] = now;
                }
            }

            // ── 5. Signal LIMIT : prix dans la zone ───────────────
            const zoneSignal = getZoneSignal(livePrice, zoneData.zones);
            if (!zoneSignal) return;

            // ── 6. Cooldown par zone ──────────────────────────────
            const ck = `limit:${symbol}:${zoneSignal.zoneKind}:${zoneSignal.entry.toFixed(0)}`;
            if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_MS) return;

            // ── 7. Micro-confirmation M1 (optionnelle) ────────────
            // Pour les zones faibles (strength=1), on exige une confirmation
            // Pour les zones fortes (strength=3), on émet directement
            if (zoneSignal.strength < 3) {
                const liveCandle = m1Candles?.[m1Candles.length - 1] || null;
                const confirm    = getMicroConfirmation(liveCandle, zoneSignal, m1Candles);
                if (!confirm.confirmed) {
                    logger.info(`⏳ LimitSignal ${symbol} zone ${zoneSignal.zoneKind} — attente confirmation M1 (${confirm.reason})`);
                    return;
                }
            }

            // ── 8. Vérification RR minimum ────────────────────────
            const rr = parseFloat(zoneSignal.rr || '0');
            if (rr < 1.5) {
                logger.info(`⛔ LimitSignal ${symbol} RR=${rr} < 1.5 — zone ignorée`);
                return;
            }

            // ── 9. Build signal LIMIT ─────────────────────────────
            const dec = DECIMALS[symbol] ?? DECIMALS.default;

            const sig = {
                id:           `LIMIT-${symbol.replace('/', '')}-${now}`,
                symbol,
                signal:       zoneSignal.direction,
                orderType:    'LIMIT',                    // ← clé : c'est un LIMIT order
                entry:        +zoneSignal.entry.toFixed(dec),
                stopLoss:     +zoneSignal.sl.toFixed(dec),
                takeProfit:   +zoneSignal.tp.toFixed(dec),
                rr:           rr,
                currentPrice: +livePrice.toFixed(dec),
                zoneKind:     zoneSignal.zoneKind,
                zoneStrength: zoneSignal.strength,
                distATR:      zoneSignal.distATR,
                reasoning:    zoneSignal.desc || `Zone ${zoneSignal.zoneKind} ${zoneSignal.direction}`,
                confidence:   zoneSignal.strength === 3 ? 75 : zoneSignal.strength === 2 ? 60 : 45,
                compositeScore: zoneSignal.direction === 'BUY' ? zoneSignal.strength * 25 : -(zoneSignal.strength * 25),
                source:       'limit_engine',
                aiEngine:     'limit-v1',
                timestamp:    now,
            };

            cooldown[ck]              = now;
            lastLimitSignals[symbol]  = sig;

            const sent = broadcastLimitSignal(sig);

            // Telegram
            telegram.sendSignal({ ...sig, signal: `${sig.signal} LIMIT` }).catch(() => {});

            logger.info(`🎯 LIMIT ${symbol} ${sig.signal} @ ${sig.entry} | zone=${sig.zoneKind} str=${sig.zoneStrength} | SL=${sig.stopLoss} TP=${sig.takeProfit} RR=${rr} → ${sent} clients`);

        } catch (err) {
            logger.warn(`LimitSignal erreur ${symbol}`, { err: err.message });
        }
    }));
}

// ── Lifecycle ─────────────────────────────────────────────────────

function start() {
    if (isRunning) stop();
    // Premier scan après 3s
    setTimeout(scanLimitSignals, 3000);
    scheduler  = setInterval(scanLimitSignals, SCAN_INTERVAL_MS);
    isRunning  = true;
    logger.info(`LimitSignal démarré — scan toutes les ${SCAN_INTERVAL_MS / 1000}s | ${SYMBOLS.length} symboles`);
}

function stop() {
    if (scheduler) { clearInterval(scheduler); scheduler = null; }
    isRunning = false;
    logger.info('LimitSignal arrêté');
}

function registerClient(ws)   { clients.add(ws); }
function unregisterClient(ws) { clients.delete(ws); }

function getStatus() {
    return {
        running:          isRunning,
        version:          'limit-v1',
        scanIntervalSec:  SCAN_INTERVAL_MS / 1000,
        clients:          clients.size,
        lastLimitSignals: Object.entries(lastLimitSignals).map(([s, sig]) => ({
            symbol:    s,
            direction: sig.signal,
            entry:     sig.entry,
            zoneKind:  sig.zoneKind,
            rr:        sig.rr,
            ageMin:    Math.round((Date.now() - sig.timestamp) / 60000),
        })),
    };
}

module.exports = { start, stop, registerClient, unregisterClient, getStatus, scanLimitSignals };
