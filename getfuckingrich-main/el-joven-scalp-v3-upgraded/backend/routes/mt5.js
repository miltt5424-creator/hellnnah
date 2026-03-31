'use strict';
const { Router } = require('express');
const logger     = require('../utils/logger');
const { calcLots } = require('../services/mt5Bot');
const { validate, schemas } = require('../utils/validation');
const { autoSaveTrade } = require('./journal');
const db     = require('../utils/db');
const router = Router();

// ── ÉTAT EN MÉMOIRE (cache court terme) ───────────────────────────
let commandQueue = [];
let botStatus = {
    connected: false, accountId: null, brokerSymbol: null,
    equity: null, balance: null, openPositions: 0,
    lastAction: 'INIT', lastHeartbeat: null, terminal: null,
};
let mt5Config = {
    bridgeToken:      process.env.MT5_BRIDGE_TOKEN || process.env.MT5_BRIDGE_KEY || 'eljoven-secret',
    autoTradeEnabled: false,
    riskPercent:      1.0,
    maxLots:          0.5,
    magic:            202500,
    slippage:         50,
};

const SYMBOL_MAP = {
    'XAU/USD':'XAUUSD', 'BTC/USD':'BTCUSD', 'ETH/USD':'ETHUSD',
    'EUR/USD':'EURUSD', 'GBP/USD':'GBPUSD', 'USD/JPY':'USDJPY',
    'AUD/USD':'AUDUSD', 'NAS100/USD':'NAS100', 'SPX500/USD':'US500',
    'WTI/USD':'USOIL',  'XAG/USD':'XAGUSD', 'SOL/USD':'SOLUSD',
};

// ── MIGRATIONS ────────────────────────────────────────────────────
async function ensureTables() {
    if (!db.isReady()) return;
    await db.query(`CREATE TABLE IF NOT EXISTS mt5_commands (
        id          TEXT PRIMARY KEY,
        side        VARCHAR(10) NOT NULL,
        broker_symbol VARCHAR(20) NOT NULL,
        volume      NUMERIC(10,4) DEFAULT 0.01,
        stop_loss   NUMERIC(20,5) DEFAULT 0,
        take_profit NUMERIC(20,5) DEFAULT 0,
        comment     TEXT DEFAULT \'\',
        status      VARCHAR(20) DEFAULT \'pending\',
        queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        executed_at TIMESTAMPTZ
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS mt5_trades (
        id          SERIAL PRIMARY KEY,
        command_id  TEXT,
        status      VARCHAR(20),
        fill_price  NUMERIC(20,5),
        volume      NUMERIC(10,4),
        note        TEXT,
        account_id  TEXT,
        symbol      VARCHAR(20),
        side        VARCHAR(10),
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mt5_commands_status ON mt5_commands(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mt5_trades_executed ON mt5_trades(executed_at DESC)`);
}
ensureTables().catch(e => logger.warn('MT5 table init failed', { err: e.message }));

// ── HELPERS ───────────────────────────────────────────────────────
function checkToken(req, res, next) {
    const token = req.headers['x-mt5-token'] || req.body?.token || req.query?.token;
    if (token !== mt5Config.bridgeToken) {
        logger.warn('MT5: invalid bridge token', { ip: req.ip });
        return res.status(401).json({ error: 'Invalid bridge token' });
    }
    next();
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── ROUTES MT5 BOT ────────────────────────────────────────────────

// Bot récupère la prochaine commande
router.post('/executor/next', checkToken, async (req, res) => {
    // D'abord depuis la mémoire (plus rapide)
    const cmd = commandQueue.shift();
    if (cmd) {
        if (db.isReady()) {
            await db.query(
                "UPDATE mt5_commands SET status='dispatched', executed_at=NOW() WHERE id=$1",
                [cmd.id]
            ).catch(() => {});
        }
        logger.info('MT5: dispatching command', { id: cmd.id, side: cmd.side, symbol: cmd.brokerSymbol });
        return res.json({ ok: true, command: cmd });
    }
    // Fallback DB si mémoire vide (après restart)
    if (db.isReady()) {
        const result = await db.query(
            "SELECT * FROM mt5_commands WHERE status='pending' ORDER BY queued_at ASC LIMIT 1"
        ).catch(() => ({ rows: [] }));
        if (result.rows.length) {
            const row = result.rows[0];
            await db.query("UPDATE mt5_commands SET status='dispatched', executed_at=NOW() WHERE id=$1", [row.id]).catch(() => {});
            const dbCmd = { id: row.id, side: row.side, brokerSymbol: row.broker_symbol, volume: parseFloat(row.volume), stopLoss: parseFloat(row.stop_loss), takeProfit: parseFloat(row.take_profit), comment: row.comment, queuedAt: new Date(row.queued_at).getTime() };
            logger.info('MT5: dispatching command from DB', { id: dbCmd.id });
            return res.json({ ok: true, command: dbCmd });
        }
    }
    return res.json({ ok: true, command: null });
});

// Bot confirme l'exécution
router.post('/executor/ack', checkToken, async (req, res) => {
    const { commandId, status, fillPrice, volume, note } = req.body || {};
    if (!commandId) return res.status(400).json({ error: 'commandId requis' });

    const trade = {
        commandId, status, fillPrice, volume, note,
        timestamp: Date.now(),
        accountId: botStatus.accountId,
        symbol:    botStatus.brokerSymbol,
        side:      'BUY',
    };

    // Persiste en DB
    if (db.isReady()) {
        await db.query(
            `INSERT INTO mt5_trades (command_id, status, fill_price, volume, note, account_id, symbol, side)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [commandId, status, fillPrice || 0, volume || 0, note || '',
             botStatus.accountId || '', botStatus.brokerSymbol || 'UNKNOWN', 'BUY']
        ).catch(e => logger.warn('MT5 trade persist failed', { err: e.message }));
    }

    if (status === 'FILLED' && fillPrice > 0) {
        await autoSaveTrade({
            symbol:     botStatus.brokerSymbol || 'UNKNOWN',
            direction:  'BUY',
            entryPrice: parseFloat(fillPrice),
            lotSize:    parseFloat(volume) || 0.1,
            notes:      'Auto MT5 — ' + (note || ''),
            setup:      'ElJoven AutoBot',
        });
    }

    logger.info('MT5: ACK received', { commandId, status, fillPrice });
    return res.json({ ok: true });
});

// Heartbeat du bot
router.post('/bots/heartbeat', checkToken, (req, res) => {
    const { accountId, brokerSymbol, equity, balance, openPositions, lastAction, terminal } = req.body || {};
    botStatus = {
        connected:     true,
        accountId:     accountId    ?? botStatus.accountId,
        brokerSymbol:  brokerSymbol ?? botStatus.brokerSymbol,
        equity:        equity       ?? botStatus.equity,
        balance:       balance      ?? botStatus.balance,
        openPositions: openPositions ?? botStatus.openPositions,
        lastAction:    lastAction   || botStatus.lastAction,
        lastHeartbeat: Date.now(),
        terminal:      terminal     || botStatus.terminal,
    };
    return res.json({ ok: true, autoTradeEnabled: mt5Config.autoTradeEnabled });
});

// Statut du bot
router.get('/status', async (req, res) => {
    const alive = botStatus.lastHeartbeat && (Date.now() - botStatus.lastHeartbeat < 30000);
    let pendingCount = commandQueue.length;
    if (db.isReady()) {
        const r = await db.query("SELECT COUNT(*) FROM mt5_commands WHERE status='pending'").catch(() => null);
        if (r) pendingCount = parseInt(r.rows[0].count);
    }
    return res.json({
        success: true, connected: alive, ...botStatus,
        pendingCommands: pendingCount,
        autoTradeEnabled: mt5Config.autoTradeEnabled,
        config: { riskPercent: mt5Config.riskPercent, maxLots: mt5Config.maxLots, magic: mt5Config.magic },
    });
});

// Historique des trades exécutés
router.get('/history', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    if (db.isReady()) {
        const result = await db.query(
            'SELECT * FROM mt5_trades ORDER BY executed_at DESC LIMIT $1', [limit]
        ).catch(() => ({ rows: [] }));
        return res.json({ success: true, trades: result.rows, source: 'postgres' });
    }
    return res.json({ success: true, trades: [], source: 'memory', note: 'PostgreSQL requis pour l\'historique' });
});

// Envoyer une commande
router.post('/command', validate(schemas.mt5CommandSchema), async (req, res) => {
    const { side, symbol, entry, stopLoss, takeProfit, lots, confidence, comment } = req.body;
    const brokerSymbol = SYMBOL_MAP[symbol] || symbol.replace('/', '');
    const upperSide    = side.toUpperCase();

    const alreadyQueued = commandQueue.find(c => c.brokerSymbol === brokerSymbol && c.side !== 'CLOSE');
    if (alreadyQueued)
        return res.json({ success: false, error: "Ordre déjà en attente pour " + brokerSymbol });

    if (botStatus.openPositions > 0 && botStatus.brokerSymbol === brokerSymbol)
        return res.json({ success: false, error: "Position déjà ouverte sur " + brokerSymbol });

    const manualLots = parseFloat(lots);
    let volume = mt5Config.maxLots;
    if (manualLots > 0) {
        volume = Math.min(mt5Config.maxLots, manualLots);
    } else if (entry && stopLoss && botStatus.balance > 0) {
        const computed = calcLots(botStatus.balance, mt5Config.riskPercent, entry, stopLoss, symbol);
        volume = Math.min(mt5Config.maxLots, computed);
    }

    const cmd = {
        id: genId(), side: upperSide, brokerSymbol, volume,
        stopLoss: stopLoss || 0, takeProfit: takeProfit || 0,
        comment: comment || ("ElJoven_" + (confidence || 0) + "pct"),
        queuedAt: Date.now(),
    };

    // Persiste en DB ET en mémoire
    commandQueue.push(cmd);
    if (db.isReady()) {
        await db.query(
            `INSERT INTO mt5_commands (id, side, broker_symbol, volume, stop_loss, take_profit, comment, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
            [cmd.id, cmd.side, cmd.brokerSymbol, cmd.volume, cmd.stopLoss, cmd.takeProfit, cmd.comment]
        ).catch(e => logger.warn('MT5 command persist failed', { err: e.message }));
    }

    logger.info('MT5: command queued', { id: cmd.id, side: cmd.side, symbol: cmd.brokerSymbol });
    return res.json({ success: true, commandId: cmd.id, queuedAt: cmd.queuedAt });
});

// Fermer toutes les positions
router.post('/close-all', async (req, res) => {
    const brokerSymbol = req.body?.symbol
        ? (SYMBOL_MAP[req.body.symbol] || req.body.symbol.replace('/', ''))
        : botStatus.brokerSymbol || 'ALL';
    const cmd = {
        id: genId(), side: 'CLOSE', brokerSymbol,
        volume: 0, stopLoss: 0, takeProfit: 0,
        comment: 'ElJoven_CloseAll', queuedAt: Date.now(),
    };
    commandQueue.push(cmd);
    if (db.isReady()) {
        await db.query(
            `INSERT INTO mt5_commands (id, side, broker_symbol, volume, stop_loss, take_profit, comment, status)
             VALUES ($1,'CLOSE',$2,0,0,0,'ElJoven_CloseAll','pending')`,
            [cmd.id, cmd.brokerSymbol]
        ).catch(() => {});
    }
    return res.json({ success: true, commandId: cmd.id });
});

// Config du bot
router.post('/config', checkToken, (req, res) => {
    const { autoTradeEnabled, riskPercent, maxLots } = req.body || {};
    if (autoTradeEnabled !== undefined) mt5Config.autoTradeEnabled = !!autoTradeEnabled;
    if (riskPercent !== undefined) { const rp = parseFloat(riskPercent); if (rp > 0 && rp <= 20) mt5Config.riskPercent = rp; }
    if (maxLots !== undefined) { const ml = parseFloat(maxLots); if (ml > 0 && ml <= 100) mt5Config.maxLots = ml; }
    return res.json({ success: true, config: mt5Config });
});

module.exports = router;
