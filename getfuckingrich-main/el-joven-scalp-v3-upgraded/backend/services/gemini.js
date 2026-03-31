'use strict';
const logger = require('../utils/logger');
const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL   = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

async function callGemini(systemPrompt, userMessage, maxTokens = 1500) {
    if (!API_KEY) return null;
    let nodeFetch;
    try { nodeFetch = (await import('node-fetch')).default; } catch { throw new Error('node-fetch unavailable'); }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const res = await nodeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role:'user', parts:[{ text:userMessage }] }],
            systemInstruction: { parts:[{ text:systemPrompt }] },
            generationConfig: { maxOutputTokens:maxTokens, temperature:0.15, topP:0.8 },
        }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

function extractJSON(raw) {
    if (!raw) return null;
    let s = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    try { return JSON.parse(s); } catch {}
    const start = s.indexOf('{'); const end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        try { return JSON.parse(s.slice(start, end + 1)); } catch {}
    }
    return null;
}

async function analyzeMarket(context) {
    const system = `You are El Joven Scalp PRO — elite institutional trading AI.
You analyze markets using SMC (Smart Money Concepts), ICT methodology, HLZ zones, and Order Flow.
You MUST respond ONLY with valid JSON, no markdown, no text outside JSON.

Required JSON format:
{
  "signal": "BUY|SELL|HOLD",
  "confidence": 0-100,
  "entry": number,
  "stopLoss": number,
  "takeProfit": number,
  "rr": number,
  "reasoning": "max 120 words explaining SMC/ICT/HLZ/OrderFlow confluence",
  "keyLevels": [number, number, number],
  "timeframesBias": {"1min":"bull|bear|neutral","5min":"bull|bear|neutral","15min":"bull|bear|neutral"},
  "riskNote": "brief risk warning",
  "strategy": "SMC|ICT|HLZ|OrderFlow|Mixed"
}

RULES:
- Only give BUY/SELL if at least 2 strategies confirm
- BUY signal: stopLoss MUST be BELOW entry price, takeProfit MUST be ABOVE entry price
- SELL signal: stopLoss MUST be ABOVE entry price, takeProfit MUST be BELOW entry price
- NEVER put TP in the wrong direction — double check before responding
- SL must be BEYOND the nearest structure (Order Block, swing high/low, HLZ)
- TP must target the next liquidity pool or HLZ resistance/support
- Minimum RR ratio of 1.5, ideally 2.0+
- If in Kill Zone → higher confidence allowed
- If liquidity sweep detected → high probability reversal
- HOLD if confluence is weak or conflicting`;

    const ind  = context.indicators || {};
    const strat = context.strategy || {};
    const smc  = strat.smc || {};
    const ict  = strat.ict || {};
    const hlz  = strat.hlz || {};
    const of   = strat.orderFlow || {};

    const user = `
=== MARKET DATA ===
Symbol: ${context.symbol} | Price: ${context.price} | Timeframe: ${context.timeframe}

=== CLASSIC INDICATORS ===
RSI(14): ${ind.rsi||'N/A'} | MACD: ${ind.macdHistogram>0?'+':''}${ind.macdHistogram||'N/A'} | ATR: ${ind.atr||'N/A'}
EMA9: ${ind.ema9||'N/A'} | EMA21: ${ind.ema21||'N/A'} | EMA50: ${ind.ema50||'N/A'}
BB Upper: ${ind.bbUpper||'N/A'} | BB Lower: ${ind.bbLower||'N/A'}
StochRSI K: ${ind.stochRsi?.k?.toFixed(1)||'N/A'} | D: ${ind.stochRsi?.d?.toFixed(1)||'N/A'} | Signal: ${ind.stochRsi?.signal||'N/A'}
VWAP: ${ind.vwap?.toFixed(2)||'N/A'} | Price vs VWAP: ${ind.vwap&&context.price?(context.price>ind.vwap?'ABOVE ↑':'BELOW ↓'):'N/A'}
RSI Divergence: ${ind.rsiDivergence?.signal||'none'} | OBV Trend: ${ind.obv?.trend||'N/A'} | CVD: ${ind.cvd?.trend||'N/A'}
Volume Profile POC: ${ind.volumeProfile?.poc||'N/A'} | VAH: ${ind.volumeProfile?.vah||'N/A'} | VAL: ${ind.volumeProfile?.val||'N/A'}
Composite Score: ${context.compositeScore>0?'+':''}${context.compositeScore}

=== SESSIONS ASIATIQUES ===
Session Active: ${(()=>{const h=new Date().getUTCHours();return h>=0&&h<8?'ASIE 🔴 (range, éviter scalp directionnel)':h>=7&&h<16?'LONDON/EU 🟢 (directionnelle)':h>=13&&h<22?'NEW YORK 🟢 (directionnelle)':'OFF-HOURS ⚪';})()}
Overlap London+NY: ${(()=>{const h=new Date().getUTCHours();return h>=13&&h<16?'OUI — volume maximum 🔥':'non';})()}

=== SMC ANALYSIS ===
Bias: ${smc.bias||'neutral'}
BOS: ${smc.bos?`${smc.bos.type} at ${smc.bos.level}`:'none'}
CHOCH: ${smc.choch?`${smc.choch.type} at ${smc.choch.level}`:'none'}
Order Blocks: ${smc.orderBlocks?.length?smc.orderBlocks.map(ob=>`${ob.type} [${ob.low?.toFixed(2)}-${ob.high?.toFixed(2)}]`).join(', '):'none'}
Fair Value Gaps: ${smc.fvg?.length?smc.fvg.map(f=>`${f.type} [${f.bottom?.toFixed(2)}-${f.top?.toFixed(2)}]`).join(', '):'none'}

=== ICT ANALYSIS ===
Kill Zone: ${ict.killZone?`${ict.killZone.name} (${ict.killZone.bias})`:'none'}
Liquidity Sweep: ${ict.liquiditySweep?`${ict.liquiditySweep.type} at ${ict.liquiditySweep.level?.toFixed(2)}`:'none'}
OTE Zone: ${ict.ote?`${ict.ote.type} at ${ict.ote.level?.toFixed(2)} (fib618=${ict.ote.fib618?.toFixed(2)}, fib79=${ict.ote.fib79?.toFixed(2)})`:'none'}
PD Array: ${ict.pdArray?.length?ict.pdArray.map(p=>`${p.label}=${p.price?.toFixed(2)}`).join(', '):'none'}

=== HLZ — KEY ZONES ===
Nearest Support: ${hlz.nearestSupport?`${hlz.nearestSupport.price?.toFixed(2)} (strength:${hlz.nearestSupport.strength})`:'none'}
Nearest Resistance: ${hlz.nearestResistance?`${hlz.nearestResistance.price?.toFixed(2)} (strength:${hlz.nearestResistance.strength})`:'none'}
Supports: ${hlz.supports?.map(s=>s.price?.toFixed(2)).join(', ')||'none'}
Resistances: ${hlz.resistances?.map(r=>r.price?.toFixed(2)).join(', ')||'none'}

=== ORDER FLOW ===
Delta: ${of.delta||0} | Imbalance: ${of.imbalance||'neutral'} | Momentum: ${of.momentum||'neutral'}
Buy Pressure: ${of.buyPressure||0}% | Sell Pressure: ${of.sellPressure||0}%
Bull Sequence: ${of.bullSequence||0} | Bear Sequence: ${of.bearSequence||0}
Absorption: ${of.absorption?'YES':'no'}

=== HTF BIAS ===
HTF Bias: ${strat.htf?.bias||'neutral'} | Trend: ${strat.htf?.trend||'N/A'} | EMA20vsEMA50: ${strat.htf?.ema20vsEma50||'N/A'}
Volatility: ${strat.htf?.volatility||'N/A'} | Tradeable: ${strat.htf?.tradeable!==false?'YES':'NO — faible volatilité'}
ATR%: ${strat.htf?.atrPct||'N/A'}%

=== SMC AVANCÉ ===
MSS: ${strat.smc?.mss?`${strat.smc.mss.type} confirmé @ ${strat.smc.mss.level?.toFixed(2)}`:'none'}
Inducement: ${strat.smc?.inducementLevel?`${strat.smc.inducementLevel.type} @ ${strat.smc.inducementLevel.level?.toFixed(2)} — ${strat.smc.inducementLevel.desc}`:'none'}
Mitigation Blocks: ${strat.smc?.mitigationBlocks?.length?strat.smc.mitigationBlocks.map(m=>`${m.type} [${m.low?.toFixed(2)}-${m.high?.toFixed(2)}]`).join(', '):'none'}

=== ICT AVANCÉ ===
Session Overlap London+NY: ${strat.ict?.sessionOverlap?'OUI — volume maximum':'non'}
Premium/Discount: ${strat.ict?.premiumDiscount?`Zone ${strat.ict.premiumDiscount.zone?.toUpperCase()} (${strat.ict.premiumDiscount.pct}% du range) — Equilibrium: ${strat.ict.premiumDiscount.equilibrium?.toFixed(2)}`:'N/A'}
Prochaine Kill Zone: ${strat.ict?.nextKillZone?`${strat.ict.nextKillZone.name} dans ${strat.ict.nextKillZone.hoursLeft}h`:'N/A'}

=== ORDER FLOW AVANCÉ ===
Rejection Candle: ${strat.orderFlow?.rejectionCandle?`${strat.orderFlow.rejectionCandle.type} (force: ${strat.orderFlow.rejectionCandle.strength})`:'none'}

=== STRATEGY SIGNALS ===
${strat.signals?.join('\n')||'none'}
Strategy Score: ${strat.score>0?'+':''}${strat.score||0}/100

=== ALGO ENTRY SUGGESTION ===
Entry: ${strat.preciseEntry?.entry?.toFixed(5)||context.price}
SL: ${strat.preciseEntry?.stopLoss?.toFixed(5)||'N/A'}
TP: ${strat.preciseEntry?.takeProfit?.toFixed(5)||'N/A'}
Reason: ${strat.preciseEntry?.entryReason||'N/A'}

Generate your institutional signal JSON for ${context.symbol}.`;

    try {
        const raw = await callGemini(system, user, 1500);
        console.log("[GEMINI RAW LEN]", raw?.length, raw?.slice(0,100));
        if (!raw) return null;
        const parsed = extractJSON(raw);
        if (!parsed?.signal) { logger.warn('Gemini: invalid JSON', { raw: raw.slice(0,400) }); console.log('RAW GEMINI:', raw.slice(0,500)); return null; }
        return parsed;
    } catch (err) {
        logger.warn('Gemini analyzeMarket error', { err: err.message });
        return null;
    }
}

module.exports = { analyzeMarket };
