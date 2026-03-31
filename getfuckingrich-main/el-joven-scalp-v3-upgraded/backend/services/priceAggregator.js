'use strict';
/**
 * Price Aggregator v2 — El Joven Scalp PRO
 * ==========================================
 * Changements v1 → v2 :
 *  ① getLiveCandle(symbol) : retourne la candle M1 EN COURS (non fermée)
 *     → permet au limitSignal de détecter les wicks de rejet en temps réel
 *     → SANS attendre la close de la bougie (élimine le retard "closed candle only")
 *  ② TTL cache 1min : 15s → 5s pour le zone scan (scan toutes les 10s)
 *  ③ Reste du fichier INCHANGÉ
 */

const logger = require('../utils/logger');

let nodeFetch = null;
async function getFetch() {
    if (!nodeFetch) try { nodeFetch = (await import('node-fetch')).default; } catch { nodeFetch = require('node-fetch'); }
    return nodeFetch;
}

const SYMBOL_MAP = {
    'XAU/USD':    { binance: null,       yahoo: 'GC=F',      type: 'commodity' },
    'XAG/USD':    { binance: null,       yahoo: 'SI=F',      type: 'commodity' },
    'WTI/USD':    { binance: null,       yahoo: 'CL=F',      type: 'commodity' },
    'BTC/USD':    { binance: 'BTCUSDT',  yahoo: 'BTC-USD',   type: 'crypto'    },
    'ETH/USD':    { binance: 'ETHUSDT',  yahoo: 'ETH-USD',   type: 'crypto'    },
    'SOL/USD':    { binance: 'SOLUSDT',  yahoo: 'SOL-USD',   type: 'crypto'    },
    'BNB/USD':    { binance: 'BNBUSDT',  yahoo: 'BNB-USD',   type: 'crypto'    },
    'EUR/USD':    { binance: null,       yahoo: 'EURUSD=X',  type: 'forex'     },
    'GBP/USD':    { binance: null,       yahoo: 'GBPUSD=X',  type: 'forex'     },
    'USD/JPY':    { binance: null,       yahoo: 'USDJPY=X',  type: 'forex'     },
    'AUD/USD':    { binance: null,       yahoo: 'AUDUSD=X',  type: 'forex'     },
    'USD/CHF':    { binance: null,       yahoo: 'USDCHF=X',  type: 'forex'     },
    'NAS100/USD': { binance: null,       yahoo: 'NQ=F',      type: 'index'     },
    'SPX500/USD': { binance: null,       yahoo: 'ES=F',      type: 'index'     },
    'US30/USD':   { binance: null,       yahoo: 'YM=F',      type: 'index'     },
    'AAPL/USD':   { binance: null,       yahoo: 'AAPL',      type: 'stock'     },
    'TSLA/USD':   { binance: null,       yahoo: 'TSLA',      type: 'stock'     },
    'NVDA/USD':   { binance: null,       yahoo: 'NVDA',      type: 'stock'     },
};

const BASE_PRICES = {
    'XAU/USD': 3350, 'XAG/USD': 32.5,  'WTI/USD': 82,
    'BTC/USD': 95000,'ETH/USD': 3200,   'SOL/USD': 185, 'BNB/USD': 600,
    'EUR/USD': 1.085,'GBP/USD': 1.270,  'USD/JPY': 149.5,'AUD/USD': 0.642,'USD/CHF': 0.905,
    'NAS100/USD': 21500,'SPX500/USD': 5800,'US30/USD': 42800,
    'AAPL/USD': 220,'TSLA/USD': 245,'NVDA/USD': 875,
};

const priceCache   = {};
const CACHE_TTL    = 5 * 1000;   // 5s live price cache

const historyCache = {};
// ⚡ TTL réduit pour 1min : 5s (était 15s) → zone scan toutes les 10s a besoin de données fraîches
function getHistTTL(timeframe) {
    const ttls = { '1min': 5*1000, '5min': 20*1000, '15min': 30*1000, '1h': 60*1000, '4h': 2*60*1000, '1d': 5*60*1000 };
    return ttls[timeframe] || 15*1000;
}

// Cache de la candle live (en cours, non fermée)
const liveCandle = {};
const LIVE_CANDLE_TTL = 3 * 1000; // 3s

const priceState = {};
function simulatePrice(symbol) {
    const base = BASE_PRICES[symbol] || 1000;
    if (!priceState[symbol]) priceState[symbol] = { price: base };
    const s = priceState[symbol];
    const vol = base * 0.0006;
    s.price = Math.max(base * 0.75, Math.min(base * 1.25, s.price + (Math.random() - 0.495) * vol));
    const change = s.price - base, changePct = (change / base) * 100, spread = s.price * 0.00015;
    const dec = base >= 1000 ? 0 : base >= 100 ? 2 : base >= 1 ? 4 : 5;
    return { symbol, price:+s.price.toFixed(dec), bid:+(s.price-spread).toFixed(dec+1), ask:+(s.price+spread).toFixed(dec+1), change:+change.toFixed(dec), changePct:+changePct.toFixed(3), source:'simulated', ts:Date.now() };
}

async function getBinancePrice(binanceSym) {
    const fetch = await getFetch();
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSym}`, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) throw new Error(`Binance ${r.status}`);
    const j = await r.json();
    const price = parseFloat(j.lastPrice), open = parseFloat(j.openPrice);
    const dec = price >= 1000 ? 0 : price >= 1 ? 2 : 5;
    return { price:+price.toFixed(dec), change:+(price-open).toFixed(dec), changePct:+parseFloat(j.priceChangePercent).toFixed(3), bid:+parseFloat(j.bidPrice).toFixed(dec), ask:+parseFloat(j.askPrice).toFixed(dec), source:'binance' };
}

async function getYahooPrice(yahooSym) {
    const fetch = await getFetch();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1m&range=1d`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent':'Mozilla/5.0', 'Accept':'application/json' } });
    if (!r.ok) throw new Error(`Yahoo ${r.status}`);
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) throw new Error('Yahoo: no price');
    const price = meta.regularMarketPrice, open = meta.chartPreviousClose || meta.regularMarketOpen || price;
    const change = price - open, dec = price >= 1000 ? 0 : price >= 100 ? 2 : price >= 1 ? 4 : 5;
    const spread = price * 0.00015;
    return { price:+price.toFixed(dec), change:+change.toFixed(dec), changePct:+(change/open*100).toFixed(3), bid:+(price-spread).toFixed(dec+1), ask:+(price+spread).toFixed(dec+1), source:'yahoo' };
}

async function getFrankfurterPrice(symbol) {
    if (!symbol.startsWith('EUR/')) throw new Error('Frankfurter: EUR pairs only');
    const quote = symbol.split('/')[1];
    const fetch = await getFetch();
    const r = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${quote}`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`Frankfurter ${r.status}`);
    const data = await r.json();
    const price = data.rates?.[quote];
    if (!price) throw new Error('Frankfurter: no rate');
    const spread = price * 0.0002;
    return { price:+price.toFixed(5), change:0, changePct:0, bid:+(price-spread).toFixed(5), ask:+(price+spread).toFixed(5), source:'frankfurter' };
}

async function getBinanceCandles(binanceSym, interval, limit) {
    const fetch = await getFetch();
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${limit}`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`Binance klines ${r.status}`);
    const data = await r.json();
    const closed = data.filter(c => c[6] < Date.now());
    return closed.map(c => ({ time:c[0]/1000, open:+parseFloat(c[1]).toFixed(5), high:+parseFloat(c[2]).toFixed(5), low:+parseFloat(c[3]).toFixed(5), close:+parseFloat(c[4]).toFixed(5), volume:parseFloat(c[5]) }));
}

// ── NOUVEAU : getBinanceLiveCandle — retourne la bougie EN COURS ──
// Contrairement à getBinanceCandles qui filtre les non-fermées,
// ici on retourne UNIQUEMENT la dernière candle même ouverte.
// Utilisé par limitSignal pour détecter les wicks en temps réel.

async function getBinanceLiveCandle(binanceSym, interval = '1m') {
    const fetch = await getFetch();
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=2`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`Binance live candle ${r.status}`);
    const data = await r.json();
    const c = data[data.length - 1]; // dernière candle (peut être ouverte)
    return {
        time:   c[0] / 1000,
        open:   +parseFloat(c[1]).toFixed(5),
        high:   +parseFloat(c[2]).toFixed(5),
        low:    +parseFloat(c[3]).toFixed(5),
        close:  +parseFloat(c[4]).toFixed(5),
        volume: parseFloat(c[5]),
        isClosed: c[6] < Date.now(),  // true = candle fermée, false = encore ouverte
    };
}

async function getYahooCandles(yahooSym, interval, limit) {
    const rangeMap = { '1m':'1d','5m':'5d','15m':'5d','1h':'1mo','4h':'3mo','1d':'1y' };
    const range = rangeMap[interval] || '5d';
    const fetch = await getFetch();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${interval}&range=${range}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000), headers:{ 'User-Agent':'Mozilla/5.0','Accept':'application/json' } });
    if (!r.ok) throw new Error(`Yahoo candles ${r.status}`);
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('Yahoo: no candle data');
    const { timestamp, indicators:{ quote:[q] } } = result;
    const now = Date.now() / 1000;
    const candles = [];
    for (let i = 0; i < Math.min(timestamp.length, limit); i++) {
        if (!q.close[i]) continue;
        if (now - timestamp[i] < 120) continue; // exclure candle non fermée
        candles.push({ time:timestamp[i], open:+q.open[i].toFixed(5), high:+q.high[i].toFixed(5), low:+q.low[i].toFixed(5), close:+q.close[i].toFixed(5), volume:q.volume?.[i]||0 });
    }
    return candles.slice(-limit);
}

function getSyntheticCandles(symbol, timeframe, limit) {
    logger.warn(`⚠️ DONNÉES SYNTHÉTIQUES pour ${symbol} ${timeframe} — signaux non fiables`);
    const base = BASE_PRICES[symbol] || 1000;
    const tfMs = { '1min':60000,'5min':300000,'15min':900000,'1h':3600000,'4h':14400000,'1d':86400000 };
    const ms = tfMs[timeframe] || 300000;
    const now = Date.now();
    let price = base;
    const candles = [];
    for (let i = limit; i >= 0; i--) {
        const vol = base * 0.0012;
        const open = price, close = price + (Math.random()-0.495)*vol;
        const high = Math.max(open,close)+Math.random()*vol*0.5;
        const low  = Math.min(open,close)-Math.random()*vol*0.5;
        const dec  = base >= 1000 ? 0 : 2;
        candles.push({ time:(now-i*ms)/1000, open:+open.toFixed(dec), high:+high.toFixed(dec), low:+low.toFixed(dec), close:+close.toFixed(dec), volume:Math.round(Math.random()*1000+100) });
        price = close;
    }
    return candles;
}

async function getTwelveDataCandles(symbol, interval, limit) {
    const key = process.env.TWELVE_DATA_KEY;
    if (!key) throw new Error('TWELVE_DATA_KEY non défini');
    const fetch = await getFetch();
    const symMap = { 'XAU/USD':'XAU/USD','EUR/USD':'EUR/USD','GBP/USD':'GBP/USD','USD/JPY':'USD/JPY','AUD/USD':'AUD/USD' };
    const sym = symMap[symbol];
    if (!sym) throw new Error(`Twelve Data: symbole ${symbol} non supporté`);
    const ivMap = { '1min':'1min','5min':'5min','15min':'15min','1h':'1h','4h':'4h','1d':'1day' };
    const iv = ivMap[interval];
    if (!iv) throw new Error(`Twelve Data: interval ${interval} non supporté`);
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${iv}&outputsize=${limit}&apikey=${key}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Twelve Data ${r.status}`);
    const data = await r.json();
    if (data.status === 'error') throw new Error(`Twelve Data: ${data.message}`);
    if (!data.values?.length) throw new Error('Twelve Data: no values');
    return data.values.reverse().map(v => ({
        time:   new Date(v.datetime).getTime() / 1000,
        open:   +parseFloat(v.open).toFixed(5),
        high:   +parseFloat(v.high).toFixed(5),
        low:    +parseFloat(v.low).toFixed(5),
        close:  +parseFloat(v.close).toFixed(5),
        volume: parseFloat(v.volume || '0'),
    }));
}

async function getPrice(symbol = 'BTC/USD') {
    const cached = priceCache[symbol];
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    const map = SYMBOL_MAP[symbol] || {};
    let result = null;
    if (map.binance) {
        try { const b = await getBinancePrice(map.binance); result = { symbol, ...b, ts:Date.now() }; }
        catch (e) { logger.warn('Binance price fail', { symbol, err:e.message }); }
    }
    if (!result && map.yahoo) {
        try { const y = await getYahooPrice(map.yahoo); result = { symbol, ...y, ts:Date.now() }; }
        catch (e) { logger.warn('Yahoo price fail', { symbol, err:e.message }); }
    }
    if (!result && symbol.startsWith('EUR/')) {
        try { const f = await getFrankfurterPrice(symbol); result = { symbol, ...f, ts:Date.now() }; }
        catch (e) { logger.warn('Frankfurter fail', { symbol, err:e.message }); }
    }
    if (!result) { result = simulatePrice(symbol); logger.warn(`Simulation fallback for ${symbol}`); }
    priceCache[symbol] = { data:result, ts:Date.now() };
    return result;
}

async function getPriceHistory(symbol, timeframe = '1min', limit = 100) {
    const cacheKey = `${symbol}_${timeframe}`;
    const cached   = historyCache[cacheKey];
    const ttl      = getHistTTL(timeframe);
    if (cached && Date.now() - cached.ts < ttl) return cached.data;
    const map = SYMBOL_MAP[symbol] || {};
    const tfBinance = { '1min':'1m','5min':'5m','15min':'15m','1h':'1h','4h':'4h','1d':'1d' };
    const tfYahoo   = { '1min':'1m','5min':'5m','15min':'15m','1h':'60m','4h':'1h','1d':'1d' };
    let candles = null, source = 'synthetic';
    if (map.binance && tfBinance[timeframe]) {
        try { candles = await getBinanceCandles(map.binance, tfBinance[timeframe], limit+1); source = 'binance'; }
        catch (e) { logger.warn('Binance candles fail', { symbol, err:e.message }); }
    }
    if (!candles && map.yahoo && tfYahoo[timeframe]) {
        try { candles = await getYahooCandles(map.yahoo, tfYahoo[timeframe], limit); source = 'yahoo'; }
        catch (e) { logger.warn('Yahoo candles fail', { symbol, err:e.message }); }
    }
    if ((!candles || candles.length < 10) && ['XAU/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD'].includes(symbol)) {
        try { candles = await getTwelveDataCandles(symbol, timeframe, limit); source = 'twelvedata'; }
        catch (e) { logger.warn('Twelve Data candles fail', { symbol, err:e.message }); }
    }
    if (!candles || candles.length < 10) { candles = getSyntheticCandles(symbol, timeframe, limit); source = 'synthetic'; }
    const result = { candles, source, symbol };
    historyCache[cacheKey] = { data:result, ts:Date.now() };
    return result;
}

// ── NOUVEAU : getLiveCandle ────────────────────────────────────────
/**
 * Retourne la candle M1 EN COURS (non fermée) pour un symbole.
 * Utilisé par limitSignal.js pour la micro-confirmation en temps réel.
 * Ne pollue pas le cache de getPriceHistory (candles fermées).
 */
async function getLiveCandle(symbol, interval = '1min') {
    const cacheKey = `live_${symbol}_${interval}`;
    const cached   = liveCandle[cacheKey];
    if (cached && Date.now() - cached.ts < LIVE_CANDLE_TTL) return cached.data;

    const map = SYMBOL_MAP[symbol] || {};
    const tfBinance = { '1min':'1m', '5min':'5m', '15min':'15m' };
    let candle = null;

    if (map.binance && tfBinance[interval]) {
        try {
            candle = await getBinanceLiveCandle(map.binance, tfBinance[interval]);
        } catch (e) {
            logger.warn('getLiveCandle Binance fail', { symbol, err: e.message });
        }
    }

    // Fallback : construire une candle live approximative depuis le prix actuel
    if (!candle) {
        try {
            const priceData = await getPrice(symbol);
            const p = priceData.price;
            const dec = p >= 1000 ? 0 : p >= 1 ? 2 : 5;
            candle = {
                time:     Date.now() / 1000,
                open:     +p.toFixed(dec),
                high:     +(p * 1.0002).toFixed(dec),
                low:      +(p * 0.9998).toFixed(dec),
                close:    +p.toFixed(dec),
                volume:   0,
                isClosed: false,
                source:   'price_fallback',
            };
        } catch { /* ignore */ }
    }

    if (candle) {
        liveCandle[cacheKey] = { data: candle, ts: Date.now() };
    }
    return candle || null;
}

function getDemoPrice(symbol) {
    const base = BASE_PRICES[symbol] || 1.0;
    return { price:base, bid:base-0.0001, ask:base+0.0001 };
}

module.exports = { getPrice, getPriceHistory, getLiveCandle, getDemoPrice };
