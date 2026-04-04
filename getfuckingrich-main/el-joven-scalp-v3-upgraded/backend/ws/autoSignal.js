'use strict';
/**
 * AutoSignal v10 — El Joven Scalp PRO
 * =====================================
 * REFONTE MAJEURE v9 → v10 : "Penser comme un humain, réagir plus vite"
 *
 * Problème v9 : signal arrive APRÈS l'impulsion (confirmation trop tardive)
 * Solution v10 :
 *  ① Tick engine 500ms — prix scanné toutes les 500ms (vs 1min avant)
 *  ② Anticipation engine — signal émis AVANT le move, pas après
 *  ③ Structure-first — on lit le marché comme un trader SMC humain :
 *     Structure → Contexte → Zone → Timing → Signal
 *  ④ Ollama intégré — LLM local analyse le contexte et valide le signal
 *  ⑤ Pre-signal alert — alerte 2-3 bougies avant le déclenchement
 *  ⑥ Momentum filter — on détecte l'impulsion NAISSANTE, pas l'impulsion partie
 *
 * Pipeline tick :
 *  500ms → prix live → delta momentum → zone proximity → pre-signal?
 *  60s   → analyse MTF complète → signal MARKET si confirmé
 *  10s   → limitSignal pipeline (inchangé)
 */

const logger      = require('../utils/logger');
const { analyze } = require('../services/strategyEngine');
const telegram    = require('../services/telegram');
const limitSignal = require('./limitSignal');

const clients     = new Set();
let   marketScheduler = null;
let   tickInterval    = null;
let   isRunning       = false;

// ── Cooldowns & state ─────────────────────────────────────────────
const COOLDOWN_MARKET_MS  = 15 * 60 * 1000;  // 15min entre signaux MARKET
const COOLDOWN_PRESIG_MS  =  3 * 60 * 1000;  // 3min entre pre-signals
const cooldown    = {};
const lastSignals = {};
const tickState   = {};   // état tick par symbole : { price, ema9, delta, momentum }

const SYMBOLS  = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'];
const DECIMALS = { 'BTC/USD': 0, 'ETH/USD': 2, 'XAU/USD': 2, 'EUR/USD': 5, 'GBP/USD': 5, default: 2 };

// ── Ollama config ──────────────────────────────────────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED === 'true';

// ── Broadcast ─────────────────────────────────────────────────────

function broadcast(type, payload) {
    const msg = JSON.stringify({ type, ...payload });
    let sent = 0;
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(msg); sent++; } catch { /* ignore */ }
        }
    }
    return sent;
}

// ── Ollama — Validation LLM local ─────────────────────────────────
// Si Ollama tourne, on lui demande de valider le signal avant émission
// Timeout 2s pour ne pas bloquer le pipeline

async function ollamaValidate(context) {
    if (!OLLAMA_ENABLED) return { valid: true, reason: 'ollama_disabled' };
    try {
        const prompt = `Tu es un trader SMC expert. Analyse ce contexte de marché et dis si le signal est valide.
Réponds UNIQUEMENT en JSON : {"valid": true/false, "confidence": 0-100, "reason": "explication courte"}

Contexte :
- Symbole : ${context.symbol}
- Direction : ${context.direction}
- Prix actuel : ${context.price}
- Structure H1 : ${context.h1Structure}
- Momentum M1 : ${context.momentum}
- Zone : ${context.zone}
- Score composite : ${context.score}
- Confluence MTF : ${context.mtf}

Signal valide ?`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json' }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return { valid: true, reason: 'ollama_error' };
        const data = await res.json();
        const parsed = JSON.parse(data.response || '{}');
        return { valid: parsed.valid !== false, confidence: parsed.confidence, reason: parsed.reason };
    } catch {
        return { valid: true, reason: 'ollama_timeout' };
    }
}

// ── Tick Engine — Momentum naissant ───────────────────────────────
// Détecte le momentum NAISSANT (pas l'impulsion déjà partie)
// Logique : EMA9 du prix tick, delta volume, accélération du momentum

function updateTickState(symbol, price) {
    const s = tickState[symbol] || { prices: [], deltas: [], lastPrice: price };

    // Garde les 20 derniers prix tick (= 10s de données à 500ms)
    s.prices.push(price);
    if (s.prices.length > 20) s.prices.shift();

    // Delta momentum : différence entre prix actuel et prix il y a 10 ticks
    const ref = s.prices[Math.max(0, s.prices.length - 10)];
    const delta = ((price - ref) / ref) * 100;  // % de mouvement sur 5s

    s.deltas.push(delta);
    if (s.deltas.length > 10) s.deltas.shift();

    // Accélération : est-ce que le momentum s'ACCÉLÈRE ?
    const avgDelta = s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length;
    const acceleration = delta - avgDelta;  // positif = momentum qui s'accélère

    // EMA9 rapide sur les prix tick
    const alpha = 2 / (9 + 1);
    s.ema9 = s.ema9 ? s.ema9 * (1 - alpha) + price * alpha : price;

    // Momentum direction
    const momentumDir = delta > 0.005 ? 'bullish' : delta < -0.005 ? 'bearish' : 'neutral';
    const isAccelerating = Math.abs(acceleration) > 0.002;
    const priceAboveEma  = price > s.ema9;

    s.lastPrice     = price;
    s.delta         = delta;
    s.acceleration  = acceleration;
    s.momentumDir   = momentumDir;
    s.isAccelerating = isAccelerating;
    s.priceAboveEma  = priceAboveEma;

    tickState[symbol] = s;
    return s;
}

// ── Pre-Signal Alert ───────────────────────────────────────────────
// Émis 2-3 bougies AVANT le signal réel
// Donne au trader le temps de se préparer

function emitPreSignal(symbol, direction, price, reason, zoneInfo) {
    const now = Date.now();
    const ck  = `pre:${symbol}:${direction}`;
    if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_PRESIG_MS) return;
    cooldown[ck] = now;

    const dec = DECIMALS[symbol] ?? DECIMALS.default;
    const payload = {
        id:        `PRE-${symbol.replace('/', '')}-${now}`,
        symbol,
        direction,
        price:     +price.toFixed(dec),
        reason,
        zone:      zoneInfo || null,
        message:   `⚡ ${symbol} — ${direction} en préparation | ${reason}`,
        timestamp: now,
        type:      'pre_signal',
    };

    broadcast('pre_signal', payload);
    logger.info(`⚡ PRE-SIGNAL ${symbol} ${direction} | ${reason}`);
}

// ── Tick Scan (500ms) ─────────────────────────────────────────────
// Analyse légère et rapide — ne fait PAS l'analyse MTF complète
// But : détecter le momentum naissant et émettre des pre-signals

async function tickScan() {
    const { getPrice } = require('../services/priceAggregator');
    const { getCachedZones } = require('../services/zoneEngine');

    await Promise.allSettled(SYMBOLS.map(async (symbol) => {
        try {
            const priceData = await getPrice(symbol);
            const price = priceData?.price;
            if (!price || price <= 0) return;

            const tick = updateTickState(symbol, price);

            // Pas assez de données tick encore
            if (tick.prices.length < 10) return;

            // ── Détection momentum naissant ──────────────────────
            // Conditions pour un pre-signal :
            //  1. Momentum qui s'accélère dans une direction claire
            //  2. Prix proche d'une zone clé (dans les 1.5 ATR)
            //  3. Pas de signal market récent sur ce symbole

            const lastSig = lastSignals[symbol];
            const sigAge  = lastSig ? Date.now() - lastSig.timestamp : Infinity;
            if (sigAge < 5 * 60 * 1000) return; // signal récent → skip pre-signal

            // Vérifier si prix proche d'une zone (via cache zoneEngine)
            const cachedZoneData = getCachedZones(null, null, price, symbol);
            if (!cachedZoneData?.zones?.length) return;

            const nearZones = cachedZoneData.zones.filter(z =>
                z.status === 'approaching' && z.distATR < 1.5
            );
            if (!nearZones.length) return;

            const zone = nearZones[0];
            const expectedDir = zone.type === 'bullish' ? 'BUY' : 'SELL';

            // Momentum aligné avec la zone ET qui s'accélère
            const momentumAligned = (
                (expectedDir === 'BUY'  && tick.momentumDir === 'bullish' && tick.priceAboveEma) ||
                (expectedDir === 'SELL' && tick.momentumDir === 'bearish' && !tick.priceAboveEma)
            );

            if (momentumAligned && tick.isAccelerating) {
                emitPreSignal(
                    symbol,
                    expectedDir,
                    price,
                    `Zone ${zone.kind} à ${zone.distATR.toFixed(2)} ATR | momentum ${tick.momentumDir} accélérant`,
                    { kind: zone.kind, entry: zone.entry, distATR: zone.distATR }
                );
            }

        } catch { /* ignore tick errors */ }
    }));
}

// ── Scan complet d'un symbole (pipeline MARKET) ───────────────────

async function scanSymbol(symbol, dxyCandles, now) {
    const { getPriceHistory, getPrice } = require('../services/priceAggregator');

    // Prix live
    const priceData = await getPrice(symbol);
    const livePrice = priceData?.price;
    if (!livePrice || livePrice <= 0) return;

    // Candles M1
    const m1Hist = await getPriceHistory(symbol, '1min', 120);
    if (!m1Hist?.candles?.length || m1Hist.source === 'synthetic') return;
    const m1Candles = m1Hist.candles;

    // MTF en parallèle
    const [m15Result, h1Result] = await Promise.allSettled([
        getPriceHistory(symbol, '15min', 100),
        getPriceHistory(symbol, '1h',    100),
    ]);

    const m15Candles = m15Result.status === 'fulfilled' ? m15Result.value?.candles : null;
    const h1Candles  = h1Result.status  === 'fulfilled' ? h1Result.value?.candles  : null;
    const useDXY     = ['XAU/USD', 'EUR/USD', 'GBP/USD'].includes(symbol) ? dxyCandles : null;

    const m15Valid = m15Candles?.length > 10;
    const h1Valid  = h1Candles?.length  > 10;

    // Analyse stratégie
    const analysis = await analyze(m1Candles, symbol, {
        m15Candles: m15Valid ? m15Candles : null,
        h1Candles:  h1Valid  ? h1Candles  : null,
        dxyCandles: useDXY,
        livePrice,
    });

    if (!analysis || analysis.direction === 'HOLD') return;

    const { direction, score, confidence, signals, levels, kelly, mtf, smc, ict, volProfile, dxy, inZone } = analysis;

    if (volProfile?.gate === 'blocked_void') { logger.info(`⛔ ${symbol} bloqué — vide volume`); return; }
    if (mtf?.counterTrend) { logger.info(`⛔ ${symbol} bloqué — contre-tendance H1`); return; }
    if (mtf?.confluence === 'LOW' && !inZone) { logger.info(`⛔ ${symbol} bloqué — confluence faible`); return; }
    if (!levels || levels.rr < 1.5) return;

    const { sl, tp, rr, atr } = levels;
    if (direction === 'BUY'  && (sl >= livePrice || tp <= livePrice)) return;
    if (direction === 'SELL' && (sl <= livePrice || tp >= livePrice)) return;

    const ck = `${symbol}:${direction}`;
    if (cooldown[ck] && now - cooldown[ck] < COOLDOWN_MARKET_MS) return;

    // ── Validation Ollama (optionnelle, 2s max) ───────────────────
    let ollamaResult = { valid: true, reason: 'ollama_disabled' };
    if (OLLAMA_ENABLED) {
        ollamaResult = await ollamaValidate({
            symbol,
            direction,
            price:       livePrice,
            h1Structure: smc?.bias || 'unknown',
            momentum:    mtf?.tf1?.bias || 'unknown',
            zone:        inZone ? 'en zone' : 'hors zone',
            score,
            mtf:         mtf?.confluence,
        });
        if (!ollamaResult.valid) {
            logger.info(`🤖 Ollama a rejeté ${symbol} ${direction} — ${ollamaResult.reason}`);
            return;
        }
    }

    const dec = DECIMALS[symbol] ?? DECIMALS.default;
    const tick = tickState[symbol] || {};

    const sig = {
        id:             `${symbol.replace('/', '')}-${now}`,
        symbol,
        signal:         direction,
        orderType:      'MARKET',
        confidence:     ollamaResult.confidence || confidence,
        compositeScore: score,
        inZone:         inZone || false,
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
        regime:         mtf.tf1.regime || null,
        // Tick data (nouveau v10)
        tickMomentum:   tick.momentumDir || null,
        tickDelta:      tick.delta ? +tick.delta.toFixed(5) : null,
        tickAccel:      tick.isAccelerating || false,
        ollamaValidated: OLLAMA_ENABLED,
        ollamaReason:   ollamaResult.reason || null,
        strategy: {
            score, direction, signals: signals || [],
            smc: analysis.smc, ict: analysis.ict,
            mtf: { direction: mtf.direction, strength: mtf.strength, confluence: mtf.confluence, tf1: mtf.tf1, tf15: mtf.tf15, tf60: mtf.tf60 },
            volProfile, dxy,
            orderFlow: {
                buyPressure:  mtf.tf1.bull ? Math.round(mtf.tf1.bull / (mtf.tf1.bull + mtf.tf1.bear + 0.01) * 100) : 50,
                sellPressure: mtf.tf1.bear ? Math.round(mtf.tf1.bear / (mtf.tf1.bull + mtf.tf1.bear + 0.01) * 100) : 50,
                delta:        (mtf.tf1.bull || 0) - (mtf.tf1.bear || 0),
                imbalance:    mtf.tf1.bull > mtf.tf1.bear + 3 ? 'bullish' : mtf.tf1.bear > mtf.tf1.bull + 3 ? 'bearish' : 'neutral',
                momentum:     mtf.tf1.bias,
            },
        },
        atr:          +atr.toFixed(dec),
        candleSource: m1Hist.source,
        priceSource:  priceData.source,
        timestamp:    now,
        aiEngine:     'auto-v10',
        source:       'scheduler',
    };

    cooldown[ck]        = now;
    lastSignals[symbol] = sig;

    const sent = broadcastSignal(sig);
    telegram.sendSignal(sig).catch(() => {});

    logger.info(`✅ v10 ${symbol} ${direction}${inZone ? ' [IN ZONE]' : ''} | conf=${sig.confidence}% | score=${score} | RR=${rr.toFixed(2)} | MTF=${mtf.confluence}${OLLAMA_ENABLED ? ' | 🤖 Ollama ✓' : ''} | SL=${sl.toFixed(dec)} TP=${tp.toFixed(dec)} → ${sent} clients`);
}

function broadcastSignal(sig) {
    return broadcast('auto_signal', sig);
}

// ── Pipeline MARKET (60s) ─────────────────────────────────────────

async function generateAndBroadcast() {
    const { getPriceHistory } = require('../services/priceAggregator');
    const now = Date.now();

    let dxyCandles = null;
    try {
        const dxyHist = await getPriceHistory('USD/CHF', '1min', 60);
        dxyCandles = dxyHist?.candles || null;
    } catch { /* optionnel */ }

    const results = await Promise.allSettled(
        SYMBOLS.map(symbol => scanSymbol(symbol, dxyCandles, now))
    );

    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            logger.warn(`AutoSignal v10 erreur ${SYMBOLS[i]}`, { err: r.reason?.message });
        }
    });
}

// ── Lifecycle ─────────────────────────────────────────────────────

function registerClient(ws) {
    clients.add(ws);
    limitSignal.registerClient(ws);
}

function unregisterClient(ws) {
    clients.delete(ws);
    limitSignal.unregisterClient(ws);
}

function start(intervalMinutes = 1) {
    if (isRunning) stop();

    // Pipeline TICK : toutes les 500ms (momentum naissant)
    tickInterval = setInterval(tickScan, 500);

    // Pipeline MARKET : toutes les 60s (analyse complète)
    setTimeout(generateAndBroadcast, 3000);
    marketScheduler = setInterval(generateAndBroadcast, Math.max(1, intervalMinutes) * 60 * 1000);

    // Pipeline LIMIT : toutes les 10s
    limitSignal.start();

    isRunning = true;
    logger.info(`AutoSignal v10 démarré — TICK 500ms | MARKET ${intervalMinutes}min | LIMIT 10s | Ollama: ${OLLAMA_ENABLED ? `✅ ${OLLAMA_MODEL}` : '❌'}`);
    telegram.sendBotStatus(true, intervalMinutes).catch(() => {});
}

function stop() {
    if (marketScheduler) { clearInterval(marketScheduler); marketScheduler = null; }
    if (tickInterval)    { clearInterval(tickInterval);    tickInterval    = null; }
    limitSignal.stop();
    isRunning = false;
    telegram.sendBotStatus(false, 0).catch(() => {});
}

function getStatus() {
    return {
        running:         isRunning,
        version:         'v10',
        tickScanMs:      500,
        intervalMinutes: 1,
        limitScan:       '10s',
        ollamaEnabled:   OLLAMA_ENABLED,
        ollamaModel:     OLLAMA_MODEL,
        clients:         clients.size,
        modules:         ['TickEngine-500ms', 'PreSignal', 'MTF-M1/M15/H1', 'SMC', 'ICT', 'ZoneProximity', 'LimitSignal', 'VolumeProfile', 'DXY', 'Kelly', 'Ollama'],
        limitSignalStatus: limitSignal.getStatus(),
        lastSignals:     Object.entries(lastSignals).map(([s, sig]) => ({
            symbol: s, signal: sig.signal, entry: sig.entry,
            sl: sig.stopLoss, tp: sig.takeProfit, rr: sig.rr,
            mtf: sig.mtfConfluence, inZone: sig.inZone,
            tickMomentum: sig.tickMomentum,
            ageMin: Math.round((Date.now() - sig.timestamp) / 60000),
        })),
    };
}

module.exports = { registerClient, unregisterClient, start, stop, getStatus };