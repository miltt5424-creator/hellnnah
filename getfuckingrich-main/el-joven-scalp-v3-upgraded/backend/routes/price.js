'use strict';

const { Router } = require('express');
const { getPrice, getAllPrices } = require('../services/priceAggregator');

const router = Router();

const ALL_SYMBOLS = [
    'XAU/USD', 'XAG/USD', 'WTI/USD',
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'CHF/JPY', 'AUD/USD',
    'BTC/USD', 'ETH/USD', 'SOL/USD',
    'AAPL/USD', 'TSLA/USD', 'NVDA/USD',
    'SPX500/USD', 'NAS100/USD', 'US30/USD',
];

// GET /api/price?symbol=XAU/USD
router.get('/', async (req, res) => {
    const symbol = req.query.symbol || 'XAU/USD';
    if (!ALL_SYMBOLS.includes(symbol)) {
        return res.status(400).json({ success: false, error: `Unknown symbol: ${symbol}` });
    }
    try {
        const data = await getPrice(symbol);
        return res.json({ success: true, symbol, ...data });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/price/all — returns all symbols at once
router.get('/all', async (_req, res) => {
    try {
        const data = await getAllPrices(ALL_SYMBOLS);
        return res.json({ success: true, prices: data });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/price/symbols — list of available symbols
router.get('/symbols', (_req, res) => {
    return res.json({
        success: true,
        symbols: ALL_SYMBOLS,
        groups: {
            commodities: ['XAU/USD', 'XAG/USD', 'WTI/USD'],
            forex: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'CHF/JPY', 'AUD/USD'],
            crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD'],
            stocks: ['AAPL/USD', 'TSLA/USD', 'NVDA/USD'],
            indices: ['SPX500/USD', 'NAS100/USD', 'US30/USD'],
        },
    });
});

module.exports = router;
