'use strict';
/**
 * Database module — El Joven Scalp PRO
 * PostgreSQL via pg + migrations auto au démarrage
 * Fallback gracieux si PG non configuré (mode mémoire avec avertissement)
 */
const { Pool } = require('pg');
const logger = require('./logger');

let pool = null;
let memoryFallback = false;

const MIGRATIONS = [
    `CREATE TABLE IF NOT EXISTS journal_trades (
        id          SERIAL PRIMARY KEY,
        symbol      VARCHAR(20) NOT NULL,
        direction   VARCHAR(4)  NOT NULL CHECK (direction IN ('BUY','SELL')),
        entry_price NUMERIC(20,5) NOT NULL,
        exit_price  NUMERIC(20,5),
        lot_size    NUMERIC(10,4) DEFAULT 1,
        pnl         NUMERIC(20,5),
        status      VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open','closed')),
        setup       TEXT DEFAULT '',
        notes       TEXT DEFAULT '',
        opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at   TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS signal_history (
        id              SERIAL PRIMARY KEY,
        symbol          VARCHAR(20) NOT NULL,
        timeframe       VARCHAR(10),
        signal          VARCHAR(5)  NOT NULL CHECK (signal IN ('BUY','SELL','HOLD')),
        confidence      SMALLINT,
        composite_score SMALLINT,
        entry_price     NUMERIC(20,5),
        stop_loss       NUMERIC(20,5),
        take_profit     NUMERIC(20,5),
        rr              NUMERIC(6,3),
        ai_engine       VARCHAR(30),
        reasoning       TEXT,
        strategy_data   JSONB,
        indicators      JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS alerts (
        id          SERIAL PRIMARY KEY,
        symbol      VARCHAR(20),
        type        VARCHAR(30),
        message     TEXT NOT NULL,
        level       VARCHAR(10) DEFAULT 'info' CHECK (level IN ('info','warning','danger','success')),
        read        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_journal_symbol ON journal_trades(symbol)`,
    `ALTER TABLE journal_trades ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'default'`,
    `CREATE INDEX IF NOT EXISTS idx_journal_user ON journal_trades(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_trades(status)`,
    `CREATE INDEX IF NOT EXISTS idx_signal_symbol ON signal_history(symbol, created_at DESC)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_alerts_read ON alerts(read, created_at DESC)`,
];

const _mem = { journal: [], signals: [], alerts: [] };
let _memId = 1;

async function init() {
    const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connStr) {
        logger.warn('⚠️  DATABASE_URL non défini — mode mémoire actif (données non persistées)');
        memoryFallback = true;
        return;
    }
    try {
        pool = new Pool({
            connectionString: connStr,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        for (const sql of MIGRATIONS) {
            await pool.query(sql);
        }
        logger.info('✅ PostgreSQL connecté — migrations OK');
    } catch (err) {
        logger.warn(`⚠️  PostgreSQL échec (${err.message}) — mode mémoire actif`);
        pool = null;
        memoryFallback = true;
    }
}

async function query(sql, params = []) {
    if (!pool) throw new Error('PostgreSQL non disponible');
    const client = await pool.connect();
    try {
        return await client.query(sql, params);
    } finally {
        client.release();
    }
}

function isReady()    { return pool !== null; }
function isFallback() { return memoryFallback; }
function getMemory()  { return _mem; }
function nextMemId()  { return _memId++; }

module.exports = { init, query, isReady, isFallback, getMemory, nextMemId };