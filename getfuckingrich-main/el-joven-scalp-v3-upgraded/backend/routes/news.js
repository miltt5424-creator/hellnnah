'use strict';

const { Router } = require('express');
const router = Router();

const GNEWS_KEY = process.env.GNEWS_API_KEY || '';
const CACHE_MS  = 5 * 60 * 1000;
let newsCache   = { data: null, ts: 0, source: '' };

const QUERY = 'forex OR gold OR bitcoin OR "stock market" OR "interest rate"';

async function fetchGNews() {
    if (!GNEWS_KEY) return null;
    let nodeFetch;
    try { nodeFetch = (await import('node-fetch')).default; } catch { return null; }
    try {
        const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(QUERY)}&lang=en&max=10&apikey=${GNEWS_KEY}`;
        const res = await nodeFetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return null;
        const data = await res.json();
        return (data.articles || []).map((a, i) => ({
            id: i + 1, title: a.title,
            source: a.source?.name || 'GNews', url: a.url,
            sentiment: guessSentiment(a.title), impact: 'medium',
            ts: new Date(a.publishedAt).getTime(),
        }));
    } catch { return null; }
}

function guessSentiment(title) {
    const t = title.toLowerCase();
    const bull = ['surge','rally','gains','rises','jumps','bullish','record','beats','strong'].filter(w => t.includes(w)).length;
    const bear = ['falls','drops','decline','crash','bearish','weak','miss','concern','fear'].filter(w => t.includes(w)).length;
    return bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
}

const FALLBACK = [
    { id:1, title:'Gold holds near record highs amid dollar weakness',     source:'Reuters',    sentiment:'bullish', impact:'high',   ts: Date.now()-1800000 },
    { id:2, title:'Fed signals data-dependent approach to rate cuts',       source:'Bloomberg',  sentiment:'neutral', impact:'high',   ts: Date.now()-3600000 },
    { id:3, title:'Bitcoin consolidates above $67k after ETF inflows',      source:'CoinDesk',   sentiment:'bullish', impact:'medium', ts: Date.now()-5400000 },
    { id:4, title:'EUR/USD steady ahead of ECB policy meeting',             source:'FX Street',  sentiment:'neutral', impact:'medium', ts: Date.now()-7200000 },
    { id:5, title:'Oil prices slip on demand outlook concerns from Asia',   source:'FT',         sentiment:'bearish', impact:'medium', ts: Date.now()-9000000 },
    { id:6, title:'NVIDIA reports blowout earnings, shares surge 8%',       source:'MarketWatch',sentiment:'bullish', impact:'high',   ts: Date.now()-10800000 },
    { id:7, title:'US jobless claims come in below expectations again',     source:'WSJ',        sentiment:'bullish', impact:'medium', ts: Date.now()-12600000 },
    { id:8, title:'GBP/USD retreats from weekly highs on UK CPI data',      source:'FX Street',  sentiment:'bearish', impact:'low',    ts: Date.now()-14400000 },
];

router.get('/', async (_req, res) => {
    if (newsCache.data && Date.now() - newsCache.ts < CACHE_MS) {
        return res.json({ success: true, news: newsCache.data, source: newsCache.source });
    }
    const live = await fetchGNews();
    if (live) {
        newsCache = { data: live, ts: Date.now(), source: 'gnews' };
        return res.json({ success: true, news: live, source: 'gnews' });
    }
    return res.json({ success: true, news: FALLBACK, source: 'demo' });
});

module.exports = router;
