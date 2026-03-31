'use strict';
/**
 * Telegram Bot Service — El Joven Scalp PRO
 * ==========================================
 * Envoie les signaux confirmés dans un canal Telegram.
 *
 * SETUP (5 minutes) :
 *   1. Ouvre Telegram → cherche @BotFather → /newbot → donne un nom
 *   2. Copie le BOT_TOKEN donné par BotFather
 *   3. Crée un canal Telegram (public ou privé)
 *   4. Ajoute ton bot comme ADMIN du canal (permissions : post messages)
 *   5. Pour un canal public @MonCanal → CHAT_ID = "@MonCanal"
 *      Pour un canal privé → CHAT_ID = "-100XXXXXXXXXX" (voir ci-dessous)
 *      → Pour trouver l'ID d'un canal privé : forward un message vers @userinfobot
 *   6. Dans le .env :
 *        TELEGRAM_BOT_TOKEN=7123456789:AAFxxxxxxxxxxxxxxxxxxxxx
 *        TELEGRAM_CHAT_ID=@MonCanalPublic   (ou -1001234567890 pour privé)
 *        TELEGRAM_MIN_CONFIDENCE=60         (optionnel, défaut 60)
 *        TELEGRAM_MIN_RR=1.5                (optionnel, défaut 1.5)
 */

const logger = require('../utils/logger');

const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN  || '';
const CHAT_ID        = process.env.TELEGRAM_CHAT_ID    || '';
const MIN_CONFIDENCE = parseInt(process.env.TELEGRAM_MIN_CONFIDENCE || '60');
const MIN_RR         = parseFloat(process.env.TELEGRAM_MIN_RR       || '1.5');
const ENABLED        = !!(BOT_TOKEN && CHAT_ID);

if (!ENABLED) {
    logger.info('📢 Telegram désactivé — définir TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID dans .env pour activer');
}

// ── Formatage du message ───────────────────────────────────────────
function formatSignalMessage(sig) {
    const { signal, symbol, entry, stopLoss, takeProfit, rr, confidence, compositeScore,
            mtfConfluence, killZone, ote, smcBias, regime, adx, fibonacci,
            reasoning, aiEngine, source } = sig;

    const emoji    = signal === 'BUY'  ? '🟢' : '🔴';
    const arrow    = signal === 'BUY'  ? '▲'  : '▼';
    const confBar  = '█'.repeat(Math.round((confidence || 0) / 10)) + '░'.repeat(10 - Math.round((confidence || 0) / 10));
    const scoreStr = compositeScore > 0 ? `+${compositeScore}` : `${compositeScore}`;
    const isAuto   = source === 'scheduler' ? ' 🤖' : ' 🧠';

    let msg = `${emoji} *${arrow} ${signal} ${symbol}*${isAuto}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Entrée :* \`${entry}\`\n`;
    msg += `🛑 *Stop Loss :* \`${stopLoss}\`\n`;
    msg += `🎯 *Take Profit :* \`${takeProfit}\`\n`;
    msg += `📊 *R/R :* \`${typeof rr === 'number' ? rr.toFixed(2) : rr}x\`\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📶 *Confiance :* ${confBar} ${confidence}%\n`;
    msg += `🎯 *Score :* \`${scoreStr}/100\`\n`;

    if (mtfConfluence) msg += `🔁 *MTF :* ${mtfConfluence}\n`;
    if (smcBias && smcBias !== 'neutral') msg += `📐 *SMC :* ${smcBias.toUpperCase()}\n`;
    if (killZone) msg += `🕐 *Kill Zone :* ${killZone}\n`;
    if (ote) msg += `🌀 *OTE :* ${ote}\n`;
    if (adx?.isStrong) msg += `📶 *ADX :* ${adx.adx} (tendance forte)\n`;
    if (fibonacci?.inOTE) msg += `🌀 *Fibonacci :* Zone OTE 61.8-78.6% ✅\n`;
    if (regime?.regime && regime.regime !== 'unknown') msg += `⚡ *Régime :* ${regime.regime.toUpperCase()}\n`;

    if (reasoning) {
        const short = reasoning.length > 120 ? reasoning.slice(0, 120) + '…' : reasoning;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `💡 _${short}_\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🤖 _El Joven Scalp PRO · ${aiEngine || 'technical'}_\n`;
    msg += `🕐 _${new Date().toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })} UTC_`;

    return msg;
}

function formatHoldMessage(sig) {
    const { symbol, reasoning } = sig;
    return `⚪ *HOLD ${symbol}*\n💬 _${reasoning || 'Pas de signal qualifié'}_`;
}

// ── Envoi vers Telegram ────────────────────────────────────────────
async function sendMessage(text, parseMode = 'Markdown') {
    if (!ENABLED) return false;
    try {
        let fetch;
        try { fetch = (await import('node-fetch')).default; } catch { fetch = require('node-fetch'); }

        const res = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id:    CHAT_ID,
                    text,
                    parse_mode: parseMode,
                    disable_web_page_preview: true,
                }),
                signal: AbortSignal.timeout(8000),
            }
        );
        const data = await res.json();
        if (!data.ok) {
            logger.warn('Telegram sendMessage error', { description: data.description });
            return false;
        }
        return true;
    } catch (err) {
        logger.warn('Telegram fetch error', { err: err.message });
        return false;
    }
}

// ── API publique ───────────────────────────────────────────────────

/**
 * Envoie un signal dans le canal si il passe les filtres de qualité.
 * Retourne true si envoyé, false si skippé ou erreur.
 */
async function sendSignal(sig) {
    if (!ENABLED) return false;

    // Filtre — ne publier que les signaux utiles
    if (!sig || sig.signal === 'HOLD') return false;
    if ((sig.confidence || 0) < MIN_CONFIDENCE) return false;
    const rr = typeof sig.rr === 'number' ? sig.rr
             : (sig.stopLoss && sig.takeProfit && sig.entry
                ? Math.abs((sig.takeProfit - sig.entry) / (sig.entry - sig.stopLoss)) : 0);
    if (rr < MIN_RR) return false;

    const msg = formatSignalMessage(sig);
    const ok  = await sendMessage(msg);
    if (ok) logger.info(`📢 Telegram → ${sig.signal} ${sig.symbol} | conf=${sig.confidence}% envoyé`);
    return ok;
}

/**
 * Message texte libre (alertes, statuts, etc.)
 */
async function sendAlert(text) {
    if (!ENABLED) return false;
    return sendMessage(`⚠️ *El Joven Alert*\n${text}`);
}

/**
 * Notifie le démarrage/arrêt de l'AutoSignal
 */
async function sendBotStatus(running, intervalMinutes) {
    if (!ENABLED) return false;
    const msg = running
        ? `🟢 *AutoSignal DÉMARRÉ*\nScan toutes les ${intervalMinutes} minute(s)\nFiltres: Conf≥${MIN_CONFIDENCE}% · RR≥${MIN_RR}`
        : `🔴 *AutoSignal ARRÊTÉ*`;
    return sendMessage(msg);
}

/**
 * Teste la connexion — renvoie true si le bot peut envoyer
 */
async function testConnection() {
    if (!BOT_TOKEN || !CHAT_ID) return { ok: false, reason: 'BOT_TOKEN ou CHAT_ID manquant dans .env' };
    const ok = await sendMessage('✅ *El Joven Scalp PRO* — Bot Telegram connecté avec succès !');
    return { ok, reason: ok ? 'OK' : 'Échec envoi — vérifier BOT_TOKEN et CHAT_ID' };
}

module.exports = { sendSignal, sendAlert, sendBotStatus, testConnection, isEnabled: () => ENABLED };