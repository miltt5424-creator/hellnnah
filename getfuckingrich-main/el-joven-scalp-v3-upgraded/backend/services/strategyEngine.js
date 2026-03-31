'use strict';
/**
 * Strategy Engine v5 — El Joven Scalp PRO
 * ==========================================
 * REFONTE : de "Confirmation Engine" à "Anticipation Engine"
 *
 * Changements v5 vs v4 :
 *  ① scoreTF() réduit de 15 indicateurs → 4 essentiels (structure, momentum, zone, timing)
 *     Résultat : signal 3-5 bougies plus tôt
 *  ② computeZoneProximity() : bonus fort si le prix est DÉJÀ sur une zone clé
 *     Un prix en zone + structure alignée = signal immédiat
 *  ③ Seuil de déclenchement adaptatif : 28 (normal) → 15 si price in zone
 *  ④ VETO system allégé : uniquement H1 contre-tendance fort (pas ADX, pas Ichimoku)
 *  ⑤ Indicateurs avancés (Ichimoku, ADX, Fibonacci…) conservés pour AFFICHAGE uniquement
 *     → ils n'influencent plus le score de déclenchement
 *
 * Score final : -100 → 0 → +100
 * Seuil signal : ≥ 28 (ou ≥ 15 si in zone) = BUY/SELL | sinon HOLD
 */

const { calcRSI, calcEMA, calcATR, calcMACD, calcBollingerBands,
        calcVWAP, calcStochRSI, calcOBV, calcCVD, calcCVDFull, calcVolumeProfile, swingPoints,
        calcIchimoku, calcSuperTrend, detectDivergences, detectRejectionCandles,
        calcWilliamsR, calcCCI, calcMFI } = require('../utils/indicators');
const logger = require('../utils/logger');

// ── 1. HELPERS ────────────────────────────────────────────────────

function getSwings(candles, lb = 5) { return swingPoints(candles, lb); }
function atr(candles, p = 14)       { return calcATR(candles, p); }

// ── 2. SMC — Structure Market Context ────────────────────────────
// INCHANGÉ — conservé car fournit les données d'affichage (OB, FVG, BOS)
// MAIS son bias n'influence plus le score de déclenchement (voir computeCompositeScore)

function analyzeSMC(candles) {
    if (candles.length < 20) return { bias: 'neutral', bos: null, choch: null, mss: null, orderBlocks: [], fvg: [], inducement: null };

    const price = candles[candles.length - 1].close;
    const ATR   = atr(candles);
    const { highs, lows } = getSwings(candles, 5);
    const result = { bias: 'neutral', bos: null, choch: null, mss: null, orderBlocks: [], fvg: [], inducement: null };

    if (highs.length >= 2 && price > highs[highs.length - 2].price) {
        const vol = candles.slice(-20).reduce((a, c) => a + (c.volume || 0), 0) / 20;
        result.bos  = { type: 'bullish', level: highs[highs.length - 2].price, volumeConfirmed: (candles[candles.length - 1].volume || 0) >= vol * 1.1 };
        result.bias = 'bullish';
    }
    if (lows.length >= 2 && price < lows[lows.length - 2].price) {
        const vol = candles.slice(-20).reduce((a, c) => a + (c.volume || 0), 0) / 20;
        result.bos  = { type: 'bearish', level: lows[lows.length - 2].price, volumeConfirmed: (candles[candles.length - 1].volume || 0) >= vol * 1.1 };
        result.bias = 'bearish';
    }

    if (highs.length >= 1 && lows.length >= 1) {
        const lH = highs[highs.length - 1], lL = lows[lows.length - 1];
        if (lL.idx > lH.idx && price < lL.price) result.choch = { type: 'bearish', level: lL.price };
        else if (lH.idx > lL.idx && price > lH.price) result.choch = { type: 'bullish', level: lH.price };
    }
    if (result.choch) {
        const last3 = candles.slice(-3);
        const conf  = result.choch.type === 'bullish' ? last3.every(c => c.close > result.choch.level) : last3.every(c => c.close < result.choch.level);
        if (conf) result.mss = { type: result.choch.type, level: result.choch.level, confirmed: true };
    }

    for (let i = candles.length - 10; i < candles.length - 1; i++) {
        if (i < 0) continue;
        const c = candles[i], n = candles[i + 1];
        if (c.close < c.open && n.close > n.open && n.close > c.high)
            result.orderBlocks.push({ type: 'bullish', high: c.high, low: c.low, mid: (c.high + c.low) / 2 });
        if (c.close > c.open && n.close < n.open && n.close < c.low)
            result.orderBlocks.push({ type: 'bearish', high: c.high, low: c.low, mid: (c.high + c.low) / 2 });
    }

    for (let i = 1; i < candles.length - 1; i++) {
        const p = candles[i - 1], n = candles[i + 1];
        if (n.low > p.high) result.fvg.push({ type: 'bullish', top: n.low, bottom: p.high, mid: (n.low + p.high) / 2 });
        if (n.high < p.low) result.fvg.push({ type: 'bearish', top: p.low, bottom: n.high, mid: (p.low + n.high) / 2 });
    }
    result.fvg = result.fvg.slice(-4);

    if (highs.length >= 3) {
        const eq = highs.slice(-3).filter(h => Math.abs(h.price - highs[highs.length - 1].price) < ATR * 0.6);
        if (eq.length >= 2) result.inducement = { type: 'bearish_sweep', level: eq[0].price, desc: 'Equal highs — liquidity pool au-dessus' };
    }
    if (lows.length >= 3) {
        const eq = lows.slice(-3).filter(l => Math.abs(l.price - lows[lows.length - 1].price) < ATR * 0.6);
        if (eq.length >= 2) result.inducement = { type: 'bullish_sweep', level: eq[0].price, desc: 'Equal lows — liquidity pool en-dessous' };
    }

    const last = candles[candles.length - 1];
    const recentH = Math.max(...candles.slice(-12).map(c => c.high));
    const recentL = Math.min(...candles.slice(-12).map(c => c.low));
    if (last.high > recentH && last.close < recentH - ATR * 0.1)
        result.liquiditySweep = { type: 'bearish_sweep', level: recentH, desc: 'Stop hunt au-dessus des highs' };
    if (last.low < recentL && last.close > recentL + ATR * 0.1)
        result.liquiditySweep = { type: 'bullish_sweep', level: recentL, desc: 'Stop hunt en-dessous des lows → rebond' };

    return result;
}

// ── 3. ICT — Kill Zones + OTE (inchangé, pour affichage) ─────────

function analyzeICT(candles) {
    const result = { killZone: null, nextKillZone: null, ote: null, premiumDiscount: null, pdArray: [], liquiditySweep: null };
    const now  = new Date();
    const h    = now.getUTCHours(), m = now.getUTCMinutes();
    const t    = h + m / 60;

    if (t >= 2   && t < 5)  result.killZone = { name: 'Asian KZ',   quality: 1, bias: 'range' };
    if (t >= 7   && t < 10) result.killZone = { name: 'London KZ',  quality: 2, bias: 'directional' };
    if (t >= 8   && t < 9)  result.killZone = { name: 'London Open', quality: 3, bias: 'high_vol' };
    if (t >= 12  && t < 16) result.killZone = { name: 'NY KZ',      quality: 2, bias: 'directional' };
    if (t >= 13  && t < 14) result.killZone = { name: 'NY Open',    quality: 3, bias: 'high_vol' };

    result.nextKillZone = t < 8  ? { name: 'London Open', hoursLeft: +(8 - t).toFixed(1) }
                        : t < 13 ? { name: 'NY Open',     hoursLeft: +(13 - t).toFixed(1) }
                        :          { name: 'London Open demain', hoursLeft: +(32 - t).toFixed(1) };

    if (candles.length >= 20) {
        const price = candles[candles.length - 1].close;
        const sw20  = candles.slice(-20);
        const sh = Math.max(...sw20.map(c => c.high));
        const sl = Math.min(...sw20.map(c => c.low));
        const range = sh - sl;
        if (range > 0) {
            const pct = (price - sl) / range;
            result.premiumDiscount = {
                zone:     pct > 0.5 ? 'premium' : 'discount',
                pct:      +pct.toFixed(3),
                midpoint: +(sl + range / 2).toFixed(5),
            };
            const ATR_val = atr(candles);
            const ote618  = sl + range * 0.618;
            const ote786  = sl + range * 0.786;
            const inOTE   = price >= Math.min(ote618, ote786) - ATR_val * 0.3
                         && price <= Math.max(ote618, ote786) + ATR_val * 0.3;
            if (inOTE) {
                result.ote = {
                    type:  pct < 0.5 ? 'bullish_ote' : 'bearish_ote',
                    level: +(sl + range * 0.7).toFixed(5),
                    zone:  { low: +Math.min(ote618, ote786).toFixed(5), high: +Math.max(ote618, ote786).toFixed(5) },
                };
            }
        }
    }
    return result;
}

// ── 4. HLZ (inchangé) ────────────────────────────────────────────

function analyzeHLZ(candles) {
    if (candles.length < 20) return { supports: [], resistances: [], nearestSupport: null, nearestResistance: null };
    const price  = candles[candles.length - 1].close;
    const ATR    = atr(candles);
    const zones  = [];
    const { highs, lows } = getSwings(candles, 10);

    highs.filter(h => h.price > price).slice(-3).forEach(h =>
        zones.push({ type: 'resistance', price: h.price, strength: 3 })
    );
    lows.filter(l => l.price < price).slice(-3).forEach(l =>
        zones.push({ type: 'support', price: l.price, strength: 3 })
    );

    const round = price > 10000 ? 1000 : price > 1000 ? 100 : price > 100 ? 10 : 1;
    const nr    = Math.round(price / round) * round;
    if (Math.abs(nr - price) < ATR * 2)
        zones.push({ type: nr > price ? 'resistance' : 'support', price: nr, strength: 5, isRound: true });

    const merged = [];
    for (const z of zones) {
        const ex = merged.find(m => m.type === z.type && Math.abs(m.price - z.price) < ATR);
        if (ex) { ex.price = (ex.price + z.price) / 2; ex.strength += z.strength; }
        else merged.push({ ...z });
    }

    const supports    = merged.filter(z => z.type === 'support'    && z.price < price).sort((a, b) => b.price - a.price);
    const resistances = merged.filter(z => z.type === 'resistance' && z.price > price).sort((a, b) => a.price - b.price);
    return { supports: supports.slice(0, 5), resistances: resistances.slice(0, 5), nearestSupport: supports[0] || null, nearestResistance: resistances[0] || null };
}

// ── 5. Volume Profile (inchangé) ──────────────────────────────────

function analyzeVolumeProfile(candles, livePrice) {
    const vp   = calcVolumeProfile(candles, 20);
    const vwap = calcVWAP(candles);
    if (!vp || !vwap) return { poc: null, vwap: null, nearPOC: false, nearVWAP: false, inVolumeVoid: false, gate: 'open' };
    const totalVolume = candles.reduce((a, c) => a + (c.volume || 0), 0);
    if (totalVolume === 0) return { poc: vp.poc, vwap: +vwap.toFixed(5), nearPOC: true, nearVWAP: true, inVolumeVoid: false, gate: 'open', noVolume: true };
    const ATR = atr(candles);
    const nearPOC  = Math.abs(livePrice - vp.poc) < ATR * 1.5;
    const nearVWAP = Math.abs(livePrice - vwap) < ATR * 1.5;
    const inVoid   = !nearPOC && !nearVWAP && Math.abs(livePrice - vp.poc) > ATR * 3;
    return { poc: vp.poc, vwap: +vwap.toFixed(5), nearPOC, nearVWAP, inVolumeVoid: inVoid, gate: inVoid ? 'blocked_void' : 'open', skew: vp.skew };
}

// ── 6. DXY Correlation (inchangé) ────────────────────────────────

function analyzeDXYCorrelation(symbol, dxyCandles) {
    if (!dxyCandles || dxyCandles.length < 20) return { available: false, dxyBias: 'unknown', compatible: true };
    const closes = dxyCandles.map(c => c.close);
    const ema9   = calcEMA(closes, 9);
    const ema21  = calcEMA(closes, 21);
    const price  = closes[closes.length - 1];
    const dxyBias = ema9 > ema21 ? 'bullish' : 'bearish';
    const DXY_NEGATIVE = ['XAU/USD', 'EUR/USD', 'GBP/USD', 'AUD/USD'];
    const pctFromMean = ((price - ema21) / ema21) * 100;
    return {
        available: true, dxyBias,
        dxyPrice: +price.toFixed(3), dxyEma9: +ema9.toFixed(3), dxyEma21: +ema21.toFixed(3),
        pctFromMean: +pctFromMean.toFixed(2), compatible: true, reason: `DXY ${dxyBias}`,
        favoursBuy:  DXY_NEGATIVE.includes(symbol) ? dxyBias === 'bearish' : dxyBias === 'bullish',
        favoursSell: DXY_NEGATIVE.includes(symbol) ? dxyBias === 'bullish' : dxyBias === 'bearish',
    };
}

// ── ADX (conservé pour affichage) ────────────────────────────────

function calcADX(candles, period = 14) {
    if (candles.length < period * 2) return { adx: 0, pdi: 0, mdi: 0, trend: 'weak', isStrong: false };
    const trList = [], pdmList = [], mdmList = [];
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i], p = candles[i - 1];
        trList.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
        pdmList.push(c.high - p.high > p.low - c.low && c.high - p.high > 0 ? c.high - p.high : 0);
        mdmList.push(p.low - c.low > c.high - p.high && p.low - c.low > 0 ? p.low - c.low : 0);
    }
    const smooth = (arr) => {
        let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
        const r = [s];
        for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; r.push(s); }
        return r;
    };
    const sTR = smooth(trList), sPDM = smooth(pdmList), sMDM = smooth(mdmList);
    const dxList = [];
    for (let i = 0; i < sTR.length; i++) {
        if (!sTR[i]) continue;
        const pdi = 100 * sPDM[i] / sTR[i], mdi = 100 * sMDM[i] / sTR[i];
        dxList.push({ pdi, mdi, dx: Math.abs(pdi - mdi) / ((pdi + mdi) || 1) * 100 });
    }
    const last = dxList[dxList.length - 1] || { pdi: 0, mdi: 0, dx: 0 };
    const adxVal = dxList.slice(-period).reduce((a, b) => a + b.dx, 0) / Math.min(period, dxList.length);
    return { adx: +adxVal.toFixed(1), pdi: +last.pdi.toFixed(1), mdi: +last.mdi.toFixed(1), trend: adxVal >= 25 ? (last.pdi > last.mdi ? 'bullish_strong' : 'bearish_strong') : adxVal >= 15 ? 'developing' : 'weak', isStrong: adxVal >= 25 };
}

// ── Fibonacci auto (conservé pour affichage) ──────────────────────

function calcAutoFibonacci(candles) {
    if (candles.length < 20) return null;
    const { highs, lows } = swingPoints(candles, 5);
    if (highs.length < 1 || lows.length < 1) return null;
    const lastHigh = highs[highs.length - 1], lastLow = lows[lows.length - 1];
    const price = candles[candles.length - 1].close;
    const isUpswing = lastLow.idx < lastHigh.idx;
    const swingHigh = isUpswing ? lastHigh.price : Math.max(lastHigh.price, lastLow.price);
    const swingLow  = isUpswing ? lastLow.price  : Math.min(lastHigh.price, lastLow.price);
    const range = swingHigh - swingLow;
    if (range <= 0) return null;
    const fibs = [0.236, 0.382, 0.500, 0.618, 0.786];
    const levels = fibs.map(f => ({ ratio: f, label: `${(f * 100).toFixed(1)}%`, price: isUpswing ? +(swingHigh - range * f).toFixed(6) : +(swingLow + range * f).toFixed(6) }));
    const nearest = levels.reduce((a, b) => Math.abs(b.price - price) < Math.abs(a.price - price) ? b : a);
    const ATR_val = atr(candles);
    const ote618  = levels.find(l => l.ratio === 0.618);
    const ote786  = levels.find(l => l.ratio === 0.786);
    const inOTE   = ote618 && ote786 && price >= Math.min(ote618.price, ote786.price) && price <= Math.max(ote618.price, ote786.price);
    return { swingHigh: +swingHigh.toFixed(6), swingLow: +swingLow.toFixed(6), direction: isUpswing ? 'upswing' : 'downswing', levels, nearestLevel: nearest, nearFib: Math.abs(nearest.price - price) < ATR_val * 0.5, inOTE, oteZone: ote618 && ote786 ? { low: +Math.min(ote618.price, ote786.price).toFixed(6), high: +Math.max(ote618.price, ote786.price).toFixed(6) } : null };
}

function detectRegime(candles) {
    if (candles.length < 30) return { regime: 'unknown', thresholdMult: 1.0 };
    const closes = candles.map(c => c.close);
    const ATR_val = atr(candles);
    const bb = calcBollingerBands(closes, 20);
    const bbWidth = (bb.upper - bb.lower) / (bb.middle || 1) * 100;
    const atrHistory = candles.slice(-40, -14).map((_, i) => atr(candles.slice(i, i + 14)));
    const avgHistATR = atrHistory.length > 0 ? atrHistory.reduce((a, b) => a + b, 0) / atrHistory.length : ATR_val;
    const atrRatio = ATR_val / (avgHistATR || ATR_val);
    let regime = 'trending', thresholdMult = 1.0, desc = '';
    if (bbWidth < 1.2) { regime = 'compression'; thresholdMult = 1.4; desc = '⚡ Squeeze BB'; }
    else if (atrRatio > 1.6) { regime = 'expansion'; thresholdMult = 0.8; desc = '🚀 Expansion'; }
    else if (bbWidth < 2.5) { regime = 'range'; thresholdMult = 1.2; desc = '📊 Range'; }
    return { regime, thresholdMult, bbWidth: +bbWidth.toFixed(2), atrRatio: +atrRatio.toFixed(2), description: desc };
}

// ── 7. scoreTF() ALLÉGÉ — v5 ──────────────────────────────────────
// ⚡ CHANGEMENT PRINCIPAL : 4 indicateurs seulement pour le score de déclenchement
// Les autres indicateurs sont calculés et retournés mais n'influencent PAS le score.

function scoreTF(candles) {
    if (!candles || candles.length < 30) return { score: 0, bias: 'neutral', confidence: 0 };
    const closes  = candles.map(c => c.close);
    const price   = closes[closes.length - 1];
    const ATR_val = atr(candles);

    // ── 4 INDICATEURS DE DÉCLENCHEMENT ────────────────────────────

    // 1. Structure EMA (direction de la tendance)
    const ema9  = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema50 = closes.length >= 50 ? calcEMA(closes, 50) : null;

    // 2. Momentum RSI (où en est le prix dans le cycle)
    const rsi = calcRSI(closes, 14);

    // 3. Rejection candle (confirmation de réaction sur zone)
    const rejection = candles.length >= 5 ? detectRejectionCandles(candles) : null;

    // 4. Liquidity sweep (stop hunt = signal d'entrée fort)
    const last    = candles[candles.length - 1];
    const prev    = candles[candles.length - 2];
    const recentH = Math.max(...candles.slice(-12).map(c => c.high));
    const recentL = Math.min(...candles.slice(-12).map(c => c.low));
    const sweepBull = last.low < recentL && last.close > recentL + ATR_val * 0.1;
    const sweepBear = last.high > recentH && last.close < recentH - ATR_val * 0.1;

    let bull = 0, bear = 0;

    // EMA structure (poids 4)
    if (ema50 && ema9 > ema21 && ema21 > ema50) { bull += 4; }
    else if (ema50 && ema9 < ema21 && ema21 < ema50) { bear += 4; }
    else if (ema9 > ema21) { bull += 2; }
    else if (ema9 < ema21) { bear += 2; }

    // RSI momentum (poids 3)
    if (rsi < 35)      { bull += 3; }
    else if (rsi < 45) { bull += 1; }
    else if (rsi > 65) { bear += 3; }
    else if (rsi > 55) { bear += 1; }

    // Rejection candles (poids 3 — signal direct de réaction)
    if (rejection) {
        for (const r of rejection) {
            if (r.signal === 'BUY'  && r.strength === 'high')   { bull += 3; }
            if (r.signal === 'SELL' && r.strength === 'high')   { bear += 3; }
            if (r.signal === 'BUY'  && r.strength === 'medium') { bull += 1; }
            if (r.signal === 'SELL' && r.strength === 'medium') { bear += 1; }
        }
    }

    // Liquidity sweep (poids 4 — signal institutionnel très fort)
    if (sweepBull) { bull += 4; }
    if (sweepBear) { bear += 4; }

    const total = bull + bear;
    const bias  = bull > bear + 2 ? 'bullish' : bear > bull + 2 ? 'bearish' : 'neutral';
    const score = total > 0 ? Math.round((bull - bear) / total * 100) : 0;
    const confidence = total > 0 ? Math.round(Math.max(bull, bear) / total * 100) : 50;

    // ── INDICATEURS AVANCÉS (affichage seulement — ne modifient PAS le score) ────
    const macd       = calcMACD(closes);
    const bb         = calcBollingerBands(closes, 20);
    const stoch      = calcStochRSI(closes, 14, 14);
    const vwap       = calcVWAP(candles);
    const obv        = calcOBV(candles);
    const cvdFull    = candles.length >= 5 ? calcCVDFull(candles) : null;
    const ichimoku   = candles.length >= 52 ? calcIchimoku(candles) : null;
    const supertrend = candles.length >= 14 ? calcSuperTrend(candles, 10, 3.0) : null;
    const divergence = candles.length >= 40 ? detectDivergences(candles) : { rsi: null, macd: null };
    const adx        = candles.length >= 28 ? calcADX(candles, 14) : null;
    const fibonacci  = candles.length >= 20 ? calcAutoFibonacci(candles) : null;
    const regime     = candles.length >= 30 ? detectRegime(candles) : null;
    const ema200     = closes.length >= 200 ? calcEMA(closes, 200) : null;

    return {
        score, bias, bull, bear, confidence,
        // Core (4 indicateurs de déclenchement)
        rsi:         +rsi.toFixed(1),
        ema9:        +ema9.toFixed(5),
        ema21:       +ema21.toFixed(5),
        ema50:       ema50 ? +ema50.toFixed(5) : null,
        atr:         +ATR_val.toFixed(5),
        sweepBull, sweepBear,
        rejection:   rejection ? rejection.filter(r => r.strength === 'high').slice(0, 2) : null,
        // Avancés (affichage)
        macdLine:     +macd.macdLine.toFixed(6),
        macdSignal:   +macd.signalLine.toFixed(6),
        macdHistogram:+macd.histogram.toFixed(6),
        bbUpper: +bb.upper.toFixed(5), bbMiddle: +bb.middle.toFixed(5), bbLower: +bb.lower.toFixed(5),
        stochRsi: stoch ? { k: +stoch.k.toFixed(1), d: +stoch.d.toFixed(1), signal: stoch.signal } : null,
        vwap:    vwap ? +vwap.toFixed(5) : null,
        obv:     obv ? { trend: obv.trend } : null,
        cvd:     cvdFull ? { value: cvdFull.value, trend: cvdFull.trend, delta: cvdFull.delta } : null,
        ema200:  ema200 ? +ema200.toFixed(5) : null,
        ichimoku:   ichimoku ? { bias: ichimoku.bias, aboveCloud: ichimoku.aboveCloud, belowCloud: ichimoku.belowCloud, tkCross: ichimoku.tkCross, cloudTop: ichimoku.cloudTop, cloudBottom: ichimoku.cloudBottom } : null,
        supertrend: supertrend ? { direction: supertrend.direction, value: supertrend.value, crossed: supertrend.crossed, slLevel: supertrend.slLevel } : null,
        divergence: divergence?.rsi ? { type: divergence.rsi.type, desc: divergence.rsi.desc } : null,
        adx:        adx ? { adx: adx.adx, pdi: adx.pdi, mdi: adx.mdi, trend: adx.trend, isStrong: adx.isStrong } : null,
        fibonacci:  fibonacci ? { direction: fibonacci.direction, inOTE: fibonacci.inOTE, nearFib: fibonacci.nearFib, nearestLevel: fibonacci.nearestLevel, oteZone: fibonacci.oteZone, levels: fibonacci.levels } : null,
        regime:     regime ? { regime: regime.regime, description: regime.description } : null,
    };
}

// ── 8. MTF Confluence (simplifié) ────────────────────────────────

function analyzeMTF(m1Candles, m15Candles, h1Candles) {
    const tf1  = scoreTF(m1Candles);
    const tf15 = m15Candles ? scoreTF(m15Candles) : null;
    const tf60 = h1Candles  ? scoreTF(h1Candles)  : null;

    const hasM15 = tf15 && tf15.bias !== 'neutral';
    const hasH1  = tf60 && tf60.bias !== 'neutral';

    let bullScore = tf1.bias === 'bullish' ? 2 : 0;
    let bearScore = tf1.bias === 'bearish' ? 2 : 0;
    if (hasM15) { bullScore += tf15.bias === 'bullish' ? 2 : 0; bearScore += tf15.bias === 'bearish' ? 2 : 0; }
    if (hasH1)  { bullScore += tf60.bias === 'bullish' ? 3 : 0; bearScore += tf60.bias === 'bearish' ? 3 : 0; }

    const maxScore   = 2 + (hasM15 ? 2 : 0) + (hasH1 ? 3 : 0);
    const alignedThr = maxScore >= 7 ? 5 : maxScore >= 4 ? 3 : 2;
    const partialThr = maxScore >= 7 ? 3 : 2;
    const aligned    = bullScore >= alignedThr || bearScore >= alignedThr;
    const partial    = bullScore >= partialThr  || bearScore >= partialThr;
    const direction  = bullScore > bearScore ? 'bullish' : bearScore > bullScore ? 'bearish' : 'neutral';
    const strength   = aligned ? 'strong' : partial ? 'moderate' : 'weak';
    const counterTrend = hasH1 && (
        (tf60.bias === 'bullish' && tf1.bias === 'bearish') ||
        (tf60.bias === 'bearish' && tf1.bias === 'bullish')
    );

    return {
        direction, strength, aligned, counterTrend,
        bullScore, bearScore, maxScore, hasM15, hasH1,
        tf1, tf15: tf15 || { bias: 'neutral', score: 0, confidence: 0 },
        tf60: tf60 || { bias: 'neutral', score: 0, confidence: 0 },
        confluence: aligned ? 'HIGH' : partial ? 'MEDIUM' : 'LOW',
    };
}

// ── 9. ZONE PROXIMITY (NOUVEAU) ───────────────────────────────────
// Bonus de score si le prix est DANS une zone clé (OB, FVG, OTE, HLZ)
// C'est le coeur du changement v4→v5 : anticiper plutôt que confirmer

function computeZoneProximity(smc, ict, hlz, candles, livePrice) {
    const ATR_val = atr(candles);
    let zoneBonus = 0;
    const zoneDesc = [];
    let inZone = false;
    let zoneDirection = null;

    // Order Block (zone institutionnelle forte)
    for (const ob of smc.orderBlocks || []) {
        if (livePrice >= ob.low - ATR_val * 0.3 && livePrice <= ob.high + ATR_val * 0.3) {
            if (ob.type === 'bullish') { zoneBonus += 20; zoneDirection = 'bullish'; }
            else                       { zoneBonus -= 20; zoneDirection = 'bearish'; }
            zoneDesc.push(`Prix dans Order Block ${ob.type}`);
            inZone = true;
        }
    }

    // FVG (déséquilibre — le prix doit revenir le combler)
    for (const fvg of (smc.fvg || []).slice(-2)) {
        if (livePrice >= fvg.bottom - ATR_val * 0.2 && livePrice <= fvg.top + ATR_val * 0.2) {
            if (fvg.type === 'bullish') { zoneBonus += 15; zoneDirection = zoneDirection || 'bullish'; }
            else                        { zoneBonus -= 15; zoneDirection = zoneDirection || 'bearish'; }
            zoneDesc.push(`Prix dans FVG ${fvg.type}`);
            inZone = true;
        }
    }

    // OTE ICT (zone d'entrée optimale 61.8-78.6%)
    if (ict.ote) {
        if (ict.ote.type === 'bullish_ote') { zoneBonus += 18; zoneDirection = zoneDirection || 'bullish'; zoneDesc.push('Zone OTE bullish ICT'); inZone = true; }
        if (ict.ote.type === 'bearish_ote') { zoneBonus -= 18; zoneDirection = zoneDirection || 'bearish'; zoneDesc.push('Zone OTE bearish ICT'); inZone = true; }
    }

    // Liquidity Sweep (signal instantané — le wick vient de casser puis revenir)
    if (smc.liquiditySweep?.type === 'bullish_sweep') { zoneBonus += 25; zoneDirection = 'bullish'; zoneDesc.push('Stop hunt bas → rebond imminent'); inZone = true; }
    if (smc.liquiditySweep?.type === 'bearish_sweep') { zoneBonus -= 25; zoneDirection = 'bearish'; zoneDesc.push('Stop hunt haut → chute imminente'); inZone = true; }

    // HLZ support/résistance proche
    if (hlz.nearestSupport) {
        const dist = Math.abs(livePrice - hlz.nearestSupport.price);
        if (dist < ATR_val * 0.5) { zoneBonus += 10; zoneDirection = zoneDirection || 'bullish'; zoneDesc.push(`Support HLZ @ ${hlz.nearestSupport.price.toFixed(2)}`); inZone = true; }
    }
    if (hlz.nearestResistance) {
        const dist = Math.abs(livePrice - hlz.nearestResistance.price);
        if (dist < ATR_val * 0.5) { zoneBonus -= 10; zoneDirection = zoneDirection || 'bearish'; zoneDesc.push(`Résistance HLZ @ ${hlz.nearestResistance.price.toFixed(2)}`); inZone = true; }
    }

    return { zoneBonus, inZone, zoneDirection, zoneDesc };
}

// ── 10. SL/TP structurels (inchangé) ────────────────────────────

function computeStructuralLevels(candles, direction, livePrice, hlz) {
    const ATR_val = atr(candles);
    const { highs, lows } = getSwings(candles, 5);
    let sl, tp;

    if (direction === 'BUY') {
        const validLows = lows.filter(s => s.price < livePrice).sort((a, b) => b.idx - a.idx);
        sl = validLows.length > 0 ? validLows[0].price - ATR_val * 0.25 : livePrice - ATR_val * 1.5;
        const slDist = Math.abs(livePrice - sl);
        const minTP  = livePrice + slDist * 1.8;
        const validHighs = highs.filter(s => s.price > minTP).sort((a, b) => a.price - b.price);
        const hlzTP = hlz.nearestResistance?.price;
        if (validHighs.length > 0 && hlzTP) tp = Math.min(validHighs[0].price, hlzTP) - ATR_val * 0.1;
        else if (validHighs.length > 0) tp = validHighs[0].price - ATR_val * 0.1;
        else if (hlzTP && hlzTP > minTP) tp = hlzTP - ATR_val * 0.1;
        else tp = livePrice + slDist * 2.0;
    } else {
        const validHighs = highs.filter(s => s.price > livePrice).sort((a, b) => b.idx - a.idx);
        sl = validHighs.length > 0 ? validHighs[0].price + ATR_val * 0.25 : livePrice + ATR_val * 1.5;
        const slDist = Math.abs(sl - livePrice);
        const minTP  = livePrice - slDist * 1.8;
        const validLows = lows.filter(s => s.price < minTP).sort((a, b) => b.price - a.price);
        const hlzTP = hlz.nearestSupport?.price;
        if (validLows.length > 0 && hlzTP) tp = Math.max(validLows[0].price, hlzTP) + ATR_val * 0.1;
        else if (validLows.length > 0) tp = validLows[0].price + ATR_val * 0.1;
        else if (hlzTP && hlzTP < minTP) tp = hlzTP + ATR_val * 0.1;
        else tp = livePrice - slDist * 2.0;
    }

    if (direction === 'BUY'  && sl >= livePrice) sl = livePrice - ATR_val * 1.5;
    if (direction === 'BUY'  && tp <= livePrice) tp = livePrice + Math.abs(livePrice - sl) * 2.0;
    if (direction === 'SELL' && sl <= livePrice) sl = livePrice + ATR_val * 1.5;
    if (direction === 'SELL' && tp >= livePrice) tp = livePrice - Math.abs(sl - livePrice) * 2.0;

    const slDist = Math.abs(livePrice - sl);
    const tpDist = Math.abs(tp - livePrice);
    return { sl, tp, rr: slDist > 0 ? +(tpDist / slDist).toFixed(2) : 0, atr: ATR_val };
}

// ── 11. Kelly Criterion (inchangé) ───────────────────────────────

function kellySize(confidence, rr, maxRisk = 2.0) {
    const p = confidence / 100, q = 1 - p, b = rr;
    const kelly = (b * p - q) / b;
    const size  = Math.max(0.1, Math.min(maxRisk, +(kelly / 2 * 100).toFixed(2)));
    return { kellyFull: +(kelly * 100).toFixed(2), kellySafe: size, riskNote: size >= 1.5 ? 'Taille max — signal fort' : size >= 0.8 ? 'Taille modérée' : 'Taille réduite — signal faible' };
}

// ── 12. SCORE COMPOSITE v5 ────────────────────────────────────────
// ALLÉGÉ : seulement MTF direction + zone proximity + liquidity sweep
// Suppression des petits bonus qui causaient le retard cumulatif

function computeCompositeScore(mtf, smc, ict, hlz, volProfile, dxy, symbol, candles, livePrice) {
    let score = 0;
    const signals = [];

    // ── A. MTF (poids principal — inchangé) ─────────────────────
    if (mtf.direction === 'bullish') {
        if (mtf.strength === 'strong')        { score += 35; signals.push('MTF confluence forte ↑ (3TF)'); }
        else if (mtf.strength === 'moderate') { score += 20; signals.push('MTF confluence modérée ↑'); }
        else                                  { score += 8; }
    } else if (mtf.direction === 'bearish') {
        if (mtf.strength === 'strong')        { score -= 35; signals.push('MTF confluence forte ↓ (3TF)'); }
        else if (mtf.strength === 'moderate') { score -= 20; signals.push('MTF confluence modérée ↓'); }
        else                                  { score -= 8; }
    }

    if (mtf.counterTrend) { score = Math.round(score * 0.4); signals.push('⚠️ CONTRE-TENDANCE H1 — signal réduit 60%'); }

    // ── B. ZONE PROXIMITY (NOUVEAU — coeur du changement v5) ────
    // Si le prix est dans une zone clé, le score est fortement amplifié
    // C'est ce qui permet d'émettre le signal AVANT le move
    const zp = computeZoneProximity(smc, ict, hlz, candles, livePrice);
    if (zp.inZone) {
        score += zp.zoneBonus;
        signals.push(...zp.zoneDesc);
        signals.push(`📍 PRICE IN ZONE — seuil réduit à 15`);
    }

    // ── C. SMC (simplifié — uniquement les signaux forts) ────────
    // Supprimé : BOS, CHoCH (trop tardifs)
    // Conservé : MSS (Market Structure Shift) et Liquidity Sweep
    if (smc.mss?.type === 'bullish') { score += 18; signals.push('MSS haussier confirmé'); }
    if (smc.mss?.type === 'bearish') { score -= 18; signals.push('MSS baissier confirmé'); }

    // ── D. ICT Kill Zone (timing) ────────────────────────────────
    if (ict.killZone?.quality === 3) { score += 10; signals.push(`${ict.killZone.name} — haute volatilité`); }
    if (ict.killZone?.quality === 1) { score = Math.round(score * 0.7); signals.push('Session asiatique — signal réduit'); }

    // ── E. Volume Profile gate (uniquement si volume réel) ───────
    if (volProfile.inVolumeVoid && !volProfile.noVolume) { score = Math.round(score * 0.3); signals.push('⚠️ VIDE DE VOLUME — signal réduit 70%'); }

    // ── F. DXY (filtre directionnel) ─────────────────────────────
    if (dxy?.available) {
        if (dxy.favoursBuy  && score > 0) { score += 8; signals.push(`DXY ${dxy.dxyBias} → favorable BUY`); }
        if (dxy.favoursSell && score < 0) { score -= 8; signals.push(`DXY ${dxy.dxyBias} → favorable SELL`); }
    }

    // ── G. VETO SYSTEM (allégé — v5 ne garde que 2 vetos critiques) ──
    // SUPPRIMÉ : veto ADX faible (causait trop de rejets à tort)
    // SUPPRIMÉ : veto Ichimoku H1 (retard)
    // CONSERVÉ : H1 fortement contre-tendance (sécurité)

    const h1Bias = mtf.hasH1 ? mtf.tf60?.bias : null;

    // Veto 1 : H1 contre-tendance forte (score faible uniquement)
    if (h1Bias === 'bearish' && score > 0 && score < 35 && !zp.inZone) {
        signals.push('⛔ VETO : H1 baissier — BUY faible sans zone annulé'); score = 0;
    }
    if (h1Bias === 'bullish' && score < 0 && score > -35 && !zp.inZone) {
        signals.push('⛔ VETO : H1 haussier — SELL faible sans zone annulé'); score = 0;
    }

    // Veto 2 : Session asiatique + signal faible = pas de trade
    if (ict.killZone?.bias === 'range' && Math.abs(score) < 25) {
        score = Math.round(score * 0.5);
        signals.push('⛔ Session range — signal réduit');
    }

    return {
        score: Math.max(-100, Math.min(100, Math.round(score))),
        signals,
        inZone: zp.inZone,
        zoneDirection: zp.zoneDirection,
    };
}

// ── 13. Market Structure (inchangé) ──────────────────────────────

function analyzeMarketStructure(candles) {
    if (candles.length < 20) return { trend: 'undetermined', strength: 'weak', hhCount: 0, hlCount: 0, llCount: 0, lhCount: 0 };
    const { highs, lows } = getSwings(candles, 5);
    if (highs.length < 2 || lows.length < 2) return { trend: 'undetermined', strength: 'weak' };
    const rH = highs.slice(-4), rL = lows.slice(-4);
    const hhCount = rH.slice(1).filter((h, i) => h.price > rH[i].price).length;
    const hlCount = rL.slice(1).filter((l, i) => l.price > rL[i].price).length;
    const llCount = rL.slice(1).filter((l, i) => l.price < rL[i].price).length;
    const lhCount = rH.slice(1).filter((h, i) => h.price < rH[i].price).length;
    let trend = 'range', strength = 'weak';
    if (hhCount >= 2 && hlCount >= 2)      { trend = 'bullish'; strength = 'strong'; }
    else if (llCount >= 2 && lhCount >= 2) { trend = 'bearish'; strength = 'strong'; }
    else if (hhCount >= 1 && hlCount >= 1) { trend = 'bullish'; strength = 'moderate'; }
    else if (llCount >= 1 && lhCount >= 1) { trend = 'bearish'; strength = 'moderate'; }
    return { trend, strength, hhCount, hlCount, llCount, lhCount, lastHigh: highs[highs.length - 1] || null, lastLow: lows[lows.length - 1] || null };
}

// ── EXPORT PRINCIPAL ──────────────────────────────────────────────

async function analyze(candles, symbol, options = {}) {
    if (!candles || candles.length < 20) return null;
    const { m15Candles, h1Candles, dxyCandles, livePrice } = options;
    const price = livePrice || candles[candles.length - 1].close;

    const smc        = analyzeSMC(candles);
    const ict        = analyzeICT(candles);
    const hlz        = analyzeHLZ(candles);
    const volProfile = analyzeVolumeProfile(candles, price);
    const dxy        = analyzeDXYCorrelation(symbol, dxyCandles || null);
    const mtf        = analyzeMTF(candles, m15Candles || candles, h1Candles || candles);

    // ── Score composite v5 : passe les candles et livePrice pour zone proximity ──
    const { score, signals, inZone, zoneDirection } = computeCompositeScore(
        mtf, smc, ict, hlz, volProfile, dxy, symbol, candles, price
    );

    // ── Seuil adaptatif v5 : si in zone → seuil bas → signal anticipé ──
    const threshold = inZone ? 15 : 28;
    const direction = score >= threshold ? 'BUY' : score <= -threshold ? 'SELL' : 'HOLD';

    // SL/TP structurels
    let levels = null;
    if (direction !== 'HOLD') {
        let entryPrice = price;
        const ob = smc.orderBlocks?.find(o => o.type === (direction === 'BUY' ? 'bullish' : 'bearish'));
        const oteZone = ict.ote;
        if (oteZone && oteZone.type === (direction === 'BUY' ? 'bullish_ote' : 'bearish_ote')) {
            entryPrice = oteZone.level;
        } else if (ob) {
            entryPrice = ob.mid;
        }
        const maxDrift = price * 0.003;
        if (Math.abs(entryPrice - price) > maxDrift) entryPrice = price;
        levels = computeStructuralLevels(candles, direction, entryPrice, hlz);
    }

    // Confirmations majeures (pour confidence)
    let majorConfirmations = 0;
    if (mtf.aligned) majorConfirmations++;
    if (smc.bos?.volumeConfirmed) majorConfirmations++;
    if (smc.mss?.type === (direction === 'BUY' ? 'bullish' : 'bearish')) majorConfirmations++;
    if (smc.liquiditySweep) majorConfirmations++;
    if (ict.ote) majorConfirmations++;
    if (ict.killZone?.quality >= 2) majorConfirmations++;
    if (inZone) majorConfirmations++;  // être dans une zone = confirmation supplémentaire

    const baseConf   = Math.min(95, Math.abs(score) * 0.6 + 20);
    const mtfBonus   = mtf.aligned ? 15 : mtf.strength === 'moderate' ? 8 : 0;
    const confBonus  = Math.min(15, majorConfirmations * 3);
    const confidence = Math.min(95, Math.round(baseConf + mtfBonus + confBonus));

    const kelly = levels ? kellySize(confidence, levels.rr) : null;

    const structM1 = analyzeMarketStructure(candles);
    const structH1 = h1Candles ? analyzeMarketStructure(h1Candles) : null;

    return {
        direction, score, confidence, signals, majorConfirmations,
        inZone, zoneDirection, threshold,  // nouvelles propriétés v5
        levels, kelly,
        marketStructure: { m1: structM1, h1: structH1 },
        mtf: {
            direction: mtf.direction, strength: mtf.strength, confluence: mtf.confluence, counterTrend: mtf.counterTrend,
            tf1: mtf.tf1, tf15: mtf.tf15, tf60: mtf.tf60,
            ichimoku: mtf.tf1.ichimoku, supertrend: mtf.tf1.supertrend,
        },
        smc, ict, hlz, volProfile, dxy,
    };
}

module.exports = {
    analyze,
    analyzeSMC, analyzeICT, analyzeHLZ, analyzeVolumeProfile,
    analyzeDXYCorrelation, analyzeMTF, computeCompositeScore,
    computeStructuralLevels, kellySize, analyzeMarketStructure,
    scoreTF, computeZoneProximity,
};
