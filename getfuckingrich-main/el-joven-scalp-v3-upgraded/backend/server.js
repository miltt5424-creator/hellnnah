process.env.NODE_OPTIONS="--dns-result-order=ipv4first";
'use strict';
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const http         = require('http');
const WebSocket    = require('ws');
const cookieParser = require('cookie-parser');

const logger           = require('./utils/logger');
const { rateLimit }    = require('./utils/rateLimit');
const { requireAuth }  = require('./utils/auth');
const db               = require('./utils/db');
const { getPrice }     = require('./services/priceAggregator');
const { broadcast, register } = require('./ws/stream');
const autoSignal       = require('./ws/autoSignal');

const authRoute     = require('./routes/auth');
const priceRoute    = require('./routes/price');
const historyRoute  = require('./routes/history');
const signalRoute   = require('./routes/signal');
const riskRoute     = require('./routes/risk');
const journalRoute  = require('./routes/journal');
const backtestRoute = require('./routes/backtest');
const newsRoute     = require('./routes/news');
const calendarRoute = require('./routes/calendar');
const mt5Route      = require('./routes/mt5');
const chatRoute     = require('./routes/chat');
const adminRoute    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(require('express').static(require('path').join(__dirname, '../frontend/dist')));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/api/', rateLimit({ windowMs: 60000, max: 120 }));

app.get('/health', (_req, res) => res.json({
    status: 'ok', version: '3.1',
    db: db.isReady() ? 'postgres' : db.isFallback() ? 'memory' : 'initializing',
    ai: {
        gemini:     !!process.env.GEMINI_API_KEY,
        grok:       !!process.env.GROK_API_KEY,
        mistral:    !!process.env.MISTRAL_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
    },
    ts: Date.now(),
}));

// ── PUBLIC ─────────────────────────────────────────────
app.use('/api/auth',     authRoute);
app.use('/api/price',    priceRoute);
app.use('/api/news',     newsRoute);
app.use('/api/calendar', calendarRoute);

// ── PROTÉGÉES ──────────────────────────────────────────
app.use('/api/history',  requireAuth, historyRoute);
app.use('/api/signal',   requireAuth, signalRoute);
app.use('/api/risk',     requireAuth, riskRoute);
app.use('/api/journal',  requireAuth, journalRoute);
app.use('/api/backtest', requireAuth, backtestRoute);
app.use('/api/mt5',      requireAuth, mt5Route);
app.use('/api/chat',     requireAuth, chatRoute);
app.use('/api/admin',    adminRoute);

// ── TELEGRAM ───────────────────────────────────────────
const telegramSvc = require('./services/telegram');
app.get('/api/telegram/status', requireAuth, (_req, res) => {
    res.json({ success: true, enabled: telegramSvc.isEnabled() });
});
app.post('/api/telegram/test', requireAuth, async (_req, res) => {
    const result = await telegramSvc.testConnection();
    res.json({ success: result.ok, reason: result.reason });
});

// ── FEAR & GREED (cache 1h côté backend) ───────────────
let fgCache = null, fgCacheTs = 0;
app.get('/api/feargreed', async (_req, res) => {
    try {
        if (fgCache && Date.now() - fgCacheTs < 3600000) return res.json(fgCache);
        let fetch; try { fetch = (await import('node-fetch')).default; } catch { fetch = require('node-fetch'); }
        const r = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
        const data = await r.json();
        const v = parseInt(data?.data?.[0]?.value || '50');
        const label = v <= 20 ? 'Extreme Fear' : v <= 40 ? 'Fear' : v <= 60 ? 'Neutral' : v <= 80 ? 'Greed' : 'Extreme Greed';
        fgCache = { success: true, value: v, label, ts: Date.now() };
        fgCacheTs = Date.now();
        res.json(fgCache);
    } catch (e) {
        res.json({ success: false, value: 50, label: 'Neutral', error: e.message });
    }
});

app.get('/api/autosignal/status', (_req, res) =>
    res.json({ success: true, ...autoSignal.getStatus() }));
app.post('/api/autosignal/start', (req, res) => {
    const interval = req.body?.interval || 5;
    autoSignal.start(interval);
    res.json({ success: true, ...autoSignal.getStatus() });
});
app.post('/api/autosignal/stop', (_req, res) => {
    autoSignal.stop();
    res.json({ success: true, ...autoSignal.getStatus() });
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} introuvable` });
    res.sendFile(require('path').join(__dirname, '../frontend/dist/index.html'));
});
app.use((err, req, res, _next) => {
    logger.error('Unhandled error', { err: err.message, path: req.path });
    res.status(500).json({ success: false, error: 'Erreur serveur interne' });
});

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
    autoSignal.registerClient(ws);
    ws.on('close', () => autoSignal.unregisterClient(ws));
    register(ws);
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } catch {}
    });
    ws.on('error', (err) => logger.warn('WS client error', { err: err.message }));
});

const SYMBOLS = ['XAU/USD', 'BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAG/USD', 'NAS100/USD'];
let priceIdx = 0;
setInterval(async () => {
    const sym = SYMBOLS[priceIdx % SYMBOLS.length];
    priceIdx++;
    try {
        const price = await getPrice(sym);
        broadcast({ type: 'price', symbol: sym, ...price, ts: Date.now() });
    } catch (e) {
        logger.error('Price broadcast error', { sym, err: e.message });
    }
}, 2000);

async function boot() {
    await db.init();
    server.listen(PORT, () => {
        autoSignal.start();
        logger.info("🚀 El Joven Scalp v3.1 PRO — port " + PORT);
        logger.info("   DB:      " + (db.isReady() ? '✅ PostgreSQL' : '⚠️  Mémoire'));
        logger.info("   Gemini:  " + (process.env.GEMINI_API_KEY  ? '✅' : '❌'));
        logger.info("   Grok:    " + (process.env.GROK_API_KEY    ? '✅' : '❌'));
        logger.info("   Mistral: " + (process.env.MISTRAL_API_KEY ? '✅' : '❌'));
    });
}

// SPA fallback
const path = require('path');
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));

boot().catch(err => {
    logger.error('Boot failed', { err: err.message });
    process.exit(1);
});

module.exports = { app, server };