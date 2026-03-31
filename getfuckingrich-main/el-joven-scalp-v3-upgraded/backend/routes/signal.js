'use strict';
/**
 * Signal Route v3 — El Joven Scalp PRO
 * =======================================
 * POST /api/signal
 *
 * Pipeline :
 *   1. News filter macro (±15min)
 *   2. Spread filter
 *   3. Prix live Binance
 *   4. Candles M1 + M15 + H1
 *   5. DXY pour actifs corrélés
 *   6. strategyEngine.analyze() — MTF + SMC + ICT + HLZ + VolProfile + DXY
 *   7. Volume Profile gate
 *   8. MTF gate (contre-tendance bloquée)
 *   9. SL/TP structurels
 *  10. AI overlay (Gemini/Grok) — valide ou ajuste les niveaux
 *  11. Kelly Criterion → sizing
 *  12. Persist en DB
 */

const { Router } = require('express');
const { getPrice, getPriceHistory } = require('../services/priceAggregator');
const { analyze } = require('../services/strategyEngine');
const { validate, schemas } = require('../utils/validation');
const db     = require('../utils/db');
const logger = require('../utils/logger');
const { rateLimit } = require('../utils/rateLimit');
const telegram = require('../services/telegram');
const router = Router();

const DXY_SYMBOLS = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'AUD/USD'];
const DECIMALS    = { 'BTC/USD': 0, 'ETH/USD': 2, 'XAU/USD': 2, 'EUR/USD': 5, 'GBP/USD': 5, default: 2 };

// ── NEWS FILTER ───────────────────────────────────────────────────
const SYMBOL_CCY = {
    'XAU/USD': 'XAU', 'BTC/USD': 'BTC', 'ETH/USD': 'BTC',
    'EUR/USD': 'EUR', 'GBP/USD': 'GBP', 'USD/JPY': 'JPY',
    'NAS100/USD': 'USD', 'SPX500/USD': 'USD',
};
const HIGH_IMPACT_PATTERNS = [
    { p: /non.farm|nfp/i,             c: ['USD', 'XAU', 'BTC'] },
    { p: /cpi|inflation/i,             c: ['USD', 'EUR', 'GBP', 'XAU'] },
    { p: /fomc|fed|federal reserve/i,  c: ['USD', 'XAU', 'BTC'] },
    { p: /ecb|european central/i,      c: ['EUR', 'GBP'] },
    { p: /rate decision|interest rate/i,c:['USD', 'EUR', 'GBP', 'JPY', 'XAU'] },
];
let newsCache = null, newsCacheTs = 0;

async function getNewsFilter(symbol) {
    const now = Date.now();
    if (!newsCache || now - newsCacheTs > 600000) {
        try {
            let f; try { f = (await import('node-fetch')).default; } catch { f = require('node-fetch'); }
            const r = await f('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { signal: AbortSignal.timeout(3000) });
            if (r.ok) { newsCache = (await r.json()).filter(e => e.impact === 'High'); newsCacheTs = now; }
        } catch { newsCache = []; newsCacheTs = now; }
    }
    const ccy = SYMBOL_CCY[symbol] || 'USD';
    for (const ev of (newsCache || [])) {
        const ts = new Date(ev.date).getTime();
        if (Math.abs(now - ts) < 15 * 60 * 1000) {
            const rel = HIGH_IMPACT_PATTERNS.some(e => e.p.test(ev.title) && e.c.includes(ccy)) || ev.currency === ccy;
            if (rel) return { blocked: true, reason: `⚠️ News macro dans ${Math.round((ts - now) / 60000)}min : ${ev.title}` };
        }
    }
    return { blocked: false };
}

// ── AI ENGINES ────────────────────────────────────────────────────
const AI_ENGINES = {
    gemini:     () => require('../services/gemini'),
    grok:       () => require('../services/grok'),
    mistral:    () => require('../services/mistral'),
    openrouter: () => require('../services/openrouter'),
};
function getActiveEngine() {
    const k = { gemini: process.env.GEMINI_API_KEY, grok: process.env.GROK_API_KEY, mistral: process.env.MISTRAL_API_KEY, openrouter: process.env.OPENROUTER_API_KEY };
    return ['gemini', 'grok', 'mistral', 'openrouter'].find(n => k[n]) || null;
}

// ── PERSIST ───────────────────────────────────────────────────────
async function persistSignal(symbol, timeframe, result, indicators, strategyData, engine) {
    if (!db.isReady()) return;
    try {
        await db.query(
            `INSERT INTO signal_history (symbol,timeframe,signal,confidence,composite_score,entry_price,stop_loss,take_profit,rr,ai_engine,reasoning,indicators,strategy_data)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [symbol, timeframe, result.signal, result.confidence || 0, result.compositeScore || 0,
             result.entry || 0, result.stopLoss || 0, result.takeProfit || 0, result.rr || 0,
             engine || 'technical', result.reasoning || '', JSON.stringify(indicators || {}), JSON.stringify(strategyData || {})]
        );
    } catch (e) { logger.warn('Signal persist', { err: e.message }); }
}

// ── BUILD HELPERS ────────────────────────────────────────────────
// buildIndicators : construit l'objet indicators pour le frontend (IndicatorsPanel)
function buildIndicators(mtf, atrVal) {
    if (!mtf) return {};
    const tf1 = mtf.tf1 || {};
    return {
        rsi:          tf1.rsi           ?? null,
        atr:          atrVal            ?? tf1.atr ?? null,
        ema9:         tf1.ema9          ?? null,
        ema21:        tf1.ema21         ?? null,
        ema50:        tf1.ema50         ?? null,
        macdLine:     tf1.macdLine      ?? null,
        macdSignal:   tf1.macdSignal    ?? null,
        macdHistogram:tf1.macdHistogram ?? null,
        bbUpper:      tf1.bbUpper       ?? null,
        bbMiddle:     tf1.bbMiddle      ?? null,
        bbLower:      tf1.bbLower       ?? null,
        stochRsi:     tf1.stochRsi      ?? null,
        vwap:         tf1.vwap          ?? null,
        obv:          tf1.obv           ?? null,
        cvd:          tf1.cvd           ?? null,
        volumeProfile:null,
        adx:          tf1.adx           ?? null,
        supertrend:   tf1.supertrend ? {
            signal:    tf1.supertrend.direction === 'bullish' ? 'BUY' : 'SELL',
            direction: tf1.supertrend.direction,
            slLevel:   tf1.supertrend.slLevel,
            crossed:   tf1.supertrend.crossed,
        } : null,
        bbSqueeze:    null,
        // Indicateurs avancés v4
        ichimoku:     tf1.ichimoku   ?? null,
        divergence:   tf1.divergence ?? null,
        fibonacci:    tf1.fibonacci  ?? null,
        regime:       tf1.regime     ?? null,
        rsiDivergence: tf1.divergence ? {
            signal: tf1.divergence.type?.includes('bullish') ? 'BULLISH' : tf1.divergence.type?.includes('bearish') ? 'BEARISH' : null,
            desc:   tf1.divergence.desc,
        } : null,
    };
}

// buildStrategy : construit l'objet strategy complet pour StrategyPanel / CompositeScorePanel
function buildStrategy(score, direction, signals, smc, ict, hlz, volProfile, dxy, mtf, marketStructure) {
    if (!mtf) return null;
    const tf1 = mtf.tf1 || {};
    return {
        score,
        direction,
        signals: signals || [],
        smc: smc ? {
            bias:           smc.bias,
            bos:            smc.bos            || null,
            choch:          smc.choch          || null,
            mss:            smc.mss            || null,
            orderBlocks:    smc.orderBlocks    || [],
            fvg:            smc.fvg            || [],
            inducement:     smc.inducement     || null,
            liquiditySweep: smc.liquiditySweep || null,
        } : {},
        ict: ict ? {
            killZone:        ict.killZone        || null,
            nextKillZone:    ict.nextKillZone    || null,
            ote:             ict.ote             || null,
            premiumDiscount: ict.premiumDiscount || null,
            pdArray:         ict.pdArray         || [],
        } : {},
        hlz: hlz ? {
            nearestSupport:    hlz.nearestSupport    || null,
            nearestResistance: hlz.nearestResistance || null,
            supports:          hlz.supports          || [],
            resistances:       hlz.resistances       || [],
        } : {},
        orderFlow: {
            buyPressure:  tf1.bull ? Math.round(tf1.bull / (tf1.bull + tf1.bear + 0.01) * 100) : 50,
            sellPressure: tf1.bear ? Math.round(tf1.bear / (tf1.bull + tf1.bear + 0.01) * 100) : 50,
            delta:        (tf1.bull || 0) - (tf1.bear || 0),
            imbalance:    tf1.bull > tf1.bear + 3 ? 'bullish' : tf1.bear > tf1.bull + 3 ? 'bearish' : 'neutral',
            momentum:     tf1.bias,
        },
        mtf: {
            direction:    mtf.direction,
            strength:     mtf.strength,
            confluence:   mtf.confluence,
            counterTrend: mtf.counterTrend,
            tf1:          mtf.tf1,
            tf15:         mtf.tf15,
            tf60:         mtf.tf60,
        },
        adx:        tf1.adx        || null,
        fibonacci:  tf1.fibonacci  || null,
        regime:     tf1.regime     || null,
        ichimoku:   tf1.ichimoku   || null,
        supertrend: tf1.supertrend || null,
        divergence: tf1.divergence || null,
        rejection:  tf1.rejection  || null,
        volProfile:  volProfile    || null,
        dxy:         dxy           || null,
        mss:         smc?.mss      || null,
        premiumDiscount: ict?.premiumDiscount || null,
        nextKillZone:    ict?.nextKillZone    || null,
        marketStructure: marketStructure      || null,
    };
}

// ── POST /api/signal ──────────────────────────────────────────────
router.post('/', rateLimit({ windowMs: 10000, max: 50, key: 'signal' }), validate(schemas.signalSchema), async (req, res) => {
    const { symbol, timeframe, ai } = req.body;

    try {
        // 1. News filter
        const news = await getNewsFilter(symbol);
        if (news.blocked) {
            return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: 0, entry: 0, stopLoss: 0, takeProfit: 0, rr: 0, reasoning: news.reason, newsBlocked: true, timestamp: Date.now(), aiEngine: 'news-filter', indicators: buildIndicators(null, null), strategy: null });
        }

        // 2. Prix live
        const priceData = await getPrice(symbol);
        const livePrice = priceData?.price;
        if (!livePrice) return res.status(500).json({ success: false, error: 'Prix indisponible' });

        // 3. Spread filter
        if (priceData.ask && priceData.bid) {
            const spreadPct = (priceData.ask - priceData.bid) / livePrice;
            if (spreadPct > 0.003) {
                return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: 0, entry: livePrice, stopLoss: 0, takeProfit: 0, rr: 0, reasoning: `⚠️ Spread ${(spreadPct * 100).toFixed(3)}% trop élevé`, timestamp: Date.now(), aiEngine: 'spread-filter', indicators: buildIndicators(null, null), strategy: null });
            }
        }

        // 4. Candles M1
        let m1Candles = [];
        try { m1Candles = (await getPriceHistory(symbol, timeframe, 120))?.candles || []; } catch {}

        // 5. MTF candles
        let m15Candles = null, h1Candles = null;
        try { m15Candles = (await getPriceHistory(symbol, '15min', 100))?.candles; } catch {}
        try { h1Candles  = (await getPriceHistory(symbol, '1h',    100))?.candles; } catch {}

        // 6. DXY
        let dxyCandles = null;
        if (DXY_SYMBOLS.includes(symbol)) {
            try { dxyCandles = (await getPriceHistory('USD/CHF', '1min', 60))?.candles; } catch {}
        }

        // 7. Analyse complète
        // Validation par intervalle entre candles (fiable même si Yahoo donne même timestamp)
        const m1Interval  = m1Candles.length  >= 2 ? m1Candles[1].time  - m1Candles[0].time  : 60;
        const m15Interval = m15Candles && m15Candles.length >= 2 ? m15Candles[1].time - m15Candles[0].time : 0;
        const h1Interval  = h1Candles  && h1Candles.length  >= 2 ? h1Candles[1].time  - h1Candles[0].time  : 0;
        // M15 valide si intervalle ≥ 5min (300s)
        const m15Valid = m15Candles && m15Candles.length > 10 && m15Interval >= 300;
        // H1 valide si intervalle ≥ 30min (1800s)
        const h1Valid  = h1Candles  && h1Candles.length  > 10 && h1Interval  >= 1800;
        if (!m15Valid) logger.warn(`⚠️ M15 invalide ${symbol} (interval=${m15Interval}s)`);
        if (!h1Valid)  logger.warn(`⚠️ H1 invalide  ${symbol} (interval=${h1Interval}s)`);
        const analysis = await analyze(m1Candles, symbol, {
            m15Candles: m15Valid ? m15Candles : null,
            h1Candles:  h1Valid  ? h1Candles  : null,
            dxyCandles, livePrice
        });

        const dec = DECIMALS[symbol] ?? DECIMALS.default;

        if (!analysis) {
            return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: 0, entry: +livePrice.toFixed(dec), stopLoss: 0, takeProfit: 0, rr: 0, reasoning: 'Données insuffisantes', timestamp: Date.now(), aiEngine: 'technical', indicators: buildIndicators(null, null), strategy: null });
        }

        const { direction, score, confidence, signals, levels, kelly, mtf, smc, ict, hlz, volProfile, dxy, marketStructure } = analysis;

        // atrVal disponible dès ici (levels peut être null si HOLD)
        const atrVal = levels?.atr ?? mtf?.tf1?.atr ?? 0;

        // 8. Volume Profile gate
        if (volProfile?.gate === 'blocked_void') {
            return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: 0, entry: +livePrice.toFixed(dec), stopLoss: 0, takeProfit: 0, rr: 0, compositeScore: score, reasoning: `⚠️ Vide de volume — attendre retour au POC (${volProfile.poc?.toFixed(dec)})`, volProfile, timestamp: Date.now(), aiEngine: 'volume-gate', indicators: buildIndicators(mtf, atrVal), strategy: buildStrategy(score, direction, signals, smc, ict, hlz, volProfile, dxy, mtf, marketStructure) });
        }

        // 9. MTF gate
        if (mtf?.counterTrend && mtf?.hasH1) {
            return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: 0, entry: +livePrice.toFixed(dec), stopLoss: 0, takeProfit: 0, rr: 0, compositeScore: score, reasoning: `⚠️ Contre-tendance H1 — M1:${mtf.tf1.bias} vs H1:${mtf.tf60.bias}`, mtf, timestamp: Date.now(), aiEngine: 'mtf-gate', indicators: buildIndicators(mtf, atrVal), strategy: buildStrategy(score, direction, signals, smc, ict, hlz, volProfile, dxy, mtf, marketStructure) });
        }

        // Log détaillé pour diagnostiquer les signaux
        logger.info(`📊 SIGNAL CALC ${symbol}`, {
            score, direction, confidence,
            majorConf: analysis.majorConfirmations || 0,
            mtf: `${mtf.tf1.bias}/${mtf.tf15?.bias||'?'}/${mtf.tf60?.bias||'?'}`,
            confluence: mtf.confluence,
            vetoes: signals.filter(s => s.startsWith('⛔')).length,
            rr: levels?.rr,
            m15ok: !!(m15Valid), h1ok: !!(h1Valid),
        });

        // 10. HOLD final
        if (direction === 'HOLD' || !levels || levels.rr < 1.5) {
            const reason = direction === 'HOLD'
                ? `Score ${score} — confluence insuffisante (MTF: ${mtf?.confluence})`
                : `RR ${levels?.rr?.toFixed(2)} < 1.5 minimum`;
            return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: 0, entry: +livePrice.toFixed(dec), stopLoss: 0, takeProfit: 0, rr: 0, compositeScore: score, reasoning: reason, mtf, volProfile, timestamp: Date.now(), aiEngine: 'technical', indicators: buildIndicators(mtf, atrVal), strategy: buildStrategy(score, direction, signals, smc, ict, hlz, volProfile, dxy, mtf, marketStructure) });
        }

        let { sl, tp, rr } = levels;
        let finalSignal   = direction;
        let finalReasoning = signals.slice(0, 5).join(' | ');
        let engineUsed    = 'technical-v3';

        // 11. AI overlay
        const engineName = ai === 'auto' ? getActiveEngine() : (AI_ENGINES[ai] ? ai : getActiveEngine());
        if (engineName && AI_ENGINES[engineName]) {
            try {
                const engine = AI_ENGINES[engineName]();
                const aiRes  = await engine.analyzeMarket({
                    symbol, timeframe, price: livePrice,
                    indicators: { rsi: mtf.tf1.rsi, atr: atrVal, ema9: mtf.tf1.ema9 },
                    compositeScore: score,
            majorConfirmations: analysis.majorConfirmations || 0,
                    strategy: { direction, mtf: mtf, smc, ict, signals },
                });
                if (aiRes && aiRes.signal !== 'HOLD' && aiRes.signal === direction) {
                    // AI confirme la direction — utilise ses niveaux si valides
                    if (aiRes.stopLoss && aiRes.takeProfit) {
                        const isBuy  = aiRes.signal === 'BUY';
                        const slOk   = isBuy ? aiRes.stopLoss < livePrice : aiRes.stopLoss > livePrice;
                        const tpOk   = isBuy ? aiRes.takeProfit > livePrice : aiRes.takeProfit < livePrice;
                        const rrAI   = Math.abs(aiRes.takeProfit - livePrice) / Math.abs(aiRes.stopLoss - livePrice);
                        if (slOk && tpOk && rrAI >= 1.5) {
                            sl  = aiRes.stopLoss;
                            tp  = aiRes.takeProfit;
                            rr  = +rrAI.toFixed(2);
                            if (aiRes.reasoning) finalReasoning = aiRes.reasoning;
                            engineUsed = engineName;
                        }
                    }
                } else if (aiRes && aiRes.signal === 'HOLD') {
                    // AI doute → on reste en HOLD
                    return res.json({ success: true, symbol, timeframe, signal: 'HOLD', confidence: Math.round(confidence * 0.6), entry: +livePrice.toFixed(dec), stopLoss: 0, takeProfit: 0, rr: 0, compositeScore: score, reasoning: `${engineName} HOLD : ${aiRes.reasoning || 'Structure incertaine'}`, mtf, timestamp: Date.now(), aiEngine: engineName, indicators: buildIndicators(mtf, atrVal), strategy: buildStrategy(score, direction, signals, smc, ict, hlz, volProfile, dxy, mtf, marketStructure) });
                }
            } catch (err) {
                logger.warn(`AI ${engineName} error`, { err: err.message });
            }
        }

        // 12. Construction réponse finale
        const finalResult = {
            success:       true,
            symbol,
            timeframe,
            signal:        finalSignal,
            confidence,
            compositeScore: score,
            entry:         +livePrice.toFixed(dec),
            stopLoss:      +sl.toFixed(dec),
            takeProfit:    +tp.toFixed(dec),
            rr:            +rr.toFixed(2),
            reasoning:     finalReasoning,
            // Kelly
            kellySafe:     kelly?.kellySafe || null,
            kellyNote:     kelly?.riskNote || null,
            // MTF
            mtfConfluence: mtf.confluence,
            mtfDirection:  mtf.direction,
            tf1Bias:       mtf.tf1.bias,
            tf15Bias:      mtf.tf15.bias,
            tf60Bias:      mtf.tf60.bias,
            // SMC
            smcBias:       smc.bias,
            inducement:    smc.inducement?.desc || null,
            liquiditySweep:smc.liquiditySweep?.desc || null,
            // ICT
            killZone:      ict.killZone?.name || null,
            ote:           ict.ote?.type || null,
            // Volume
            poc:           volProfile?.poc ? +volProfile.poc.toFixed(dec) : null,
            vwap:          volProfile?.vwap ? +volProfile.vwap.toFixed(dec) : null,
            nearPOC:       volProfile?.nearPOC,
            // DXY
            dxyBias:       dxy?.dxyBias || null,
            // Indicateurs pour IndicatorsPanel
            indicators: buildIndicators(mtf, atrVal),
            // Nouveaux champs v4
            marketStructure: marketStructure || null,
            mss:             smc.mss         || null,
            premiumDiscount: ict.premiumDiscount || null,
            nextKillZone:    ict.nextKillZone    || null,
            adx:             mtf.tf1.adx         || null,
            adxH1:           mtf.tf60.adx        || null,
            fibonacci:       mtf.tf1.fibonacci   || null,
            regime:          mtf.tf1.regime      || null,
            // Meta
            atr:           +atrVal.toFixed(dec),
            levelsFixed:   true,
            price:         livePrice,
            timestamp:     Date.now(),
            aiEngine:      engineUsed,
            // Données complètes pour StrategyPanel
            strategy: {
                score,
                direction:  finalSignal,
                signals:    signals || [],
                smc: {
                    bias:           smc.bias,
                    bos:            smc.bos            || null,
                    choch:          smc.choch          || null,
                    mss:            smc.mss            || null,
                    orderBlocks:    smc.orderBlocks    || [],
                    fvg:            smc.fvg            || [],
                    inducement:     smc.inducement     || null,
                    liquiditySweep: smc.liquiditySweep || null,
                },
                ict: {
                    killZone:       ict.killZone        || null,
                    nextKillZone:   ict.nextKillZone    || null,
                    ote:            ict.ote             || null,
                    premiumDiscount:ict.premiumDiscount || null,
                    pdArray:        ict.pdArray         || [],
                },
                hlz: {
                    nearestSupport:    hlz.nearestSupport    || null,
                    nearestResistance: hlz.nearestResistance || null,
                    supports:          hlz.supports          || [],
                    resistances:       hlz.resistances       || [],
                },
                orderFlow: {
                    buyPressure:  mtf.tf1.bull ? Math.round(mtf.tf1.bull / (mtf.tf1.bull + mtf.tf1.bear + 0.01) * 100) : 50,
                    sellPressure: mtf.tf1.bear ? Math.round(mtf.tf1.bear / (mtf.tf1.bull + mtf.tf1.bear + 0.01) * 100) : 50,
                    delta:        (mtf.tf1.bull || 0) - (mtf.tf1.bear || 0),
                    imbalance:    mtf.tf1.bull > mtf.tf1.bear + 3 ? 'bullish' : mtf.tf1.bear > mtf.tf1.bull + 3 ? 'bearish' : 'neutral',
                    momentum:     mtf.tf1.bias,
                    absorption:   false,
                },
                mtf: {
                    direction:    mtf.direction,
                    strength:     mtf.strength,
                    confluence:   mtf.confluence,
                    counterTrend: mtf.counterTrend,
                    tf1:          mtf.tf1,
                    tf15:         mtf.tf15,
                    tf60:         mtf.tf60,
                },
                // Nouveaux outils v4
                adx:       mtf.tf1.adx       || null,
                fibonacci: mtf.tf1.fibonacci  || null,
                regime:    mtf.tf1.regime     || null,
                ichimoku:  mtf.tf1.ichimoku   || null,
                supertrend:mtf.tf1.supertrend || null,
                divergence:mtf.tf1.divergence || null,
                rejection: mtf.tf1.rejection  || null,
                volProfile,
                dxy,
                marketStructure: marketStructure || null,
                mss:             smc.mss         || null,
                premiumDiscount: ict.premiumDiscount || null,
                nextKillZone:    ict.nextKillZone    || null,
            },
        };

        persistSignal(symbol, timeframe, finalResult, { rsi: mtf.tf1.rsi, atr: atrVal }, analysis, engineUsed).catch(() => {});

        // Telegram — envoie le signal si configuré
        telegram.sendSignal({ ...finalResult, source: 'manual' }).catch(() => {});
        return res.json(finalResult);

    } catch (err) {
        logger.error('Signal route error', { err: err.message, stack: err.stack });
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/signal/engines ───────────────────────────────────────
router.get('/engines', (_req, res) => {
    res.json({
        success: true,
        version: 'v3',
        modules: ['MTF-M1/M15/H1', 'SMC+ICT+HLZ', 'VolumeProfile+POC', 'DXY-Correlation', 'Kelly-Criterion', 'NewsFilter'],
        engines: {
            gemini:     { configured: !!process.env.GEMINI_API_KEY },
            grok:       { configured: !!process.env.GROK_API_KEY },
            mistral:    { configured: !!process.env.MISTRAL_API_KEY },
            openrouter: { configured: !!process.env.OPENROUTER_API_KEY },
        },
        active: getActiveEngine(),
    });
});

// ── GET /api/signal/history ───────────────────────────────────────
router.get('/history', async (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const symbol = req.query.symbol;
    try {
        if (db.isReady()) {
            const params = symbol ? [symbol, limit] : [limit];
            const where  = symbol ? 'WHERE symbol = $1' : '';
            const lParam = symbol ? '$2' : '$1';
            const rows   = await db.query(`SELECT id,symbol,timeframe,signal,confidence,composite_score,entry_price,stop_loss,take_profit,rr,ai_engine,reasoning,created_at FROM signal_history ${where} ORDER BY created_at DESC LIMIT ${lParam}`, params);
            return res.json({ success: true, signals: rows.rows });
        }
        return res.json({ success: true, signals: [], note: 'PostgreSQL requis' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;