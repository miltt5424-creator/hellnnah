'use strict';
/**
 * AutoSignal v9 — El Joven Scalp PRO
 * =====================================
 * Changements v8 → v9 :
 *  ① Promise.all() : les 5 symboles scannés EN PARALLÈLE (vs boucle séquentielle)
 *     → latence réduite de ~5s à ~1s par cycle
 *  ② 2 pipelines séparés :
 *     - MARKET pipeline (toutes les 1 min) : signal market order classique
 *     - ZONE pipeline  (toutes les 15s)   : délégué à limitSignal.js
 *  ③ Intégration du threshold adaptatif v5 (inZone → seuil 15 au lieu de 28)
 *  ④ Passage du type : 'market_signal' dans le payload (vs 'limit_signal' pour limitSignal)
 */

const logger    = require('../utils/logger');
const { analyze } = require('../services/strategyEngine');
const telegram  = require('../services/telegram');
const limitSignal = require('./limitSignal');  // pipeline limit orders

const clients     = new Set();
let   scheduler   = null;
let   isRunning   = false;
const COOLDOWN_MS = 15 * 60 * 1000;
const cooldown    = {};
const lastSignals = {};

const SYMBOLS     = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'];
const DXY_SYMBOLS = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'AUD/USD'];
const DECIMALS    = { 'BTC/USD': 0, 'ETH/USD': 2, 'XAU/USD': 2, 'EUR/USD': 5, 'GBP/USD': 5, default: 2 };

// ── Broadcast ─────────────────────────────────────────────────────

function broadcastSignal(sig) {
    const payload = JSON.stringify({ type: 'auto_signal', ...sig });
    let sent = 0;
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); sent++; } catch { /* ignore */ }
        }
    }
    return sent;
}

// ── Scan d'un symbole (extrait pour Promise.all) ──────────────────

async function scanSymbol(symbol, dxyCandles, now) {
    const { getPriceHistory, getPrice } = require('../services/priceAggregator');

    // Prix live
    const priceData = await getPrice(symbol);
    const livePrice = priceData?.price;
    if (!livePrice || livePrice <= 0) return;

    // Candles M1 (données synthétiques = skip)
    const m1Hist = await getPriceHistory(symbol, '1min', 120);
    if (!m1Hist?.candles?.length || m1Hist.source === 'synthetic') return;
    const m1Candles = m1Hist.candles;

    // MTF candles (en parallèle)
    const [m15Result, h1Result] = await Promise.allSettled([
        getPriceHistory(symbol, '15min', 100),
        getPriceHistory(symbol, '1h',    100),
    ]);

    const m15Candles = m15Result.status === 'fulfilled' ? m15Result.value?.candles : null;
    const h1Candles  = h1Result.status  === 'fulfilled' ? h1Result.value?.candles  : null;
    const useDXY     = DXY_SYMBOLS.includes(symbol) ? dxyCandles : null;

    // Validation intervalles
    const m1Interval  = m1Candles.length  >= 2 ? m1Candles[1].time  - m1Candles[0].time  : 60;
    const m15Interval = m15Candles && m15Candles.length >= 2 ? m15Candles[1].time - m15Candles[0].time : 0;
    const h1Interval  = h1Candles  && h1Candles.length  >= 2 ? h1Candles[1].time  - h1Candles[0].time  : 0;
    const m15Valid = m15Candles && m15Candles.length > 10 && m15Interval >= 300;
    const h1Valid  = h1Candles  && h1Candles.length  > 10 && h1Interval  >= 1800;

    // Analyse complète (strategyEngine v5)
    const analysis = await analyze(m1Candles, symbol, {
        m15Candles: m15Valid ? m15Candles : null,
        h1Candles:  h1Valid  ? h1Candles  : null,
        dxyCandles: useDXY,
        livePrice,
    });

    if (!analysis || analysis.direction === 'HOLD') return;

    const { direction, score, confidence, signals, levels, kelly, mtf, smc, ict, volProfile, dxy, inZone } = analysis;

    // Volume Profile gate
    if (volProfile?.gate === 'blocked_void') {
        logger.info(`⛔ ${symbol} bloqué — vide de volume`); return;
    }

    // Contre-tendance gate
    if (mtf?.counterTrend) {
        logger.info(`⛔ ${symbol} bloqué — contre-tendance H1`); return;
    }

    // Confluence gate (uniquement si pas in zone)
    if (mtf?.confluence === 'LOW' && !inZone) {
        logger.info(`⛔ ${symbol} bloqué — confluence MTF faible (pas in zone)`); return;
    }

    // SL/TP valides
    if (!levels || levels.rr < 1.5) return;
    const { sl, tp, rr, atr } = levels;
    if (direction === 'BUY'  && (sl >= livePrice || tp <= livePrice)) return;
    if (direction === 'SELL' && (sl <= livePrice || tp >= livePrice)) return;

    // Cooldown
    const ck = `${symbol}:${direction}`;
    if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_MS) return;

    const dec = DECIMALS[symbol] ?? DECIMALS.default;

    const sig = {
        id:             `${symbol.replace('/', '')}-${now}`,
        symbol,
        signal:         direction,
        orderType:      'MARKET',          // market signal (vs LIMIT dans limitSignal)
        confidence,
        compositeScore: score,
        inZone:         inZone || false,   // ← nouveau v5
        entry:          +livePrice.toFixed(dec),
        stopLoss:       +sl.toFixed(dec),
        takeProfit:     +tp.toFixed(dec),
        rr:             +rr.toFixed(2),
        reasoning:      signals.slice(0, 5).join(' | '),
        mtfConfluence:  mtf.confluence,
        mtfDirection:   mtf.direction,
        tf1Bias:        mtf.tf1.bias,
        tf15Bias:       mtf.tf15.bias,
        tf60Bias:       mtf.tf60.bias,
        smcBias:        smc.bias,
        inducement:     smc.inducement?.desc || null,
        liquiditySweep: smc.liquiditySweep?.desc || null,
        killZone:       ict.killZone?.name || null,
        ote:            ict.ote?.type || null,
        poc:            volProfile?.poc ? +volProfile.poc.toFixed(dec) : null,
        vwap:           volProfile?.vwap ? +volProfile.vwap.toFixed(dec) : null,
        nearPOC:        volProfile?.nearPOC,
        dxyBias:        dxy?.dxyBias || null,
        kellySafe:      kelly?.kellySafe || null,
        kellyNote:      kelly?.riskNote || null,
        adx:            mtf.tf1.adx || null,
        adxH1:          mtf.tf60.adx || null,
        fibonacci:      mtf.tf1.fibonacci || null,
        regime:         mtf.tf1.regime || null,
        ichimoku:       mtf.tf1.ichimoku || null,
        supertrend:     mtf.tf1.supertrend || null,
        divergence:     mtf.tf1.divergence || null,
        rejection:      mtf.tf1.rejection || null,
        mss:            analysis.smc?.mss || null,
        premiumDiscount: analysis.ict?.premiumDiscount || null,
        nextKillZone:   analysis.ict?.nextKillZone || null,
        h1Ichimoku:     mtf.tf60.ichimoku || null,
        h1Supertrend:   mtf.tf60.supertrend || null,
        strategy: {
            score, direction, signals: signals || [],
            smc: analysis.smc,
            ict: analysis.ict,
            hlz: analysis.hlz,
            orderFlow: {
                buyPressure:  mtf.tf1.bull ? Math.round(mtf.tf1.bull / (mtf.tf1.bull + mtf.tf1.bear + 0.01) * 100) : 50,
                sellPressure: mtf.tf1.bear ? Math.round(mtf.tf1.bear / (mtf.tf1.bull + mtf.tf1.bear + 0.01) * 100) : 50,
                delta:        (mtf.tf1.bull || 0) - (mtf.tf1.bear || 0),
                imbalance:    mtf.tf1.bull > mtf.tf1.bear + 3 ? 'bullish' : mtf.tf1.bear > mtf.tf1.bull + 3 ? 'bearish' : 'neutral',
                momentum:     mtf.tf1.bias,
            },
            mtf: { direction: mtf.direction, strength: mtf.strength, confluence: mtf.confluence, tf1: mtf.tf1, tf15: mtf.tf15, tf60: mtf.tf60 },
            adx: mtf.tf1.adx, fibonacci: mtf.tf1.fibonacci, regime: mtf.tf1.regime,
            ichimoku: mtf.tf1.ichimoku, supertrend: mtf.tf1.supertrend,
            divergence: mtf.tf1.divergence, rejection: mtf.tf1.rejection,
            volProfile, dxy,
        },
        atr:         +atr.toFixed(dec),
        candleSource: m1Hist.source,
        priceSource:  priceData.source,
        levelsFixed:  true,
        timestamp:    now,
        aiEngine:     'auto-v9',
        source:       'scheduler',
    };

    cooldown[ck]        = now;
    lastSignals[symbol] = sig;

    const sent = broadcastSignal(sig);
    telegram.sendSignal(sig).catch(() => {});

    logger.info(`✅ v9 ${symbol} ${direction}${inZone ? ' [IN ZONE]' : ''} | conf=${confidence}% | score=${score} | RR=${rr} | MTF=${mtf.confluence} | SL=${sl.toFixed(dec)} TP=${tp.toFixed(dec)} → ${sent} clients`);
}

// ── Pipeline MARKET (1 min) ───────────────────────────────────────

async function generateAndBroadcast() {
    const { getPriceHistory } = require('../services/priceAggregator');
    const now = Date.now();

    // DXY une seule fois
    let dxyCandles = null;
    try {
        const dxyHist = await getPriceHistory('USD/CHF', '1min', 60);
        dxyCandles = dxyHist?.candles || null;
    } catch { /* DXY optionnel */ }

    // Scan PARALLÈLE de tous les symboles (Promise.all vs boucle for)
    const results = await Promise.allSettled(
        SYMBOLS.map(symbol => scanSymbol(symbol, dxyCandles, now))
    );

    // Log des erreurs
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            logger.warn(`AutoSignal v9 erreur ${SYMBOLS[i]}`, { err: r.reason?.message });
        }
    });
}

// ── Lifecycle ─────────────────────────────────────────────────────

function registerClient(ws) {
    clients.add(ws);
    limitSignal.registerClient(ws);   // le même client reçoit aussi les limit signals
}

function unregisterClient(ws) {
    clients.delete(ws);
    limitSignal.unregisterClient(ws);
}

function start(intervalMinutes = 1) {
    if (isRunning) stop();

    // Pipeline MARKET : toutes les 1 min
    setTimeout(generateAndBroadcast, 2000);
    scheduler = setInterval(generateAndBroadcast, Math.max(1, intervalMinutes) * 60 * 1000);

    // Pipeline LIMIT : toutes les 10s (géré par limitSignal)
    limitSignal.start();

    isRunning = true;
    logger.info(`AutoSignal v9 démarré — MARKET scan ${intervalMinutes}min | LIMIT scan 10s | PARALLEL`);
    telegram.sendBotStatus(true, intervalMinutes).catch(() => {});
}

function stop() {
    if (scheduler) { clearInterval(scheduler); scheduler = null; }
    limitSignal.stop();
    isRunning = false;
    telegram.sendBotStatus(false, 0).catch(() => {});
}

function getStatus() {
    return {
        running:         isRunning,
        version:         'v9',
        intervalMinutes: 1,
        limitScan:       '10s',
        clients:         clients.size,
        modules:         ['MTF-M1/M15/H1', 'SMC', 'ICT', 'ZoneProximity', 'LimitSignal', 'HLZ', 'VolumeProfile', 'DXY', 'Kelly', 'ADX', 'Fibonacci', 'Regime', 'Ichimoku', 'SuperTrend', 'Divergences'],
        limitSignalStatus: limitSignal.getStatus(),
        lastSignals:     Object.entries(lastSignals).map(([s, sig]) => ({
            symbol: s, signal: sig.signal, entry: sig.entry,
            sl: sig.stopLoss, tp: sig.takeProfit, rr: sig.rr,
            mtf: sig.mtfConfluence, kelly: sig.kellySafe, inZone: sig.inZone,
            ageMin: Math.round((Date.now() - sig.timestamp) / 60000),
        })),
    };
}

module.exports = { registerClient, unregisterClient, start, stop, getStatus };
