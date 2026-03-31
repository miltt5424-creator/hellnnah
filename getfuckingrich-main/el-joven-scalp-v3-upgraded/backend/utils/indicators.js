'use strict';
/**
 * Shared Indicators Engine — El Joven Scalp PRO
 * Single source of truth for all technical calculations.
 * Used by: signal.js, autoSignal.js, backtest.js, strategyEngine.js
 */

function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses -= d;
    }
    let avgG = gains / period;
    let avgL = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
        avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (avgL === 0) return 100;
    return parseFloat((100 - 100 / (1 + avgG / avgL)).toFixed(2));
}

function calcEMA(closes, period) {
    if (closes.length < period) return closes[closes.length - 1] || 0;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
}

function calcEMASeries(closes, period) {
    if (closes.length < period) return [];
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result = [ema];
    for (let i = period; i < closes.length; i++) {
        ema = closes[i] * k + ema * (1 - k);
        result.push(ema);
    }
    return result;
}

function calcATR(candles, period = 14) {
    if (candles.length < 2) return (candles[0]?.close || 1) * 0.002;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i], p = candles[i - 1];
        trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / Math.min(period, trs.length);
    for (let i = period; i < trs.length; i++) {
        atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
}

function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
    if (closes.length < slow + signal) return { macdLine: 0, signalLine: 0, histogram: 0 };
    const emaFastSeries = calcEMASeries(closes, fast);
    const emaSlowSeries = calcEMASeries(closes, slow);
    const offset = slow - fast;
    const macdValues = emaSlowSeries.map((s, i) => emaFastSeries[i + offset] - s);
    const signalLine = calcEMA(macdValues, signal);
    const macdLine = macdValues[macdValues.length - 1];
    return {
        macdLine: parseFloat(macdLine.toFixed(6)),
        signalLine: parseFloat(signalLine.toFixed(6)),
        histogram: parseFloat((macdLine - signalLine).toFixed(6)),
    };
}

function calcBollingerBands(closes, period = 20, stdDev = 2) {
    if (closes.length < period) {
        const p = closes[closes.length - 1] || 0;
        return { upper: p * 1.002, middle: p, lower: p * 0.998 };
    }
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    return {
        upper: parseFloat((mean + stdDev * std).toFixed(5)),
        middle: parseFloat(mean.toFixed(5)),
        lower: parseFloat((mean - stdDev * std).toFixed(5)),
    };
}

function calcVWAP(candles) {
    if (!candles || candles.length < 2) return null;
    let cumTPV = 0, cumVol = 0;
    for (const c of candles) {
        const tp = (c.high + c.low + c.close) / 3;
        const v = c.volume || 1;
        cumTPV += tp * v;
        cumVol += v;
    }
    return cumVol === 0 ? null : parseFloat((cumTPV / cumVol).toFixed(5));
}

function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14) {
    if (!closes || closes.length < rsiPeriod + stochPeriod) return null;
    if (closes.length < rsiPeriod * 2 + stochPeriod) return null;
    const rsiSeries = [];
    for (let i = rsiPeriod; i < closes.length; i++) {
        rsiSeries.push(calcRSI(closes.slice(0, i + 1), rsiPeriod));
    }
    if (rsiSeries.length < stochPeriod) return null;
    const rsiSlice = rsiSeries.slice(-stochPeriod);
    const rsiMin = Math.min(...rsiSlice), rsiMax = Math.max(...rsiSlice);
    const k = rsiMax === rsiMin ? 50 : parseFloat(((rsiSeries[rsiSeries.length - 1] - rsiMin) / (rsiMax - rsiMin) * 100).toFixed(1));
    const prevK = rsiSeries.length >= 2
        ? (rsiMax === rsiMin ? 50 : parseFloat(((rsiSeries[rsiSeries.length - 2] - rsiMin) / (rsiMax - rsiMin) * 100).toFixed(1)))
        : k;
    const d = parseFloat(((k + prevK) / 2).toFixed(1));
    const signal = k < 20 && k > prevK ? 'BULLISH' : k > 80 && k < prevK ? 'BEARISH' : 'NEUTRAL';
    return { k, d, signal };
}

function calcOBV(candles) {
    if (!candles || candles.length < 2) return null;
    let obv = 0;
    const series = [];
    for (let i = 1; i < candles.length; i++) {
        const v = candles[i].volume || 0;
        if (candles[i].close > candles[i - 1].close) obv += v;
        else if (candles[i].close < candles[i - 1].close) obv -= v;
        series.push(obv);
    }
    const obvEma = calcEMA(series, 10);
    return {
        value: Math.round(obv),
        trend: series[series.length - 1] > obvEma ? 'UP' : 'DOWN',
    };
}

function calcCVD(candles) {
    if (!candles || candles.length < 2) return null;
    let cvd = 0;
    for (const c of candles) {
        cvd += c.close >= c.open ? (c.volume || 0) : -(c.volume || 0);
    }
    return { value: Math.round(cvd), trend: cvd > 0 ? 'UP' : 'DOWN' };
}

function calcVolumeProfile(candles, bins = 10) {
    if (!candles || candles.length < 5) return null;
    const hi = Math.max(...candles.map(c => c.high));
    const lo = Math.min(...candles.map(c => c.low));
    if (hi <= lo) return null;
    const step = (hi - lo) / bins;
    const vols = Array(bins).fill(0);
    for (const c of candles) {
        const tp = (c.high + c.low + c.close) / 3;
        const idx = Math.min(Math.floor((tp - lo) / step), bins - 1);
        vols[idx] += c.volume || 1;
    }
    const pocIdx = vols.indexOf(Math.max(...vols));
    const poc = parseFloat((lo + step * (pocIdx + 0.5)).toFixed(5));
    const lastPrice = candles[candles.length - 1].close;
    return { poc, skew: lastPrice > poc ? 'BUY' : 'SELL' };
}

function swingPoints(candles, lookback = 3) {
    const highs = [], lows = [];
    for (let i = lookback; i < candles.length - lookback; i++) {
        let isH = true, isL = true;
        for (let j = 1; j <= lookback; j++) {
            if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isH = false;
            if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isL = false;
        }
        if (isH) highs.push({ idx: i, price: candles[i].high });
        if (isL) lows.push({ idx: i, price: candles[i].low });
    }
    return { highs, lows };
}


// ── WILLIAMS %R ───────────────────────────────────────────────────
function calcWilliamsR(candles, period = 14) {
    if (candles.length < period) return null;
    const slice = candles.slice(-period);
    const hh = Math.max(...slice.map(c => c.high));
    const ll = Math.min(...slice.map(c => c.low));
    const close = candles[candles.length - 1].close;
    if (hh === ll) return -50;
    return +((hh - close) / (hh - ll) * -100).toFixed(2);
}

// ── CCI (Commodity Channel Index) ────────────────────────────────
function calcCCI(candles, period = 20) {
    if (candles.length < period) return null;
    const slice = candles.slice(-period);
    const typicals = slice.map(c => (c.high + c.low + c.close) / 3);
    const mean = typicals.reduce((a, v) => a + v, 0) / period;
    const meanDev = typicals.reduce((a, v) => a + Math.abs(v - mean), 0) / period;
    if (meanDev === 0) return 0;
    return +((typicals[typicals.length - 1] - mean) / (0.015 * meanDev)).toFixed(2);
}

// ── MFI (Money Flow Index) ────────────────────────────────────────
function calcMFI(candles, period = 14) {
    if (candles.length < period + 1) return null;
    const slice = candles.slice(-(period + 1));
    let posFlow = 0, negFlow = 0;
    for (let i = 1; i < slice.length; i++) {
        const tp  = (slice[i].high + slice[i].low + slice[i].close) / 3;
        const tpP = (slice[i-1].high + slice[i-1].low + slice[i-1].close) / 3;
        const mf  = tp * (slice[i].volume || 0);
        if (tp > tpP) posFlow += mf;
        else          negFlow += mf;
    }
    if (negFlow === 0) return 100;
    const mfr = posFlow / negFlow;
    return +(100 - 100 / (1 + mfr)).toFixed(2);
}

// ── CVD amélioré (Cumulative Volume Delta) ────────────────────────
function calcCVDFull(candles) {
    if (!candles || candles.length < 2) return { value: 0, trend: 'NEUTRAL', delta: 0 };
    let cvd = 0;
    const deltas = [];
    for (const c of candles) {
        const body = c.close - c.open;
        const vol  = c.volume || 0;
        const d    = body >= 0 ? vol : -vol;
        cvd   += d;
        deltas.push(d);
    }
    const recent = deltas.slice(-5).reduce((a, v) => a + v, 0);
    const trend  = recent > 0 ? 'UP' : recent < 0 ? 'DOWN' : 'NEUTRAL';
    return { value: Math.round(cvd), trend, delta: Math.round(recent) };
}

module.exports = {
    calcRSI, calcEMA, calcEMASeries, calcATR, calcMACD,
    calcBollingerBands, calcVWAP, calcStochRSI,
    calcOBV, calcCVD, calcCVDFull, calcVolumeProfile, swingPoints,
    calcWilliamsR, calcCCI, calcMFI,
};

// ── ICHIMOKU CLOUD ────────────────────────────────────────────────
function calcIchimoku(candles) {
    if (candles.length < 52) return null;
    const high = (arr) => Math.max(...arr.map(c => c.high));
    const low  = (arr) => Math.min(...arr.map(c => c.low));

    const last = candles.length - 1;
    const tenkan  = (high(candles.slice(last-8,  last+1)) + low(candles.slice(last-8,  last+1))) / 2;  // 9 periodes
    const kijun   = (high(candles.slice(last-25, last+1)) + low(candles.slice(last-25, last+1))) / 2;  // 26 periodes
    const senkouA = (tenkan + kijun) / 2;
    const senkouB = (high(candles.slice(last-51, last+1)) + low(candles.slice(last-51, last+1))) / 2;  // 52 periodes
    const chikou  = candles[last].close;  // 26 periodes en arrière (comparer avec price[last-26])
    const pastClose = candles[last - 26]?.close || null;

    const price = candles[last].close;
    const aboveCloud = price > Math.max(senkouA, senkouB);
    const belowCloud = price < Math.min(senkouA, senkouB);
    const inCloud    = !aboveCloud && !belowCloud;

    // TK Cross : signal fort
    const prevTenkan = (high(candles.slice(last-9,  last)) + low(candles.slice(last-9,  last))) / 2;
    const prevKijun  = (high(candles.slice(last-26, last)) + low(candles.slice(last-26, last))) / 2;
    const tkCross = tenkan > kijun && prevTenkan <= prevKijun ? 'bullish'
                  : tenkan < kijun && prevTenkan >= prevKijun ? 'bearish'
                  : null;

    // Chikou confirmation
    const chikouBull = pastClose && chikou > pastClose;
    const chikouBear = pastClose && chikou < pastClose;

    const bias = aboveCloud && tenkan > kijun && chikouBull ? 'bullish'
               : belowCloud && tenkan < kijun && chikouBear ? 'bearish'
               : 'neutral';

    return {
        tenkan:   +tenkan.toFixed(6),
        kijun:    +kijun.toFixed(6),
        senkouA:  +senkouA.toFixed(6),
        senkouB:  +senkouB.toFixed(6),
        chikou:   +chikou.toFixed(6),
        aboveCloud, belowCloud, inCloud,
        tkCross, chikouBull, chikouBear,
        bias,
        cloudTop:    +Math.max(senkouA, senkouB).toFixed(6),
        cloudBottom: +Math.min(senkouA, senkouB).toFixed(6),
    };
}

// ── SUPERTREND ────────────────────────────────────────────────────
function calcSuperTrend(candles, period = 10, multiplier = 3.0) {
    if (candles.length < period + 2) return null;

    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    // ATR manuel pour SuperTrend
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        trs.push(Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i-1]),
            Math.abs(lows[i]  - closes[i-1])
        ));
    }
    const atrSeries = [trs[0]];
    for (let i = 1; i < trs.length; i++) {
        atrSeries.push((atrSeries[i-1] * (period-1) + trs[i]) / period);
    }

    let direction = 1; // 1 = bullish, -1 = bearish
    let superTrend = 0;
    let prevUpper  = 0, prevLower = 0;

    for (let i = period; i < candles.length; i++) {
        const atrVal  = atrSeries[i - 1];
        const hl2     = (highs[i] + lows[i]) / 2;
        const upper   = hl2 + multiplier * atrVal;
        const lower   = hl2 - multiplier * atrVal;

        const finalUpper = upper < prevUpper || closes[i-1] > prevUpper ? upper : prevUpper;
        const finalLower = lower > prevLower || closes[i-1] < prevLower ? lower : prevLower;

        if (closes[i] > finalUpper) direction = 1;
        if (closes[i] < finalLower) direction = -1;

        superTrend = direction === 1 ? finalLower : finalUpper;
        prevUpper  = finalUpper;
        prevLower  = finalLower;
    }

    const price   = closes[closes.length - 1];
    const prevST  = superTrend; // dernière valeur
    // Détecter crossover (changement de direction sur les 2 dernières bougies)
    const crossed = (direction === 1  && closes[closes.length-2] < prevLower)
                 || (direction === -1 && closes[closes.length-2] > prevUpper);

    return {
        value:     +superTrend.toFixed(6),
        direction: direction === 1 ? 'bullish' : 'bearish',
        crossed,   // true = vient de changer = signal fort
        abovePrice:  price < superTrend,  // ST au-dessus → bearish
        belowPrice:  price > superTrend,  // ST en-dessous → bullish
        slLevel:   +superTrend.toFixed(6),  // Utilisable comme SL dynamique
    };
}

// ── DIVERGENCES RSI/MACD ──────────────────────────────────────────
function detectDivergences(candles, rsiPeriod = 14) {
    if (candles.length < 40) return { rsi: null, macd: null };

    const closes  = candles.map(c => c.close);
    const highs   = candles.map(c => c.high);
    const lows    = candles.map(c => c.low);

    // Calculer RSI série
    const rsiSeries = [];
    for (let i = rsiPeriod; i < closes.length; i++) {
        let g = 0, l = 0;
        for (let j = i - rsiPeriod + 1; j <= i; j++) {
            const d = closes[j] - closes[j-1];
            if (d > 0) g += d; else l -= d;
        }
        const rs = l === 0 ? 100 : g / l;
        rsiSeries.push({ idx: i, value: 100 - 100 / (1 + rs), price: closes[i], high: highs[i], low: lows[i] });
    }

    // Calculer MACD série simplifiée
    const macdValues = [];
    const emaFast = calcEMASeries(closes, 12);
    const emaSlow = calcEMASeries(closes, 26);
    const offset  = 26 - 12;
    for (let i = 0; i < emaSlow.length; i++) {
        macdValues.push({ idx: i + 26, value: emaFast[i + offset] - emaSlow[i], price: closes[i + 26] });
    }

    const last = rsiSeries.length - 1;
    const lookback = Math.min(20, last - 5);

    // Chercher les 2 derniers swing highs et lows
    const findSwing = (series, type) => {
        const result = [];
        for (let i = 2; i < series.length - 2; i++) {
            if (type === 'high' && series[i].value > series[i-1].value && series[i].value > series[i+1].value)
                result.push(series[i]);
            if (type === 'low'  && series[i].value < series[i-1].value && series[i].value < series[i+1].value)
                result.push(series[i]);
        }
        return result.slice(-4);
    };

    const rsiHighs = findSwing(rsiSeries, 'high');
    const rsiLows  = findSwing(rsiSeries, 'low');

    let rsiDiv = null, macdDiv = null;

    // Divergence baissière régulière : prix fait higher high, RSI fait lower high
    if (rsiHighs.length >= 2) {
        const r1 = rsiHighs[rsiHighs.length - 2], r2 = rsiHighs[rsiHighs.length - 1];
        if (r2.high > r1.high && r2.value < r1.value)
            rsiDiv = { type: 'bearish_regular', desc: 'Divergence RSI baissière — prix HH, RSI LH → retournement probable', strength: 'high' };
        // Divergence haussière régulière : prix fait lower low, RSI fait higher low
        if (r2.low < r1.low && r2.value > r1.value)
            rsiDiv = { type: 'bullish_regular', desc: 'Divergence RSI haussière — prix LL, RSI HL → rebond probable', strength: 'high' };
    }
    if (rsiLows.length >= 2) {
        const r1 = rsiLows[rsiLows.length - 2], r2 = rsiLows[rsiLows.length - 1];
        if (r2.low < r1.low && r2.value > r1.value && !rsiDiv)
            rsiDiv = { type: 'bullish_regular', desc: 'Divergence RSI haussière — prix LL, RSI HL → rebond probable', strength: 'high' };
        if (r2.high > r1.high && r2.value < r1.value && !rsiDiv)
            rsiDiv = { type: 'bearish_regular', desc: 'Divergence RSI baissière → retournement probable', strength: 'high' };
        // Divergence cachée haussière (continuation) : prix HL, RSI LL
        if (r2.low > r1.low && r2.value < r1.value && !rsiDiv)
            rsiDiv = { type: 'bullish_hidden', desc: 'Divergence RSI cachée haussière — continuation BUY', strength: 'medium' };
        if (r2.high < r1.high && r2.value > r1.value && !rsiDiv)
            rsiDiv = { type: 'bearish_hidden', desc: 'Divergence RSI cachée baissière — continuation SELL', strength: 'medium' };
    }

    return { rsi: rsiDiv, macd: macdDiv };
}

// ── REJECTION CANDLES ─────────────────────────────────────────────
function detectRejectionCandles(candles) {
    if (candles.length < 5) return null;

    const last  = candles[candles.length - 1];
    const prev  = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    const body  = Math.abs(last.close - last.open);
    const range = last.high - last.low;
    const upperWick = last.high  - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;

    const patterns = [];

    // Pin Bar haussier : longue mèche basse, petit corps en haut
    if (range > 0 && lowerWick > range * 0.6 && body < range * 0.3 && last.close > last.open)
        patterns.push({ type: 'bullish_pin_bar', desc: 'Pin Bar haussier — rejet fort du bas', signal: 'BUY', strength: 'high' });

    // Pin Bar baissier : longue mèche haute, petit corps en bas
    if (range > 0 && upperWick > range * 0.6 && body < range * 0.3 && last.close < last.open)
        patterns.push({ type: 'bearish_pin_bar', desc: 'Pin Bar baissier — rejet fort du haut', signal: 'SELL', strength: 'high' });

    // Bullish Engulfing
    if (prev.close < prev.open && last.close > last.open &&
        last.close > prev.open && last.open < prev.close)
        patterns.push({ type: 'bullish_engulfing', desc: 'Engulfing haussier — avale la bougie précédente', signal: 'BUY', strength: 'high' });

    // Bearish Engulfing
    if (prev.close > prev.open && last.close < last.open &&
        last.close < prev.open && last.open > prev.close)
        patterns.push({ type: 'bearish_engulfing', desc: 'Engulfing baissier — avale la bougie précédente', signal: 'SELL', strength: 'high' });

    // Hammer (mèche basse ×2 corps, sans engulfing)
    if (lowerWick > body * 2 && upperWick < body * 0.5 && body > 0)
        patterns.push({ type: 'hammer', desc: 'Hammer — potentiel rebond haussier', signal: 'BUY', strength: 'medium' });

    // Shooting Star
    if (upperWick > body * 2 && lowerWick < body * 0.5 && body > 0)
        patterns.push({ type: 'shooting_star', desc: 'Shooting Star — potentiel retournement baissier', signal: 'SELL', strength: 'medium' });

    // Doji (corps très petit = indécision)
    if (range > 0 && body < range * 0.1)
        patterns.push({ type: 'doji', desc: 'Doji — indécision du marché', signal: 'NEUTRAL', strength: 'low' });

    // Marubozu haussier (bougie forte sans mèches)
    if (range > 0 && body > range * 0.9 && last.close > last.open)
        patterns.push({ type: 'bullish_marubozu', desc: 'Marubozu haussier — force acheteurs pure', signal: 'BUY', strength: 'high' });

    // Marubozu baissier
    if (range > 0 && body > range * 0.9 && last.close < last.open)
        patterns.push({ type: 'bearish_marubozu', desc: 'Marubozu baissier — force vendeurs pure', signal: 'SELL', strength: 'high' });

    return patterns.length > 0 ? patterns : null;
}

// Ajouter aux exports
Object.assign(module.exports, {
    calcIchimoku,
    calcSuperTrend,
    detectDivergences,
    detectRejectionCandles,
});