'use strict';
'use strict';
/**
 * Limit Signal Engine v2 — El Joven Scalp PRO
 * =============================================
 * REFONTE v1 → v2 : Anticipation avant le move
 *
 * Problème v1 : signal émis quand le prix EST DÉJÀ dans la zone → trop tard
 * Solution v2 :
 *  ① Signal anticipatif à 2 ATR de la zone (avant que le prix touche)
 *  ② Signal de confirmation à 0.5 ATR (entrée optimale)
 *  ③ Scan 5s (vs 10s) pour capturer les moves rapides
 *  ④ Momentum filter tick — on vérifie que le prix SE DIRIGE vers la zone
 *  ⑤ 3 niveaux d'alerte : ANTICIPATION → APPROCHE → ENTRÉE
 *
 * Différence fondamentale avec autoSignal :
 *  - autoSignal   → signal MARKET order (exécution immédiate au prix actuel)
 *  - limitSignal  → signal LIMIT order (ordre placé à l'avance sur la zone)
 *
 * Le limitSignal v2 émet le signal LIMIT AVANT que le prix arrive en zone
 * → le trader place l'ordre et attend que le prix vienne le chercher
 */

const logger    = require('../utils/logger');
const telegram  = require('../services/telegram');
const { getCachedZones, getZoneSignal } = require('../services/zoneEngine');

const clients     = new Set();
let   scheduler   = null;
let   isRunning   = false;

const SCAN_INTERVAL_MS    = 5 * 1000;      // scan toutes les 5s (vs 10s avant)
const COOLDOWN_MS         = 20 * 60 * 1000;
const COOLDOWN_ANTICIP_MS =  5 * 60 * 1000; // cooldown anticipation 5min
const cooldown            = {};
const lastLimitSignals    = {};
const priceHistory        = {};  // historique prix pour détecter direction

const SYMBOLS  = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'];
const DECIMALS = { 'BTC/USD': 0, 'ETH/USD': 2, 'XAU/USD': 2, 'EUR/USD': 5, 'GBP/USD': 5, default: 2 };

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

function broadcastAnticipation(payload) {
    const msg = JSON.stringify({ type: 'anticipation_signal', ...payload });
    let sent = 0;
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(msg); sent++; } catch { /* ignore */ }
        }
    }
    return sent;
}

// ── Détection de direction du prix ────────────────────────────────
// Est-ce que le prix SE DIRIGE VERS la zone ou s'en éloigne ?

function trackPrice(symbol, price) {
    const h = priceHistory[symbol] || [];
    h.push({ price, time: Date.now() });
    if (h.length > 20) h.shift();
    priceHistory[symbol] = h;
    return h;
}

function isPriceMovingToward(symbol, zoneEntry, direction) {
    const h = priceHistory[symbol] || [];
    if (h.length < 4) return true; // pas assez de data → on laisse passer

    const recent  = h.slice(-4).map(x => x.price);
    const oldest  = recent[0];
    const newest  = recent[recent.length - 1];
    const delta   = newest - oldest;

    if (direction === 'BUY') {
        // Pour un BUY, le prix doit descendre vers la zone (zone de support)
        return delta < 0 || newest < oldest; // prix qui baisse vers la zone
    } else {
        // Pour un SELL, le prix doit monter vers la zone (zone de résistance)
        return delta > 0 || newest > oldest; // prix qui monte vers la zone
    }
}

// ── Micro-confirmation M1 ─────────────────────────────────────────

function getMicroConfirmation(zoneSignal, m1Candles) {
    if (!m1Candles || m1Candles.length < 5) {
        return { confirmed: true, reason: 'no_candle_data' };
    }

    const last = m1Candles[m1Candles.length - 1];
    const prev = m1Candles[m1Candles.length - 2];

    if (zoneSignal.direction === 'BUY') {
        const lowerWick   = last.open - last.low;
        const body        = Math.abs(last.close - last.open);
        const isRejection = lowerWick > body * 1.5;
        const isBullish   = last.close > last.open && last.close > prev.close;
        if (isRejection || isBullish) return { confirmed: true, reason: isRejection ? 'pin_bar_rejection' : 'bullish_bar' };
        return { confirmed: false, reason: 'no_bullish_confirmation_yet' };
    } else {
        const upperWick   = last.high - last.open;
        const body        = Math.abs(last.close - last.open);
        const isRejection = upperWick > body * 1.5;
        const isBearish   = last.close < last.open && last.close < prev.close;
        if (isRejection || isBearish) return { confirmed: true, reason: isRejection ? 'pin_bar_rejection' : 'bearish_bar' };
        return { confirmed: false, reason: 'no_bearish_confirmation_yet' };
    }
}

// ── Signal d'ANTICIPATION (2 ATR avant la zone) ───────────────────
// Nouveau en v2 : émis BIEN AVANT que le prix touche la zone
// Le trader a le temps de placer son ordre limit et attendre

function emitAnticipationSignal(symbol, zone, currentPrice, zoneSignal) {
    const now = Date.now();
    const ck  = `anticip:${symbol}:${zone.kind}:${zone.entry.toFixed(0)}`;
    if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_ANTICIP_MS) return;
    cooldown[ck] = now;

    const dec      = DECIMALS[symbol] ?? DECIMALS.default;
    const direction = zone.type === 'bullish' ? 'BUY' : 'SELL';

    const payload = {
        id:           `ANTICIP-${symbol.replace('/', '')}-${now}`,
        symbol,
        direction,
        orderType:    'LIMIT',
        phase:        'ANTICIPATION',     // ← nouveau : phase du signal
        zoneKind:     zone.kind,
        zoneStrength: zone.strength,
        entry:        +zone.entry.toFixed(dec),
        zoneTop:      +zone.top.toFixed(dec),
        zoneBottom:   +zone.bottom.toFixed(dec),
        currentPrice: +currentPrice.toFixed(dec),
        distATR:      +zone.distATR.toFixed(2),
        stopLoss:     zoneSignal?.sl ? +zoneSignal.sl.toFixed(dec) : null,
        takeProfit:   zoneSignal?.tp ? +zoneSignal.tp.toFixed(dec) : null,
        rr:           zoneSignal?.rr || null,
        message:      `🎯 ANTICIP ${direction} ${symbol} | Zone ${zone.kind} dans ${zone.distATR.toFixed(1)} ATR | Prépare l'ordre LIMIT @ ${zone.entry.toFixed(dec)}`,
        confidence:   zone.strength === 3 ? 70 : zone.strength === 2 ? 55 : 40,
        timestamp:    now,
        source:       'limit_engine_v2',
        aiEngine:     'limit-v2',
    };

    const sent = broadcastAnticipation(payload);
    telegram.sendSignal({ ...payload, signal: `${direction} LIMIT ANTICIP` }).catch(() => {});
    logger.info(`🎯 ANTICIP ${symbol} ${direction} @ ${zone.entry.toFixed(dec)} | zone=${zone.kind} str=${zone.strength} | dist=${zone.distATR.toFixed(2)} ATR → ${sent} clients`);
}

// ── Zone Alert (1-1.5 ATR de la zone) ────────────────────────────

function broadcastZoneAlert(symbol, zone, currentPrice) {
    const dec     = DECIMALS[symbol] ?? DECIMALS.default;
    const payload = JSON.stringify({
        type:         'zone_alert',
        phase:        'APPROACHING',
        symbol,
        direction:    zone.type === 'bullish' ? 'BUY' : 'SELL',
        zoneKind:     zone.kind,
        zoneEntry:    +zone.entry.toFixed(dec),
        zoneTop:      +zone.top.toFixed(dec),
        zoneBottom:   +zone.bottom.toFixed(dec),
        currentPrice: +currentPrice.toFixed(dec),
        distATR:      zone.distATR,
        strength:     zone.strength,
        message:      `⚡ ${symbol} — Prix approche zone ${zone.kind.toUpperCase()} à ${zone.distATR.toFixed(1)} ATR`,
        timestamp:    Date.now(),
    });

    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); } catch { /* ignore */ }
        }
    }
}

// ── Scan principal ────────────────────────────────────────────────

async function scanLimitSignals() {
    const { getPriceHistory, getPrice } = require('../services/priceAggregator');
    const now = Date.now();

    await Promise.all(SYMBOLS.map(async (symbol) => {
        try {
            const priceData = await getPrice(symbol);
            const livePrice = priceData?.price;
            if (!livePrice || livePrice <= 0) return;

            // Track prix pour détecter la direction
            trackPrice(symbol, livePrice);

            // Candles H1
            const h1Hist = await getPriceHistory(symbol, '1h', 100);
            if (!h1Hist?.candles?.length || h1Hist.source === 'synthetic') return;

            let m15Candles = null, m1Candles = null;
            try { m15Candles = (await getPriceHistory(symbol, '15min', 60))?.candles; } catch {}
            try { m1Candles  = (await getPriceHistory(symbol, '1min',  20))?.candles; } catch {}

            // Zones actives
            const zoneData = getCachedZones(h1Hist.candles, m15Candles, livePrice, symbol);
            if (!zoneData?.zones?.length) return;

            // ── NIVEAU 1 : ANTICIPATION (2-3 ATR) ────────────────
            // Signal le plus précoce — prix encore loin de la zone
            const anticipZones = zoneData.zones.filter(z =>
                (z.status === 'approaching' || z.status === 'near') &&
                z.distATR >= 1.5 && z.distATR <= 3.0 &&
                z.strength >= 2
            );

            for (const zone of anticipZones.slice(0, 2)) {
                const direction = zone.type === 'bullish' ? 'BUY' : 'SELL';
                const isMovingToward = isPriceMovingToward(symbol, zone.entry, direction);
                if (!isMovingToward) continue; // prix ne va pas vers la zone

                const ck = `anticip:${symbol}:${zone.kind}:${zone.entry.toFixed(0)}`;
                if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_ANTICIP_MS) continue;

                // Calcul SL/TP anticipatif
                const atr = zone.atr || (livePrice * 0.002);
                const zoneSignalPreview = {
                    direction,
                    entry: zone.entry,
                    sl:    direction === 'BUY'  ? zone.bottom - atr * 0.5 : zone.top + atr * 0.5,
                    tp:    direction === 'BUY'  ? zone.entry + atr * 3    : zone.entry - atr * 3,
                    rr:    3.0,
                };

                emitAnticipationSignal(symbol, zone, livePrice, zoneSignalPreview);
            }

            // ── NIVEAU 2 : ZONE ALERT (1-1.5 ATR) ───────────────
            const approaching = zoneData.zones.filter(z =>
                z.status === 'approaching' && z.distATR < 1.5 && z.distATR >= 0.5
            );
            for (const zone of approaching.slice(0, 2)) {
                const alertKey = `alert:${symbol}:${zone.kind}:${zone.entry.toFixed(0)}`;
                if (!cooldown[alertKey] || now - cooldown[alertKey] > COOLDOWN_MS) {
                    broadcastZoneAlert(symbol, zone, livePrice);
                    cooldown[alertKey] = now;
                }
            }

            // ── NIVEAU 3 : ENTRÉE LIMIT (prix dans la zone) ──────
            const zoneSignal = getZoneSignal(livePrice, zoneData.zones);
            if (!zoneSignal) return;

            const ck = `limit:${symbol}:${zoneSignal.zoneKind}:${zoneSignal.entry.toFixed(0)}`;
            if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_MS) return;

            // Vérifier que le prix se dirige bien vers la zone
            const isMovingToward = isPriceMovingToward(symbol, zoneSignal.entry, zoneSignal.direction);

            // Micro-confirmation (allégée pour zones strength=3)
            if (zoneSignal.strength < 3) {
                const liveCandle = m1Candles?.[m1Candles.length - 1] || null;
                const confirm    = getMicroConfirmation(zoneSignal, m1Candles);
                if (!confirm.confirmed) {
                    logger.info(`⏳ LimitSignal ${symbol} zone ${zoneSignal.zoneKind} — attente confirmation M1 (${confirm.reason})`);
                    return;
                }
            }

            const rr = parseFloat(zoneSignal.rr || '0');
            if (rr < 1.5) { logger.info(`⛔ LimitSignal ${symbol} RR=${rr} < 1.5`); return; }

            const dec = DECIMALS[symbol] ?? DECIMALS.default;
            const sig = {
                id:           `LIMIT-${symbol.replace('/', '')}-${now}`,
                symbol,
                signal:       zoneSignal.direction,
                orderType:    'LIMIT',
                phase:        'ENTRÉE',          // ← phase : on est en zone
                entry:        +zoneSignal.entry.toFixed(dec),
                stopLoss:     +zoneSignal.sl.toFixed(dec),
                takeProfit:   +zoneSignal.tp.toFixed(dec),
                rr,
                currentPrice: +livePrice.toFixed(dec),
                zoneKind:     zoneSignal.zoneKind,
                zoneStrength: zoneSignal.strength,
                distATR:      zoneSignal.distATR,
                movingToward: isMovingToward,
                reasoning:    zoneSignal.desc || `Zone ${zoneSignal.zoneKind} ${zoneSignal.direction}`,
                confidence:   zoneSignal.strength === 3 ? 80 : zoneSignal.strength === 2 ? 65 : 50,
                compositeScore: zoneSignal.direction === 'BUY' ? zoneSignal.strength * 25 : -(zoneSignal.strength * 25),
                source:       'limit_engine_v2',
                aiEngine:     'limit-v2',
                timestamp:    now,
            };

            cooldown[ck]             = now;
            lastLimitSignals[symbol] = sig;

            const sent = broadcastLimitSignal(sig);
            telegram.sendSignal({ ...sig, signal: `${sig.signal} LIMIT` }).catch(() => {});

            logger.info(`🎯 LIMIT ${symbol} ${sig.signal} @ ${sig.entry} | zone=${sig.zoneKind} str=${sig.zoneStrength} | SL=${sig.stopLoss} TP=${sig.takeProfit} RR=${rr} | toward=${isMovingToward} → ${sent} clients`);

        } catch (err) {
            logger.warn(`LimitSignal v2 erreur ${symbol}`, { err: err.message });
        }
    }));
}

// ── Lifecycle ─────────────────────────────────────────────────────

function start() {
    if (isRunning) stop();
    setTimeout(scanLimitSignals, 2000);
    scheduler = setInterval(scanLimitSignals, SCAN_INTERVAL_MS);
    isRunning = true;
    logger.info(`LimitSignal v2 démarré — scan toutes les ${SCAN_INTERVAL_MS / 1000}s | 3 niveaux d'alerte | ${SYMBOLS.length} symboles`);
}

function stop() {
    if (scheduler) { clearInterval(scheduler); scheduler = null; }
    isRunning = false;
    logger.info('LimitSignal v2 arrêté');
}

function registerClient(ws)   { clients.add(ws); }
function unregisterClient(ws) { clients.delete(ws); }

function getStatus() {
    return {
        running:          isRunning,
        version:          'limit-v2',
        scanIntervalSec:  SCAN_INTERVAL_MS / 1000,
        levels:           ['ANTICIPATION (2-3 ATR)', 'APPROACHING (1-1.5 ATR)', 'ENTRÉE (in zone)'],
        clients:          clients.size,
        lastLimitSignals: Object.entries(lastLimitSignals).map(([s, sig]) => ({
            symbol:    s,
            direction: sig.signal,
            entry:     sig.entry,
            phase:     sig.phase,
            zoneKind:  sig.zoneKind,
            rr:        sig.rr,
            ageMin:    Math.round((Date.now() - sig.timestamp) / 60000),
        })),
    };
}

module.exports = { start, stop, registerClient, unregisterClient, getStatus, scanLimitSignals };