'use strict';

const { Router } = require('express');
const { getDemoPrice } = require('../services/priceAggregator');

const router = Router();

// Generate realistic OHLCV candle history
function generateHistory(symbol, interval = '1min', count = 200) {
    const { price: basePrice } = getDemoPrice(symbol);
    const intervalMs = {
        '1min':  60000,
        '5min':  300000,
        '15min': 900000,
        '1h':    3600000,
        '4h':    14400000,
        '1d':    86400000,
    }[interval] || 60000;

    const now = Date.now();
    const candles = [];
    let close = basePrice;

    for (let i = count; i >= 0; i--) {
        const ts = now - i * intervalMs;
        const volatility = basePrice * 0.001;
        const open = close;
        const change = (Math.random() - 0.48) * volatility * 2;
        close = Math.max(open * 0.98, open + change);
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low  = Math.min(open, close) - Math.random() * volatility * 0.5;
        const volume = Math.floor(Math.random() * 5000) + 500;
        candles.push({ time: Math.floor(ts / 1000), open, high, low, close, volume });
    }
    return candles;
}

// GET /api/history?symbol=XAU/USD&interval=1min&outputsize=200
router.get('/', (req, res) => {
    const symbol     = req.query.symbol    || 'XAU/USD';
    const interval   = req.query.interval  || '1min';
    const outputsize = Math.min(parseInt(req.query.outputsize || '200', 10), 500);

    try {
        const candles = generateHistory(symbol, interval, outputsize);
        return res.json({ success: true, symbol, interval, candles });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
