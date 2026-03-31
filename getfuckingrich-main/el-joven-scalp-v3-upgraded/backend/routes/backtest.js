'use strict';
/**
 * Market Analysis Route — El Joven Scalp PRO
 * ============================================
 * POST /api/backtest
 *
 * Analyse technique complète du passé pour prévoir l'avenir :
 *   1. Structure de marché (HH/HL/LH/LL) — tendance actuelle
 *   2. Niveaux clés (supports/résistances testés plusieurs fois)
 *   3. Momentum (RSI, MACD, StochRSI) — où en est l'élan
 *   4. Volume Profile (POC, HVN, LVN) — zones institutionnelles
 *   5. Ichimoku — nuage futur (Senkou projeté 26 bougies)
 *   6. SuperTrend — direction et SL dynamique
 *   7. Divergences — signaux de retournement
 *   8. Régime de marché (tendance / range / volatile)
 *   9. Scénarios probables (bullish / bearish / neutre + probabilités)
 *  10. Niveaux cibles (supports/résistances projetés)
 */

const { Router } = require('express');
const { getPriceHistory } = require('../services/priceAggregator');
const {
    calcRSI, calcEMA, calcATR, calcMACD, calcBollingerBands,
    calcVWAP, calcStochRSI, calcOBV, calcCVD, calcVolumeProfile,
    swingPoints, calcIchimoku, calcSuperTrend, detectDivergences, detectRejectionCandles,
} = require('../utils/indicators');
const logger = require('../utils/logger');
const router = Router();

// ── STRUCTURE DE MARCHÉ ───────────────────────────────────────────
function analyzeMarketStructure(candles) {
    const { highs, lows } = swingPoints(candles, 3);
    if (highs.length < 2 || lows.length < 2) return { trend: 'undetermined', description: 'Pas assez de données' };

    const recentHighs = highs.slice(-4);
    const recentLows  = lows.slice(-4);

    // Séquence HH + HL = tendance haussière
    const hhCount = recentHighs.slice(1).filter((h, i) => h.price > recentHighs[i].price).length;
    const hlCount = recentLows.slice(1).filter((l, i) => l.price > recentLows[i].price).length;
    const llCount = recentLows.slice(1).filter((l, i) => l.price < recentLows[i].price).length;
    const lhCount = recentHighs.slice(1).filter((h, i) => h.price < recentHighs[i].price).length;

    let trend = 'range';
    let strength = 'weak';
    let description = '';

    if (hhCount >= 2 && hlCount >= 2) {
        trend = 'bullish'; strength = 'strong';
        description = `Tendance haussière établie — ${hhCount} Higher Highs, ${hlCount} Higher Lows`;
    } else if (llCount >= 2 && lhCount >= 2) {
        trend = 'bearish'; strength = 'strong';
        description = `Tendance baissière établie — ${llCount} Lower Lows, ${lhCount} Lower Highs`;
    } else if (hhCount >= 1 && hlCount >= 1) {
        trend = 'bullish'; strength = 'moderate';
        description = 'Structure haussière en formation — Higher Highs + Higher Lows';
    } else if (llCount >= 1 && lhCount >= 1) {
        trend = 'bearish'; strength = 'moderate';
        description = 'Structure baissière en formation — Lower Lows + Lower Highs';
    } else {
        trend = 'range';
        description = 'Marché en range — structure indécise';
    }

    // Derniers swing pour bornes actuelles
    const lastHigh = recentHighs[recentHighs.length - 1];
    const lastLow  = recentLows[recentLows.length - 1];

    return { trend, strength, description, lastHigh, lastLow, hhCount, hlCount, llCount, lhCount };
}

// ── RÉGIME DE MARCHÉ ─────────────────────────────────────────────
function detectMarketRegime(candles) {
    const atrVal = calcATR(candles, 14);
    const closes = candles.map(c => c.close);
    const price  = closes[closes.length - 1];

    // ATR relatif vs moyenne sur 50 bougies
    const atrHistory = [];
    for (let i = 20; i < candles.length; i++) {
        atrHistory.push(calcATR(candles.slice(0, i), 14));
    }
    const avgATR = atrHistory.reduce((a, b) => a + b, 0) / atrHistory.length;
    const atrRatio = atrVal / avgATR;

    // Range vs trending via ADX simplifié
    const bb  = calcBollingerBands(closes, 20);
    const bbWidth = (bb.upper - bb.lower) / bb.middle * 100;

    let regime = 'trending';
    let volatility = 'normal';
    let description = '';

    if (atrRatio > 1.5) { volatility = 'high'; }
    else if (atrRatio < 0.7) { volatility = 'low'; }

    if (bbWidth < 1.5) {
        regime = 'compression'; // Squeeze → breakout imminent
        description = '⚡ Compression de volatilité — breakout imminent dans les 2 prochaines sessions';
    } else if (bbWidth > 5) {
        regime = 'expansion';
        description = '📈 Expansion de volatilité — tendance forte en cours, suivre la direction';
    } else if (atrRatio < 0.8) {
        regime = 'range';
        description = '📊 Marché en range — acheter support, vendre résistance';
    } else {
        regime = 'trending';
        description = '🎯 Marché en tendance — trader dans la direction principale uniquement';
    }

    return { regime, volatility, bbWidth: +bbWidth.toFixed(2), atrRatio: +atrRatio.toFixed(2), atr: +atrVal.toFixed(5), description };
}

// ── NIVEAUX CLÉS ─────────────────────────────────────────────────
function findKeyLevels(candles, livePrice) {
    const ATR = calcATR(candles, 14);
    const { highs, lows } = swingPoints(candles, 3);

    // Clusters de niveaux (plusieurs touches = niveau fort)
    const allLevels = [
        ...highs.map(h => ({ price: h.price, type: 'resistance', touches: 1 })),
        ...lows.map(l => ({ price: l.price, type: 'support', touches: 1 })),
    ];

    // Merge les niveaux proches
    const merged = [];
    for (const lvl of allLevels) {
        const existing = merged.find(m => Math.abs(m.price - lvl.price) < ATR * 0.8);
        if (existing) { existing.touches++; existing.price = (existing.price + lvl.price) / 2; }
        else merged.push({ ...lvl });
    }

    // Ajouter niveaux ronds psychologiques
    const round = livePrice > 10000 ? 1000 : livePrice > 1000 ? 100 : livePrice > 100 ? 10 : 1;
    for (let r = Math.floor(livePrice / round - 3) * round; r <= Math.ceil(livePrice / round + 3) * round; r += round) {
        if (Math.abs(r - livePrice) < ATR * 5) {
            merged.push({ price: r, type: r > livePrice ? 'resistance' : 'support', touches: 3, isRound: true });
        }
    }

    const supports    = merged.filter(l => l.type === 'support'    && l.price < livePrice).sort((a, b) => b.price - a.price).slice(0, 5);
    const resistances = merged.filter(l => l.type === 'resistance' && l.price > livePrice).sort((a, b) => a.price - b.price).slice(0, 5);

    // Distance en ATR pour évaluer la proximité
    return {
        supports:    supports.map(l => ({ ...l, distATR: +((livePrice - l.price) / ATR).toFixed(1) })),
        resistances: resistances.map(l => ({ ...l, distATR: +((l.price - livePrice) / ATR).toFixed(1) })),
        nearestSupport:    supports[0]    || null,
        nearestResistance: resistances[0] || null,
    };
}

// ── SCÉNARIOS FUTURS ─────────────────────────────────────────────
function buildScenarios(structure, regime, indicators, levels, divergence, ichimoku, supertrend, rejection, volProfile, livePrice) {
    const ATR = indicators.atr;

    // Score haussier
    let bullScore = 0, bearScore = 0;
    if (structure.trend === 'bullish')        { bullScore += structure.strength === 'strong' ? 3 : 2; }
    if (structure.trend === 'bearish')        { bearScore += structure.strength === 'strong' ? 3 : 2; }
    if (indicators.rsi < 35)                  { bullScore += 2; }
    if (indicators.rsi > 65)                  { bearScore += 2; }
    if (indicators.macd.histogram > 0)        { bullScore += 1; }
    if (indicators.macd.histogram < 0)        { bearScore += 1; }
    if (supertrend?.direction === 'bullish')  { bullScore += 2; }
    if (supertrend?.direction === 'bearish')  { bearScore += 2; }
    if (supertrend?.crossed)                  { if (supertrend.direction === 'bullish') bullScore += 2; else bearScore += 2; }
    if (ichimoku?.bias === 'bullish')         { bullScore += 3; }
    if (ichimoku?.bias === 'bearish')         { bearScore += 3; }
    if (ichimoku?.aboveCloud)                 { bullScore += 1; }
    if (ichimoku?.belowCloud)                 { bearScore += 1; }
    if (divergence?.rsi?.type === 'bullish_regular') { bullScore += 4; }
    if (divergence?.rsi?.type === 'bearish_regular') { bearScore += 4; }
    if (volProfile?.skew === 'BUY')           { bullScore += 1; }
    if (volProfile?.skew === 'SELL')          { bearScore += 1; }
    if (indicators.stochRsi?.signal === 'BULLISH') { bullScore += 2; }
    if (indicators.stochRsi?.signal === 'BEARISH') { bearScore += 2; }
    if (rejection) {
        for (const r of rejection) {
            if (r.signal === 'BUY'  && r.strength === 'high') bullScore += 2;
            if (r.signal === 'SELL' && r.strength === 'high') bearScore += 2;
        }
    }

    const total = bullScore + bearScore || 1;
    const bullPct = Math.round(bullScore / total * 100);
    const bearPct = Math.round(bearScore / total * 100);

    const nearR = levels.nearestResistance?.price;
    const nearS = levels.nearestSupport?.price;

    const scenarios = [
        {
            name: 'Scénario Haussier',
            probability: bullPct,
            color: 'buy',
            condition: `RSI ${indicators.rsi.toFixed(0)} ${indicators.rsi < 50 ? '— momentum à reconstruire' : '— momentum favorable'}, ${ichimoku?.aboveCloud ? 'au-dessus du nuage Ichimoku' : 'Ichimoku neutre'}`,
            targets: nearR ? [
                { label: 'TP1', price: +(nearR).toFixed(5),                         distPct: +((nearR - livePrice) / livePrice * 100).toFixed(2) },
                { label: 'TP2', price: +(levels.resistances[1]?.price || nearR + ATR * 3).toFixed(5), distPct: +((( levels.resistances[1]?.price || nearR + ATR * 3) - livePrice) / livePrice * 100).toFixed(2) },
            ] : [{ label: 'TP1', price: +(livePrice + ATR * 2).toFixed(5), distPct: +((ATR * 2 / livePrice) * 100).toFixed(2) }],
            invalidation: nearS ? `Clôture sous ${nearS.toFixed(5)} invalide le scénario` : `Clôture sous ${(livePrice - ATR * 1.5).toFixed(5)}`,
        },
        {
            name: 'Scénario Baissier',
            probability: bearPct,
            color: 'sell',
            condition: `Structure ${structure.trend}, SuperTrend ${supertrend?.direction || 'neutre'}, ${ichimoku?.belowCloud ? 'sous le nuage Ichimoku' : 'Ichimoku neutre'}`,
            targets: nearS ? [
                { label: 'TP1', price: +(nearS).toFixed(5),                         distPct: +((livePrice - nearS) / livePrice * 100).toFixed(2) },
                { label: 'TP2', price: +(levels.supports[1]?.price || nearS - ATR * 3).toFixed(5), distPct: +((livePrice - (levels.supports[1]?.price || nearS - ATR * 3)) / livePrice * 100).toFixed(2) },
            ] : [{ label: 'TP1', price: +(livePrice - ATR * 2).toFixed(5), distPct: +((ATR * 2 / livePrice) * 100).toFixed(2) }],
            invalidation: nearR ? `Clôture au-dessus de ${nearR.toFixed(5)} invalide le scénario` : `Clôture au-dessus de ${(livePrice + ATR * 1.5).toFixed(5)}`,
        },
    ];

    const dominant = bullScore >= bearScore ? 'bullish' : 'bearish';
    return { scenarios, dominant, bullScore, bearScore };
}

// ── SYNTHÈSE TEXTUELLE ────────────────────────────────────────────
function buildSummary(structure, regime, indicators, scenarios, divergence, ichimoku, supertrend, rejection, livePrice) {
    const lines = [];
    const dom = scenarios.dominant;

    lines.push(`📍 Prix actuel : ${livePrice}`);
    lines.push(`📊 Structure : ${structure.description}`);
    lines.push(`⚡ Régime : ${regime.description}`);

    if (ichimoku) {
        if (ichimoku.aboveCloud) lines.push(`☁️ Ichimoku : prix au-dessus du nuage — biais haussier. Cloud Top = ${ichimoku.cloudTop}`);
        else if (ichimoku.belowCloud) lines.push(`☁️ Ichimoku : prix sous le nuage — biais baissier. Cloud Bottom = ${ichimoku.cloudBottom}`);
        else lines.push(`☁️ Ichimoku : prix dans le nuage — zone de confusion, attendre sortie`);
        if (ichimoku.tkCross) lines.push(`🔔 TK Cross ${ichimoku.tkCross} détecté — signal de continuation`);
    }

    if (supertrend) {
        lines.push(`📈 SuperTrend ${supertrend.direction} — SL dynamique à ${supertrend.slLevel}`);
        if (supertrend.crossed) lines.push(`🚨 SuperTrend vient de changer de direction → signal de retournement fort`);
    }

    if (divergence?.rsi) lines.push(`⚡ ${divergence.rsi.desc}`);

    if (rejection?.length > 0) {
        const strong = rejection.filter(r => r.strength === 'high');
        if (strong.length > 0) lines.push(`🕯️ ${strong[0].desc}`);
    }

    lines.push('');
    lines.push(`🎯 Scénario dominant : ${dom === 'bullish' ? '📈 HAUSSIER' : '📉 BAISSIER'} (${Math.max(scenarios.scenarios[0].probability, scenarios.scenarios[1].probability)}%)`);

    return lines;
}

// ── POST /api/backtest ────────────────────────────────────────────
router.post('/', async (req, res) => {
    const {
        symbol    = 'BTC/USD',
        timeframe = '1h',
        bars      = 200,
    } = req.body || {};

    try {
        const hist    = await getPriceHistory(symbol, timeframe, Math.min(bars, 500));
        const candles = hist?.candles || [];
        if (candles.length < 52) {
            return res.status(400).json({ success: false, error: `Données insuffisantes (${candles.length}/52 min)` });
        }

        const closes    = candles.map(c => c.close);
        const livePrice = closes[closes.length - 1];

        // ── Indicateurs ───────────────────────────────────────────
        const rsi       = calcRSI(closes, 14);
        const atrVal    = calcATR(candles, 14);
        const ema9      = calcEMA(closes, 9);
        const ema21     = calcEMA(closes, 21);
        const ema50     = closes.length >= 50 ? calcEMA(closes, 50) : null;
        const macd      = calcMACD(closes);
        const bb        = calcBollingerBands(closes, 20);
        const stochRsi  = calcStochRSI(closes, 14, 14);
        const vwap      = calcVWAP(candles);
        const obv       = calcOBV(candles);
        const volProfile= calcVolumeProfile(candles, 20);
        const ichimoku  = candles.length >= 52 ? calcIchimoku(candles) : null;
        const supertrend= calcSuperTrend(candles, 10, 3.0);
        const divergence= detectDivergences(candles, 14);
        const rejection = detectRejectionCandles(candles);

        const indicators = { rsi: +rsi.toFixed(1), atr: atrVal, ema9: +ema9.toFixed(5), ema21: +ema21.toFixed(5), ema50: ema50 ? +ema50.toFixed(5) : null, macd, bb, stochRsi, vwap, obv };

        // ── Analyses ──────────────────────────────────────────────
        const structure = analyzeMarketStructure(candles);
        const regime    = detectMarketRegime(candles);
        const levels    = findKeyLevels(candles, livePrice);
        const scenariosData = buildScenarios(structure, regime, indicators, levels, divergence, ichimoku, supertrend, rejection, volProfile, livePrice);
        const summary   = buildSummary(structure, regime, indicators, scenariosData, divergence, ichimoku, supertrend, rejection, livePrice);

        // ── Momentum gauge (–100 → +100) ─────────────────────────
        let momentum = 0;
        if (rsi > 50) momentum += (rsi - 50) * 0.8; else momentum -= (50 - rsi) * 0.8;
        if (macd.histogram > 0) momentum += 15; else momentum -= 15;
        if (ema9 > ema21) momentum += 10; else momentum -= 10;
        if (ema50 && livePrice > ema50) momentum += 10; else if (ema50) momentum -= 10;
        if (supertrend?.direction === 'bullish') momentum += 15; else if (supertrend?.direction === 'bearish') momentum -= 15;
        momentum = Math.max(-100, Math.min(100, Math.round(momentum)));

        return res.json({
            success: true,
            symbol, timeframe,
            bars: candles.length,
            dataSource: hist?.source,
            livePrice,
            // Résultats
            structure,
            regime,
            levels,
            indicators: {
                rsi: indicators.rsi, atr: +atrVal.toFixed(5),
                ema9: indicators.ema9, ema21: indicators.ema21, ema50: indicators.ema50,
                macdLine: +macd.macdLine.toFixed(6), macdHistogram: +macd.histogram.toFixed(6),
                bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower,
                stochK: stochRsi?.k ?? null, stochSignal: stochRsi?.signal ?? null,
                vwap: vwap ? +vwap.toFixed(5) : null,
                obvTrend: obv?.trend ?? null,
                poc: volProfile?.poc ? +volProfile.poc.toFixed(5) : null,
                pocSkew: volProfile?.skew ?? null,
            },
            ichimoku,
            supertrend,
            divergence,
            rejection: rejection?.filter(r => r.strength !== 'low').slice(0, 3) || null,
            scenarios:  scenariosData.scenarios,
            dominant:   scenariosData.dominant,
            momentum,
            summary,
        });

    } catch (err) {
        logger.error('Market analysis error', { err: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;