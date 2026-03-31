'use strict';

const logger = require('../utils/logger');
const API_KEY = process.env.OPENROUTER_API_KEY || '';

const FREE_MODELS = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-r1:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-7b-instruct:free',
];

const SIGNAL_MODEL = FREE_MODELS[0];
const CHAT_MODEL   = FREE_MODELS[0];

async function callOpenRouter(systemPrompt, userMessage, model, maxTokens = 1024) {
    if (!API_KEY) return null;

    let nodeFetch;
    try { nodeFetch = (await import('node-fetch')).default; } catch { throw new Error('node-fetch unavailable'); }

    const res = await nodeFetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'HTTP-Referer': 'https://eljoven.trade',
            'X-Title': 'El Joven Scalp',
        },
        body: JSON.stringify({
            model: model || SIGNAL_MODEL,
            max_tokens: maxTokens,
            temperature: 0.3,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMessage },
            ],
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim();
}

function extractJSON(raw) {
    if (!raw) return null;
    // Remove <think> blocks (DeepSeek R1)
    let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Remove markdown fences
    s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try { return JSON.parse(s); } catch { /**/ }
    const start = s.indexOf('{');
    const end   = s.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        try { return JSON.parse(s.slice(start, end + 1)); } catch { /**/ }
    }
    return null;
}

async function analyzeMarket(context) {
    const system = `You are El Joven Scalp AI analyst. Respond ONLY with valid JSON (no markdown, no explanation):
{"signal":"BUY|SELL|HOLD","confidence":0-100,"entry":number,"stopLoss":number,"takeProfit":number,"reasoning":"max 60 words","keyLevels":[number,number],"timeframesBias":{"1min":"bull|bear|neutral","5min":"bull|bear|neutral","15min":"bull|bear|neutral"}}`;

    const user = `Symbol:${context.symbol} Price:${context.price} RSI:${context.indicators?.rsi?.toFixed(1)||'N/A'} Score:${context.compositeScore} TF:${context.timeframe}. Generate scalping signal JSON.`;

    try {
        const raw = await callOpenRouter(system, user, SIGNAL_MODEL, 600);
        if (!raw) return null;
        const parsed = extractJSON(raw);
        if (!parsed) { logger.warn('OpenRouter: no valid JSON found', { raw: raw.slice(0, 200) }); return null; }
        return parsed;
    } catch (err) {
        logger.warn('OpenRouter analysis error', { err: err.message });
        return null;
    }
}

async function chat(messages, context) {
    const system = `You are El Joven Scalp AI assistant via OpenRouter (free models: Llama 3.3, DeepSeek R1). Context: ${context.symbol} @ ${context.price}. Be concise, focus on scalping. Answer in user's language.`;
    const lastMsg = messages[messages.length - 1]?.content || '';
    const raw = await callOpenRouter(system, lastMsg, CHAT_MODEL, 800);
    if (!raw) return `⚠️ Ajoute OPENROUTER_API_KEY dans .env — gratuit sur openrouter.ai`;
    return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

module.exports = { analyzeMarket, chat, callOpenRouter, FREE_MODELS };
