'use strict';

/**
 * MT5 Execution Bot — El Joven Scalp v2
 * 
 * Pont entre les signaux El Joven et MetaTrader 5 via:
 *   1) Fichier CSV/JSON dans le dossier Files de MT5 (méthode locale)
 *   2) API REST exposée par un EA MT5 (expert advisor bridge)
 * 
 * Fonctionnalités :
 *   - Envoi de signaux BUY/SELL/CLOSE en temps réel
 *   - Calcul automatique des lots selon le risk %
 *   - SL / TP dynamiques basés sur ATR
 *   - Retry avec backoff exponentiel
 *   - Journalisation des ordres exécutés
 */

const logger = require('../utils/logger');
const fs     = require('fs');
const path   = require('path');

// ── Configuration ─────────────────────────────────────────────────
const MT5_BRIDGE_URL  = process.env.MT5_BRIDGE_URL  || '';          // ex: http://localhost:8085
const MT5_BRIDGE_KEY  = process.env.MT5_BRIDGE_KEY  || '';          // clé secrète EA
const MT5_FILES_PATH  = process.env.MT5_FILES_PATH  || '';          // C:/Users/.../AppData/Roaming/MetaQuotes/.../Files
const MT5_MAGIC       = parseInt(process.env.MT5_MAGIC || '202500'); // numéro magique EA
const MT5_SLIPPAGE    = parseInt(process.env.MT5_SLIPPAGE || '3');   // pips slippage max
const MT5_ENABLED     = !!(MT5_BRIDGE_URL || MT5_FILES_PATH);

// ── Symbol mapping MT5 ────────────────────────────────────────────
const SYMBOL_MAP = {
    'XAU/USD': 'XAUUSD',
    'BTC/USD': 'BTCUSD',
    'EUR/USD': 'EURUSD',
    'GBP/USD': 'GBPUSD',
    'USD/JPY': 'USDJPY',
    'CHF/JPY': 'CHFJPY',
    'AUD/USD': 'AUDUSD',
    'ETH/USD': 'ETHUSD',
    'SPX500/USD': 'US500',
    'NAS100/USD': 'NAS100',
    'WTI/USD':  'USOIL',
};

// ── Calcul des lots ───────────────────────────────────────────────
/**
 * Calcule la taille de lot selon la formule risk management:
 * lots = (capital × riskPct%) / (SL_pips × pip_value)
 */
function calcLots(accountBalance, riskPercent, entryPrice, stopLoss, symbol) {
    const riskAmount = accountBalance * (riskPercent / 100);
    const slDistance = Math.abs(entryPrice - stopLoss);
    if (slDistance <= 0) return 0.01;

    // Pip value approximatif selon le symbole
    let pipValue = 1; // USD par pip par lot standard
    const sym = SYMBOL_MAP[symbol] || symbol;
    if (sym.includes('XAU') || sym.includes('GOLD')) pipValue = 10;    // XAUUSD: $10/pip/lot
    else if (sym.includes('BTC'))                     pipValue = 5;     // BTC: variable
    else if (sym.endsWith('USD'))                     pipValue = 10;    // FX/USD pairs
    else if (sym.endsWith('JPY'))                     pipValue = 9.09;  // JPY pairs (approx)
    else                                              pipValue = 10;

    const pipSize = sym.includes('JPY') ? 0.01 : (sym.includes('XAU') ? 0.1 : 0.0001);
    const slPips  = slDistance / pipSize;

    const lots = riskAmount / (slPips * pipValue);
    // Normaliser entre 0.01 et 100 lots, arrondir à 0.01
    return Math.min(100, Math.max(0.01, Math.round(lots * 100) / 100));
}

// ── Retry avec backoff ────────────────────────────────────────────
async function withRetry(fn, retries = 3, delay = 500) {
    for (let i = 0; i < retries; i++) {
        try { return await fn(); }
        catch (err) {
            if (i === retries - 1) throw err;
            logger.warn(`MT5Bot retry ${i + 1}/${retries}`, { err: err.message });
            await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
    }
}

// ── Méthode 1 : Bridge REST (EA exposé sur localhost) ────────────
async function sendViaBridgeREST(order) {
    if (!MT5_BRIDGE_URL) throw new Error('MT5_BRIDGE_URL non configuré');

    let nodeFetch;
    try { nodeFetch = (await import('node-fetch')).default; } catch { throw new Error('node-fetch unavailable'); }

    const res = await nodeFetch(`${MT5_BRIDGE_URL}/order`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Bridge-Key': MT5_BRIDGE_KEY,
        },
        body: JSON.stringify(order),
        signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Bridge REST error ${res.status}: ${txt}`);
    }
    return await res.json();
}

// ── Méthode 2 : Fichier JSON dans dossier Files MT5 ──────────────
async function sendViaFile(order) {
    if (!MT5_FILES_PATH) throw new Error('MT5_FILES_PATH non configuré');

    const filename = `eljoven_signal_${Date.now()}.json`;
    const filepath = path.join(MT5_FILES_PATH, filename);
    fs.writeFileSync(filepath, JSON.stringify(order, null, 2), 'utf8');
    logger.info(`MT5Bot: signal écrit → ${filename}`);
    return { success: true, method: 'file', file: filename };
}

// ── Envoi principal ───────────────────────────────────────────────
/**
 * Envoie un ordre à MT5
 * @param {object} signal - Signal El Joven avec { signal, symbol, entry, stopLoss, takeProfit, confidence }
 * @param {object} opts   - { balance, riskPercent, comment }
 */
async function sendOrder(signal, opts = {}) {
    if (!MT5_ENABLED) {
        logger.warn('MT5Bot désactivé — configure MT5_BRIDGE_URL ou MT5_FILES_PATH dans .env');
        return { success: false, reason: 'disabled' };
    }

    const { balance = 10000, riskPercent = 1, comment = 'ElJovenScalp' } = opts;
    const mt5Symbol = SYMBOL_MAP[signal.symbol] || signal.symbol.replace('/', '');
    const lots      = calcLots(balance, riskPercent, signal.entry, signal.stopLoss, signal.symbol);

    const order = {
        action:    signal.signal === 'CLOSE' ? 'CLOSE' : 'OPEN',
        type:      signal.signal === 'BUY' ? 'BUY' : 'SELL',
        symbol:    mt5Symbol,
        lots:      lots,
        price:     signal.entry,
        sl:        signal.stopLoss,
        tp:        signal.takeProfit,
        slippage:  MT5_SLIPPAGE,
        magic:     MT5_MAGIC,
        comment:   `${comment}_${signal.confidence || 0}pct`,
        timestamp: Date.now(),
    };

    logger.info('MT5Bot: envoi ordre', { symbol: mt5Symbol, type: order.type, lots, entry: signal.entry });

    try {
        // Priorité : Bridge REST → Fichier
        const result = MT5_BRIDGE_URL
            ? await withRetry(() => sendViaBridgeREST(order))
            : await withRetry(() => sendViaFile(order));

        logger.info('MT5Bot: ordre accepté', result);
        return { success: true, order, result };
    } catch (err) {
        logger.error('MT5Bot: erreur envoi', { err: err.message, order });
        return { success: false, error: err.message, order };
    }
}

/**
 * Ferme toutes les positions ouvertes pour un symbole
 */
async function closeAll(symbol) {
    return sendOrder({ signal: 'CLOSE', symbol, entry: 0, stopLoss: 0, takeProfit: 0 }, {});
}

/**
 * Status de la connexion MT5
 */
async function getStatus() {
    if (!MT5_ENABLED) return { connected: false, reason: 'non configuré' };
    if (MT5_BRIDGE_URL) {
        try {
            let nodeFetch;
            try { nodeFetch = (await import('node-fetch')).default; } catch { return { connected: false, reason: 'node-fetch unavailable' }; }
            const res = await nodeFetch(`${MT5_BRIDGE_URL}/status`, {
                headers: { 'X-Bridge-Key': MT5_BRIDGE_KEY },
                signal: AbortSignal.timeout(3000),
            });
            if (!res.ok) return { connected: false, reason: `HTTP ${res.status}` };
            const data = await res.json();
            return { connected: true, method: 'REST', ...data };
        } catch (err) {
            return { connected: false, method: 'REST', reason: err.message };
        }
    }
    if (MT5_FILES_PATH) {
        const ok = fs.existsSync(MT5_FILES_PATH);
        return { connected: ok, method: 'file', path: MT5_FILES_PATH, reason: ok ? 'OK' : 'Chemin introuvable' };
    }
    return { connected: false };
}

module.exports = { sendOrder, closeAll, getStatus, calcLots, MT5_ENABLED };
