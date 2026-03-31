'use strict';
const logger = require('../utils/logger');
const API_KEY  = process.env.MISTRAL_API_KEY || '';
const MODEL    = process.env.MISTRAL_MODEL || 'mistral-small-latest';
const BASE_URL = 'https://api.mistral.ai/v1';

async function callMistral(messages, maxTokens = 1200) {
    if (!API_KEY) return null;
    let nodeFetch;
    try { nodeFetch = (await import('node-fetch')).default; } catch { throw new Error('node-fetch unavailable'); }
    const res = await nodeFetch(`${BASE_URL}/chat/completions`, {
        method:'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` },
        body: JSON.stringify({ model:MODEL, messages, max_tokens:maxTokens, temperature:0.2 }),
    });
    if (!res.ok) throw new Error(`Mistral ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
}

function extractJSON(raw) {
    if (!raw) return null;
    let s = raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    try { return JSON.parse(s); } catch {}
    const i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i !== -1 && j > i) try { return JSON.parse(s.slice(i,j+1)); } catch {}
    return null;
}

async function analyzeMarket(context) {
    const ind = context.indicators || {};
    const messages = [
        { role:'system', content:'You are El Joven Scalp PRO. Respond ONLY valid JSON: {"signal":"BUY|SELL|HOLD","confidence":0-100,"entry":number,"stopLoss":number,"takeProfit":number,"rr":number,"reasoning":"max 80 words","keyLevels":[number,number],"timeframesBias":{"1min":"bull|bear|neutral","5min":"bull|bear|neutral","15min":"bull|bear|neutral"}}' },
        { role:'user', content:`${context.symbol} @ ${context.price} | TF:${context.timeframe} | RSI:${ind.rsi?.toFixed?.(1)||'N/A'} | MACD:${ind.macdLine?.toFixed?.(4)||'N/A'} | ATR:${ind.atr?.toFixed?.(2)||'N/A'} | EMA9:${ind.ema9||'N/A'} | ST:${ind.supertrend?.signal||'N/A'} | Score:${context.compositeScore}` },
    ];
    try {
        const raw = await callMistral(messages, 600);
        const parsed = extractJSON(raw);
        return parsed?.signal ? parsed : null;
    } catch (err) {
        logger.warn('Mistral error', { err:err.message });
        return null;
    }
}

async function chat(messages, context) {
    const msgs = [
        { role:'system', content:`El Joven Scalp AI assistant. ${context.symbol}@${context.price}. Be concise, focus on scalping.` },
        ...messages.map(m => ({ role:m.role||'user', content:m.content })),
    ];
    try {
        const raw = await callMistral(msgs, 700);
        return raw || '⚠️ Mistral key issue. Check console.mistral.ai';
    } catch (err) {
        return `⚠️ Mistral error: ${err.message}`;
    }
}

module.exports = { analyzeMarket, chat, callMistral };
