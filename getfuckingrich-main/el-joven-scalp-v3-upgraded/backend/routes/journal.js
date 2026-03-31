'use strict';
/**
 * Journal Route v2 — El Joven Scalp PRO
 * ========================================
 * Chaque utilisateur ne voit QUE ses propres trades.
 * user_id = req.user.username (JWT) ou 'anon' si pas de session.
 */
const { Router } = require('express');
const db     = require('../utils/db');
const logger = require('../utils/logger');
const router = Router();

// ── Helpers ────────────────────────────────────────────────────────

function getUserId(req) {
    return req.user?.username || 'anon';
}

function calcPnL(direction, entry, exit, lots = 1) {
    if (!exit) return null;
    const raw = direction === 'BUY' ? exit - entry : entry - exit;
    return parseFloat((raw * lots * 100).toFixed(2));
}

function computeStats(trades) {
    const closed = trades.filter(t => t.status === 'closed' && t.pnl !== null);
    if (closed.length === 0) return {
        total: 0, wins: 0, losses: 0, winRate: 0,
        totalPnl: 0, avgWin: 0, avgLoss: 0, profitFactor: null,
        sharpeRatio: null, maxDrawdown: 0,
        bestTrade: null, worstTrade: null,
        currentStreak: 0, streakType: null,
        bySetup: {}, openTrades: trades.filter(t => t.status === 'open').length,
    };

    const wins   = closed.filter(t => t.pnl > 0);
    const losses = closed.filter(t => t.pnl <= 0);
    const totalPnl = closed.reduce((a, t) => a + t.pnl, 0);
    const grossW   = wins.reduce((a, t) => a + t.pnl, 0);
    const grossL   = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

    let equity = 0, peak = 0, maxDD = 0;
    for (const t of closed) {
        equity += t.pnl;
        if (equity > peak) peak = equity;
        const dd = peak - equity;
        if (dd > maxDD) maxDD = dd;
    }

    const pnls = closed.map(t => t.pnl);
    const mean = totalPnl / closed.length;
    const variance = pnls.reduce((a, v) => a + (v - mean) ** 2, 0) / closed.length;
    const std    = Math.sqrt(variance);
    const sharpe = std > 0 ? parseFloat((mean / std * Math.sqrt(252)).toFixed(2)) : null;

    let streak = 0, streakType = null;
    for (let i = closed.length - 1; i >= 0; i--) {
        const type = closed[i].pnl > 0 ? 'win' : 'loss';
        if (streakType === null)       { streakType = type; streak = 1; }
        else if (type === streakType)  streak++;
        else break;
    }

    const bySetup = {};
    for (const t of closed) {
        const s = t.setup || 'Unknown';
        if (!bySetup[s]) bySetup[s] = { trades: 0, wins: 0, totalPnl: 0 };
        bySetup[s].trades++;
        if (t.pnl > 0) bySetup[s].wins++;
        bySetup[s].totalPnl = parseFloat((bySetup[s].totalPnl + t.pnl).toFixed(2));
    }
    Object.keys(bySetup).forEach(k => {
        bySetup[k].winRate = parseFloat((bySetup[k].wins / bySetup[k].trades * 100).toFixed(1));
    });

    // Calendrier PnL journalier
    const byDay = {};
    for (const t of closed) {
        const day = (t.closedAt || t.openedAt || '').slice(0, 10);
        if (!day) continue;
        if (!byDay[day]) byDay[day] = { pnl: 0, trades: 0, wins: 0 };
        byDay[day].pnl    += t.pnl;
        byDay[day].trades += 1;
        if (t.pnl > 0) byDay[day].wins++;
    }
    const calendar = Object.entries(byDay).map(([date, d]) => ({ date, ...d, pnl: parseFloat(d.pnl.toFixed(2)) })).sort((a, b) => a.date.localeCompare(b.date));

    const sorted = [...closed].sort((a, b) => b.pnl - a.pnl);

    return {
        total: closed.length, wins: wins.length, losses: losses.length,
        winRate:      parseFloat((wins.length / closed.length * 100).toFixed(1)),
        totalPnl:     parseFloat(totalPnl.toFixed(2)),
        avgWin:       wins.length   ? parseFloat((grossW / wins.length).toFixed(2))   : 0,
        avgLoss:      losses.length ? parseFloat((grossL / losses.length).toFixed(2)) : 0,
        profitFactor: grossL > 0    ? parseFloat((grossW / grossL).toFixed(2))        : null,
        sharpeRatio:  sharpe,
        maxDrawdown:  parseFloat(maxDD.toFixed(2)),
        bestTrade:    sorted[0]               ? { pnl: sorted[0].pnl,               symbol: sorted[0].symbol } : null,
        worstTrade:   sorted[sorted.length-1] ? { pnl: sorted[sorted.length-1].pnl, symbol: sorted[sorted.length-1].symbol } : null,
        currentStreak: streak, streakType, bySetup,
        openTrades:  trades.filter(t => t.status === 'open').length,
        calendar,
    };
}

function mapRow(row) {
    return {
        id:         row.id,
        symbol:     row.symbol,
        direction:  row.direction,
        entryPrice: parseFloat(row.entry_price),
        exitPrice:  row.exit_price  ? parseFloat(row.exit_price)  : null,
        lotSize:    parseFloat(row.lot_size),
        pnl:        row.pnl        ? parseFloat(row.pnl)         : null,
        status:     row.status,
        setup:      row.setup  || '',
        notes:      row.notes  || '',
        openedAt:   row.opened_at,
        closedAt:   row.closed_at,
        userId:     row.user_id || 'default',
    };
}

// ── GET /api/journal ──────────────────────────────────────────────
router.get('/', async (req, res) => {
    const userId = getUserId(req);
    const limit  = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const { symbol, status } = req.query;
    try {
        if (db.isReady()) {
            const params = [userId];
            const where  = [`user_id = $1`];
            if (symbol) { params.push(symbol); where.push(`symbol = $${params.length}`); }
            if (status) { params.push(status);  where.push(`status = $${params.length}`); }
            params.push(limit);
            const sql = `SELECT * FROM journal_trades WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`;
            const result = await db.query(sql, params);
            return res.json({ success: true, trades: result.rows.map(mapRow), dbMode: 'postgres', userId });
        } else {
            let trades = [...(db.getMemory().journal || [])].filter(t => (t.userId || 'default') === userId);
            if (symbol) trades = trades.filter(t => t.symbol === symbol);
            if (status) trades = trades.filter(t => t.status === status);
            return res.json({ success: true, trades: trades.slice(-limit).reverse(), dbMode: 'memory', userId });
        }
    } catch (err) {
        logger.error('Journal GET error', { err: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/journal ─────────────────────────────────────────────
router.post('/', async (req, res) => {
    const userId = getUserId(req);
    const { symbol, direction, entryPrice, exitPrice, lotSize, openedAt, closedAt, notes, setup } = req.body || {};
    if (!symbol || !direction || !entryPrice)
        return res.status(400).json({ success: false, error: 'symbol, direction, entryPrice requis' });
    const dir = direction.toUpperCase();
    if (!['BUY', 'SELL'].includes(dir))
        return res.status(400).json({ success: false, error: 'direction doit être BUY ou SELL' });
    const pnl = calcPnL(dir, parseFloat(entryPrice), exitPrice ? parseFloat(exitPrice) : null, parseFloat(lotSize || 1));
    try {
        if (db.isReady()) {
            const result = await db.query(
                `INSERT INTO journal_trades (user_id,symbol,direction,entry_price,exit_price,lot_size,pnl,status,setup,notes,opened_at,closed_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
                [userId, symbol, dir, parseFloat(entryPrice),
                 exitPrice ? parseFloat(exitPrice) : null,
                 parseFloat(lotSize || 1), pnl,
                 exitPrice ? 'closed' : 'open',
                 setup || '', notes || '',
                 openedAt ? new Date(openedAt) : new Date(),
                 closedAt ? new Date(closedAt) : null]
            );
            return res.status(201).json({ success: true, trade: mapRow(result.rows[0]) });
        } else {
            const trade = {
                id: db.nextMemId(), userId, symbol, direction: dir,
                entryPrice: parseFloat(entryPrice), exitPrice: exitPrice ? parseFloat(exitPrice) : null,
                lotSize: parseFloat(lotSize || 1), pnl, status: exitPrice ? 'closed' : 'open',
                setup: setup || '', notes: notes || '',
                openedAt: openedAt || new Date().toISOString(), closedAt: closedAt || null,
            };
            db.getMemory().journal.push(trade);
            return res.status(201).json({ success: true, trade });
        }
    } catch (err) {
        logger.error('Journal POST error', { err: err.message });
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── PATCH /api/journal/:id ────────────────────────────────────────
router.patch('/:id', async (req, res) => {
    const userId = getUserId(req);
    const id     = parseInt(req.params.id, 10);
    const { exitPrice, notes, setup, closedAt, lotSize } = req.body || {};
    try {
        if (db.isReady()) {
            const existing = await db.query('SELECT * FROM journal_trades WHERE id = $1 AND user_id = $2', [id, userId]);
            if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Trade introuvable ou accès refusé' });
            const row    = existing.rows[0];
            const newExit = exitPrice !== undefined ? parseFloat(exitPrice) : (row.exit_price ? parseFloat(row.exit_price) : null);
            const newLots = lotSize   !== undefined ? parseFloat(lotSize)   : parseFloat(row.lot_size);
            const newPnl  = calcPnL(row.direction, parseFloat(row.entry_price), newExit, newLots);
            const result  = await db.query(
                `UPDATE journal_trades SET exit_price=$1,lot_size=$2,pnl=$3,status=$4,
                 notes=COALESCE($5,notes),setup=COALESCE($6,setup),
                 closed_at=COALESCE($7,closed_at) WHERE id=$8 AND user_id=$9 RETURNING *`,
                [newExit, newLots, newPnl, newExit ? 'closed' : 'open',
                 notes  !== undefined ? notes  : null,
                 setup  !== undefined ? setup  : null,
                 closedAt ? new Date(closedAt) : (newExit ? new Date() : null), id, userId]
            );
            return res.json({ success: true, trade: mapRow(result.rows[0]) });
        } else {
            const trade = db.getMemory().journal.find(t => t.id === id && (t.userId || 'default') === userId);
            if (!trade) return res.status(404).json({ success: false, error: 'Trade introuvable ou accès refusé' });
            if (exitPrice !== undefined) {
                trade.exitPrice = parseFloat(exitPrice);
                trade.status    = 'closed';
                trade.closedAt  = closedAt || new Date().toISOString();
                trade.pnl       = calcPnL(trade.direction, trade.entryPrice, trade.exitPrice, parseFloat(lotSize || trade.lotSize));
            }
            if (notes !== undefined) trade.notes = notes;
            if (setup !== undefined) trade.setup = setup;
            return res.json({ success: true, trade });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /api/journal/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const userId = getUserId(req);
    const id     = parseInt(req.params.id, 10);
    try {
        if (db.isReady()) {
            const result = await db.query('DELETE FROM journal_trades WHERE id=$1 AND user_id=$2 RETURNING id', [id, userId]);
            if (!result.rows.length) return res.status(404).json({ success: false, error: 'Trade introuvable ou accès refusé' });
            return res.json({ success: true });
        } else {
            const idx = db.getMemory().journal.findIndex(t => t.id === id && (t.userId || 'default') === userId);
            if (idx === -1) return res.status(404).json({ success: false, error: 'Trade introuvable ou accès refusé' });
            db.getMemory().journal.splice(idx, 1);
            return res.json({ success: true });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/journal/stats ────────────────────────────────────────
router.get('/stats', async (req, res) => {
    const userId = getUserId(req);
    try {
        let trades;
        if (db.isReady()) {
            const result = await db.query('SELECT * FROM journal_trades WHERE user_id=$1 ORDER BY created_at ASC', [userId]);
            trades = result.rows.map(mapRow);
        } else {
            trades = (db.getMemory().journal || []).filter(t => (t.userId || 'default') === userId);
        }
        return res.json({ success: true, stats: computeStats(trades), dbMode: db.isReady() ? 'postgres' : 'memory', userId });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── autoSaveTrade (appelé par AutoBot) ────────────────────────────
async function autoSaveTrade(tradeData) {
    const { symbol, direction, entryPrice, lotSize, notes, setup, userId = 'bot' } = tradeData;
    if (!symbol || !direction || !entryPrice) return;
    try {
        if (db.isReady()) {
            await db.query(
                `INSERT INTO journal_trades (user_id,symbol,direction,entry_price,lot_size,status,notes,setup)
                 VALUES ($1,$2,$3,$4,$5,'open',$6,$7)`,
                [userId, symbol, direction, parseFloat(entryPrice), parseFloat(lotSize || 0.1), notes || '', setup || 'ElJoven AutoBot']
            );
        } else {
            db.getMemory().journal.push({
                id: db.nextMemId(), userId, symbol, direction,
                entryPrice: parseFloat(entryPrice), exitPrice: null,
                lotSize: parseFloat(lotSize || 0.1), pnl: null, status: 'open',
                setup: setup || 'ElJoven AutoBot', notes: notes || '',
                openedAt: new Date().toISOString(), closedAt: null,
            });
        }
    } catch (e) {
        logger.warn('autoSaveTrade failed', { err: e.message });
    }
}

module.exports = router;
module.exports.autoSaveTrade = autoSaveTrade;