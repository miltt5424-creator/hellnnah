'use strict';
const { Router } = require('express');
const { verifyToken } = require('../utils/auth');
const { COOKIE_NAME } = require('../utils/auth');
const db = require('../utils/db');
const router = Router();

// Middleware admin
function requireAdmin(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Non authentifié' });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ success: false, error: 'Token invalide' });
    req.username = payload.username;
    next();
}

// Vérifie que l'user est bien admin en DB
async function checkAdmin(username) {
    const r = await db.query('SELECT plan FROM users WHERE username=$1', [username]);
    return r.rows.length && r.rows[0].plan === 'admin';
}

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        if (!await checkAdmin(req.username)) return res.status(403).json({ success: false, error: 'Accès refusé' });
        const total     = await db.query('SELECT COUNT(*) FROM users');
        const byPlan    = await db.query('SELECT plan, COUNT(*) as count FROM users GROUP BY plan');
        const today     = await db.query("SELECT COUNT(*) FROM users WHERE last_seen > NOW() - INTERVAL '1 day'");
        const week      = await db.query("SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'");
        const signals   = await db.query('SELECT COUNT(*) FROM signal_history');
        const trades    = await db.query('SELECT COUNT(*) FROM journal_trades');

        const planMap = {};
        byPlan.rows.forEach(r => { planMap[r.plan] = parseInt(r.count); });

        const mrr = (planMap['pro'] || 0) * 29 + (planMap['elite'] || 0) * 79;

        res.json({
            success: true,
            stats: {
                totalUsers:   parseInt(total.rows[0].count),
                activeToday:  parseInt(today.rows[0].count),
                newThisWeek:  parseInt(week.rows[0].count),
                byPlan:       planMap,
                estimatedMRR: mrr,
                totalSignals: parseInt(signals.rows[0].count),
                totalTrades:  parseInt(trades.rows[0].count),
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
    try {
        if (!await checkAdmin(req.username)) return res.status(403).json({ success: false, error: 'Accès refusé' });
        const limit = parseInt(req.query.limit) || 100;
        const r = await db.query(
            'SELECT id, username, email, plan, login_count, last_seen, created_at FROM users ORDER BY created_at DESC LIMIT $1',
            [limit]
        );
        res.json({ success: true, users: r.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PATCH /api/admin/users/:id/plan
router.patch('/users/:id/plan', requireAdmin, async (req, res) => {
    try {
        if (!await checkAdmin(req.username)) return res.status(403).json({ success: false, error: 'Accès refusé' });
        const { plan } = req.body;
        if (!['free','pro','elite','admin'].includes(plan))
            return res.status(400).json({ success: false, error: 'Plan invalide' });
        await db.query('UPDATE users SET plan=$1 WHERE id=$2', [plan, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        if (!await checkAdmin(req.username)) return res.status(403).json({ success: false, error: 'Accès refusé' });
        await db.query('DELETE FROM users WHERE id=$1 AND plan != $2', [req.params.id, 'admin']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
