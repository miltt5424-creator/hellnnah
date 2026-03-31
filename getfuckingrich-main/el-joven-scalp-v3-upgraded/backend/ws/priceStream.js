'use strict';

const { getPrice } = require('../services/priceAggregator');
const logger = require('../utils/logger');

const INTERVAL_MS = parseInt(process.env.PRICE_STREAM_INTERVAL_MS || '400', 10);
const ORDERBOOK_INTERVAL_MS = parseInt(process.env.ORDERBOOK_STREAM_INTERVAL_MS || '2000', 10);

function generateOrderbook(price) {
    const levels = 8;
    const bids = [], asks = [];
    for (let i = 0; i < levels; i++) {
        const bidPrice = price * (1 - 0.0002 * (i + 1));
        const askPrice = price * (1 + 0.0002 * (i + 1));
        bids.push({ price: bidPrice, size: Math.floor(Math.random() * 50) + 1 });
        asks.push({ price: askPrice, size: Math.floor(Math.random() * 50) + 1 });
    }
    return { bids, asks };
}

/**
 * Attach price streaming to a WebSocket client
 * Called when a new WS client connects
 */
function attachPriceStream(ws, getState) {
    let priceTimer = null;
    let obTimer = null;

    function getSymbol() {
        return getState?.().symbol || 'XAU/USD';
    }

    async function sendPrice() {
        if (ws.readyState !== ws.OPEN) return;
        try {
            const symbol = getSymbol();
            const data   = await getPrice(symbol);
            ws.send(JSON.stringify({ type: 'price', symbol, ...data, ts: Date.now() }));
        } catch (err) {
            logger.warn('Price stream error', { err: err.message });
        }
    }

    function sendOrderbook() {
        if (ws.readyState !== ws.OPEN) return;
        try {
            const symbol = getSymbol();
            // Use last cached price for orderbook gen
            const basePrice = 2340 + Math.random() * 100; // simplified
            const ob = generateOrderbook(basePrice);
            ws.send(JSON.stringify({ type: 'orderbook', symbol, ...ob, ts: Date.now() }));
        } catch { /* ignore */ }
    }

    priceTimer = setInterval(sendPrice, INTERVAL_MS);
    obTimer    = setInterval(sendOrderbook, ORDERBOOK_INTERVAL_MS);

    // Send immediately
    sendPrice();

    return function cleanup() {
        clearInterval(priceTimer);
        clearInterval(obTimer);
    };
}

module.exports = { attachPriceStream };
