'use strict';
const logger = require('../utils/logger');
const API_KEY = process.env.GROK_API_KEY || '';
const MODEL   = process.env.GROK_MODEL || 'grok-3-mini';
const BASE_URL = 'https://api.x.ai/v1';

async function callGrok(messages, maxTokens = 1200) {
    if (!API_KEY) return null;
    let nodeFetch;
    try { nodeFetch = (await import('node-fetch')).default; } catch { throw new Error('node-fetch unavailable'); }
    const res = await nodeFetch(`${BASE_URL}/chat/completions`, {
        method:'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` },
        body: JSON.stringify({ model:MODEL, messages, max_tokens:maxTokens, temperature:0.2 }),
    });
    if (!res.ok) throw new Error(`Grok ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
}

function extractJSON(raw) {
    if (!raw) return null;
    let s = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    try { return JSON.parse(s); } catch {}
    const start = s.indexOf('{'); const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) try { return JSON.parse(s.slice(start, end+1)); } catch {}
    return null;
}

async function analyzeMarket(context) {
    const strat = context.strategy || {};
    const smc   = strat.smc || {};
    const ict   = strat.ict || {};
    const hlz   = strat.hlz || {};
    const of    = strat.orderFlow || {};
    const htf   = strat.htf || {};
    const pe    = strat.preciseEntry || {};
    const ind = context.indicators || {};
    const messages = [
        { role:'system', content:`You are El Joven Scalp PRO — elite institutional trading AI using SMC, ICT, HLZ, Order Flow.
Respond ONLY with valid JSON, no markdown, no text outside JSON.
Format: {"signal":"BUY|SELL|HOLD","confidence":0-100,"entry":number,"stopLoss":number,"takeProfit":number,"rr":number,"reasoning":"max 100 words — explain SMC/ICT/HLZ confluence","keyLevels":[number,number,number],"timeframesBias":{"1min":"bull|bear|neutral","5min":"bull|bear|neutral","15min":"bull|bear|neutral"},"strategy":"SMC|ICT|HLZ|Mixed"}
RULES: BUY/SELL only if 2+ strategies confirm. SL beyond structure. TP at next liquidity. HOLD if weak confluence. If volatility low → HOLD.` },
        { role:'user', content:`SYMBOL: ${context.symbol} | PRICE: ${context.price} | TF: ${context.timeframe}
INDICATORS: RSI=${context.indicators?.rsi} ATR=${context.indicators?.atr} EMA9=${context.indicators?.ema9} EMA21=${context.indicators?.ema21}
HTF: bias=${htf.bias||'neutral'} trend=${htf.trend} volatility=${htf.volatility} tradeable=${htf.tradeable}
SMC: bias=${smc.bias||'neutral'} BOS=${smc.bos?smc.bos.type+' @ '+smc.bos.level:'none'} MSS=${smc.mss?smc.mss.type+' confirmed':'none'} CHOCH=${smc.choch?smc.choch.type:'none'}
OB=${smc.orderBlocks?.length?smc.orderBlocks.map(o=>o.type+'['+o.low?.toFixed(2)+'-'+o.high?.toFixed(2)+']').join(','):'none'}
FVG=${smc.fvg?.length?smc.fvg.map(f=>f.type+'['+f.bottom?.toFixed(2)+'-'+f.top?.toFixed(2)+']').join(','):'none'}
Inducement=${smc.inducementLevel?smc.inducementLevel.type+' @ '+smc.inducementLevel.level?.toFixed(2):'none'}
ICT: KillZone=${ict.killZone?ict.killZone.name:'none'} Overlap=${ict.sessionOverlap?'YES':'no'} Sweep=${ict.liquiditySweep?ict.liquiditySweep.type+' @ '+ict.liquiditySweep.level?.toFixed(2):'none'} OTE=${ict.ote?ict.ote.type+' @ '+ict.ote.level?.toFixed(2):'none'} PremiumDiscount=${ict.premiumDiscount?ict.premiumDiscount.zone+'('+ict.premiumDiscount.pct+'%)':'N/A'}
HLZ: Support=${hlz.nearestSupport?hlz.nearestSupport.price?.toFixed(2):'none'} Resistance=${hlz.nearestResistance?hlz.nearestResistance.price?.toFixed(2):'none'}
OF: delta=${of.delta} imbalance=${of.imbalance} momentum=${of.momentum} rejection=${of.rejectionCandle?of.rejectionCandle.type:'none'}
SIGNALS: ${strat.signals?.join(' | ')||'none'} | Score: ${strat.score||0}
ALGO ENTRY: ${pe.entry} SL=${pe.stopLoss} TP=${pe.takeProfit} RR=${pe.rr} reason=${pe.entryReason}
Generate institutional signal JSON.` },
        { role:'user', content:`Symbol:${context.symbol} Price:${context.price} TF:${context.timeframe} RSI:${ind.rsi?.toFixed?.(1)||'N/A'} MACD:${ind.macdLine?.toFixed?.(4)||'N/A'} ATR:${ind.atr?.toFixed?.(2)||'N/A'} EMA9:${ind.ema9||'N/A'} EMA21:${ind.ema21||'N/A'} Supertrend:${ind.supertrend?.signal||'N/A'} Score:${context.compositeScore}. Generate scalping signal.` },
    ];
    try {
        const raw = await callGrok(messages, 600);
        const parsed = extractJSON(raw);
        if (!parsed?.signal) return null;
        return parsed;
    } catch (err) {
        logger.warn('Grok analyzeMarket error', { err:err.message });
        return null;
    }
}

async function chat(messages, context) {
    const msgs = [
        { role:'system', content:`You are El Joven Scalp AI — expert scalping assistant. ${context.symbol}@${context.price}. Be concise.` },
        ...messages.map(m => ({ role:m.role||'user', content:m.content })),
    ];
    try {
        const raw = await callGrok(msgs, 700);
        return raw || '⚠️ Grok API key not working. Check console.x.ai';
    } catch (err) {
        return `⚠️ Grok error: ${err.message}`;
    }
}

module.exports = { analyzeMarket, chat, callGrok };
