'use strict';
const jwt    = require('jsonwebtoken');
const logger = require('./logger');

const COOKIE_NAME    = 'eljoven_token';
const TOKEN_TTL      = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// JWT_SECRET obligatoire en production
if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        logger.error('❌ FATAL: JWT_SECRET non défini en production — arrêt du serveur');
        process.exit(1);
    }
    logger.warn('⚠️  JWT_SECRET non défini — clé aléatoire utilisée (tokens invalidés au restart)');
}

const _secret = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

function generateToken(username, plan = 'free') {
    return jwt.sign(
        { username, plan, iat: Math.floor(Date.now() / 1000) },
        _secret,
        { expiresIn: TOKEN_TTL }
    );
}

function verifyToken(token) {
    if (!token) return null;
    try {
        return jwt.verify(token, _secret);
    } catch {
        return null;
    }
}

function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME]
               || req.headers['authorization']?.split(' ')[1];
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    }
    req.user = payload;
    next();
}

module.exports = {
    COOKIE_NAME, COOKIE_MAX_AGE,
    generateToken, verifyToken, requireAuth,
};
