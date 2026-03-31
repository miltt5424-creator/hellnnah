'use strict';
const { Router } = require('express');
const { COOKIE_NAME, COOKIE_MAX_AGE, generateToken, verifyToken } = require('../utils/auth');
const db     = require('../utils/db');
const bcrypt = require('bcrypt');
const router = Router();

const SALT_ROUNDS = 12;

async function ensureUsersTable() {
    if (!db.isReady()) return;
    await db.query(`CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(100) UNIQUE NOT NULL,
        email      VARCHAR(200) UNIQUE,
        password   VARCHAR(200),
        plan       VARCHAR(20) DEFAULT 'free',
        login_count INT DEFAULT 0,
        last_seen   TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
}
ensureUsersTable().catch(() => {});

router.post('/register', async (req, res) => {
    const { username, password, name } = req.body || {};
    if (!username || !password)
        return res.status(400).json({ success: false, error: 'Username et password requis' });
    if (password.length < 8)
        return res.status(400).json({ success: false, error: 'Mot de passe min 8 caractères' });

    const displayName = name || username.split('@')[0];
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    try {
        if (db.isReady()) {
            const existing = await db.query(
                'SELECT id FROM users WHERE username=$1 OR email=$1', [username]
            );
            if (existing.rows.length > 0)
                return res.status(409).json({ success: false, error: 'Compte déjà existant' });
            await db.query(
                'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
                [displayName, username, hashed]
            );
        } else {
            const mem = db.getMemory();
            if (!mem.users) mem.users = [];
            if (mem.users.find(u => u.username === displayName || u.email === username))
                return res.status(409).json({ success: false, error: 'Compte déjà existant' });
            mem.users.push({
                id: db.nextMemId(), username: displayName,
                email: username, password: hashed, plan: 'free',
            });
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }

    const token = generateToken(displayName, 'free');
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
    });
    return res.json({ success: true, token, username: displayName, plan: 'free' });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password)
        return res.status(400).json({ success: false, error: 'Username et password requis' });

    let displayName = null;
    let storedHash  = null;

    try {
        if (db.isReady()) {
            const result = await db.query(
                'SELECT username, password FROM users WHERE username=$1 OR email=$1', [username]
            );
            if (!result.rows.length) {
                await new Promise(r => setTimeout(r, 400));
                return res.status(401).json({ success: false, error: 'Identifiants invalides' });
            }
            displayName = result.rows[0].username;
            storedHash  = result.rows[0].password;
        } else {
            const mem  = db.getMemory();
            if (!mem.users) mem.users = [];
            const user = mem.users.find(u => u.username === username || u.email === username);
            if (!user) {
                await new Promise(r => setTimeout(r, 400));
                return res.status(401).json({ success: false, error: 'Identifiants invalides' });
            }
            displayName = user.username;
            storedHash  = user.password;
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }

    const valid = await bcrypt.compare(password, storedHash);
    if (!valid) {
        await new Promise(r => setTimeout(r, 400));
        return res.status(401).json({ success: false, error: 'Identifiants invalides' });
    }

    // Récupère le vrai plan depuis la DB
    let userPlan = 'free';
    try {
        if (db.isReady()) {
            const planResult = await db.query('SELECT plan FROM users WHERE username=$1', [displayName]);
            if (planResult.rows.length) userPlan = planResult.rows[0].plan || 'free';
        }
    } catch {}

    const token = generateToken(displayName, userPlan);
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
    });
    return res.json({ success: true, token, username: displayName, plan: userPlan });
});

router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME);
    return res.json({ success: true });
});

router.get('/check', async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME]
               || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.json({ success: true, authenticated: false, user: null });
    const payload = verifyToken(token);
    if (!payload) return res.json({ success: true, authenticated: false, user: null });
    try {
        if (db.isReady()) {
            const result = await db.query(
                'SELECT username, email, plan, created_at FROM users WHERE username=$1', [payload.username]
            );
            if (result.rows.length) {
                const { username, email, plan } = result.rows[0];
                return res.json({ success: true, authenticated: true, user: result.rows[0].username, email: result.rows[0].email, plan: result.rows[0].plan, created_at: result.rows[0].created_at });
            }
        }
    } catch {}
    return res.json({ success: true, authenticated: true, user: payload.username, email: null, plan: 'free', created_at: null });
});

module.exports = router;
