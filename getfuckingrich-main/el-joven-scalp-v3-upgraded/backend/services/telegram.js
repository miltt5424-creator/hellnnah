'use strict';
/**
 * Telegram Bot Service v2 — El Joven Scalp PRO
 * ==============================================
 * Nouveautés v2 :
 *  ① Signal Tracker — surveille TP/SL après chaque signal et notifie le résultat
 *  ② Messages premium avec animations et formatage avancé
 *  ③ Résumé PnL calculé automatiquement
 *  ④ Messages de résultat : TP HIT 🎯 ou SL HIT 💀
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

// ── Signal Tracker ────────────────────────────────────────────────
// Garde en mémoire les signaux actifs et surveille TP/SL
const activeSignals = new Map();  // id → { sig, checkInterval }
const TRACKER_INTERVAL_MS  = 15 * 1000;       // vérifie toutes les 15s
const TRACKER_MIN_DELAY_MS =  3 * 60 * 1000;  // délai minimum 3min avant premier check
const MAX_SIGNAL_AGE_MS    =  4 * 60 * 60 * 1000;  // expire après 4h

function startTracking(sig) {
    if (!sig?.id || !sig?.entry || !sig?.stopLoss || !sig?.takeProfit) return;
    if (activeSignals.has(sig.id)) return;

    const tracker = {
        sig,
        startTime:    Date.now(),
        entryTouched: false,   // ← NOUVEAU : le prix doit d'abord toucher la zone d'entrée
        interval: null,
    };

    // Délai 3min avant le premier check — évite les faux positifs sur prix déjà passés
    tracker.delayTimeout = setTimeout(() => {
        tracker.interval = setInterval(async () => {
            await checkSignalResult(sig.id);
        }, TRACKER_INTERVAL_MS);
    }, TRACKER_MIN_DELAY_MS);

    activeSignals.set(sig.id, tracker);
    logger.info(`📡 Tracking démarré pour ${sig.symbol} ${sig.signal} @ ${sig.entry} (1er check dans 3min)`);
}

async function checkSignalResult(sigId) {
    const tracker = activeSignals.get(sigId);
    if (!tracker) return;

    const { sig, startTime } = tracker;

    // Expire après 4h
    if (Date.now() - startTime > MAX_SIGNAL_AGE_MS) {
        stopTracking(sigId);
        await sendExpiredSignal(sig);
        return;
    }

    try {
        const { getPrice } = require('./priceAggregator');
        const priceData = await getPrice(sig.symbol);
        const currentPrice = priceData?.price;
        if (!currentPrice) return;

        const isBuy  = sig.signal === 'BUY' || sig.signal?.includes('BUY');
        const isHold = sig.orderType === 'LIMIT';

        // Calcul du prix moyen d'entrée (pour LIMIT, on attend que le prix touche la zone)
        const entryPrice = sig.entry;
        const sl = sig.stopLoss;
        const tp = sig.takeProfit;

        // ── NOUVEAU : vérifier que le prix a d'abord touché l'entrée ──
        // Pour un signal LIMIT/ANTICIP, on ne check TP/SL que si le prix
        // est déjà passé par la zone d'entrée
        if (!tracker.entryTouched) {
            const tolerance = Math.abs(tp - entryPrice) * 0.05; // 5% de la distance TP
            const nearEntry = Math.abs(currentPrice - entryPrice) <= tolerance;
            const crossedEntry = isBuy
                ? currentPrice <= entryPrice + tolerance
                : currentPrice >= entryPrice - tolerance;
            if (crossedEntry || nearEntry) {
                tracker.entryTouched = true;
                logger.info(`📡 Entrée touchée ${sig.symbol} @ ${currentPrice}`);
            } else {
                return; // Prix pas encore en zone → on n'évalue pas TP/SL
            }
        }

        let result = null;

        if (isBuy) {
            if (currentPrice >= tp) result = 'TP';
            else if (currentPrice <= sl) result = 'SL';
        } else {
            if (currentPrice <= tp) result = 'TP';
            else if (currentPrice >= sl) result = 'SL';
        }

        if (result) {
            stopTracking(sigId);
            const pips    = result === 'TP'
                ? Math.abs(tp - entryPrice)
                : Math.abs(sl - entryPrice);
            const pnlSign = result === 'TP' ? '+' : '-';
            const duration = Math.round((Date.now() - startTime) / 60000);
            await sendSignalResult(sig, result, currentPrice, pips, pnlSign, duration);
        }

    } catch (err) {
        logger.warn(`Tracker erreur ${sigId}`, { err: err.message });
    }
}

function stopTracking(sigId) {
    const tracker = activeSignals.get(sigId);
    if (tracker?.interval)      clearInterval(tracker.interval);
    if (tracker?.delayTimeout)  clearTimeout(tracker.delayTimeout);
    activeSignals.delete(sigId);
}

// ── Formatage messages ─────────────────────────────────────────────

async function getFreshPrice(symbol) {
    try {
        const { getPrice } = require('./priceAggregator');
        const p = await getPrice(symbol);
        return p?.price || null;
    } catch { return null; }
}

function confidenceBar(confidence) {
    const filled = Math.round((confidence || 0) / 10);
    const bars   = ['▱','▱','▱','▱','▱','▱','▱','▱','▱','▱'];
    for (let i = 0; i < filled; i++) bars[i] = '▰';
    return bars.join('');
}

function formatSignalMessage(sig, freshPrice) {
    const {
        signal, symbol, entry, stopLoss, takeProfit, rr, confidence,
        compositeScore, mtfConfluence, killZone, ote, smcBias, regime,
        adx, fibonacci, reasoning, aiEngine, source, orderType,
        phase, zoneKind, zoneStrength, distATR, tickMomentum,
        ollamaValidated, inZone,
    } = sig;

    const isBuy     = signal === 'BUY' || signal?.includes('BUY');
    const isLimit   = orderType === 'LIMIT';
    const isAnticip = phase === 'ANTICIPATION';
    const scoreStr  = (compositeScore !== undefined && compositeScore !== null) ? (compositeScore > 0 ? `+${compositeScore}` : `${compositeScore}`) : 'N/A';
    const confBar   = confidenceBar(confidence);
    const now       = new Date();
    const timeStr   = now.toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dec       = ['BTC/USD', 'XAU/USD'].includes(symbol) ? 2 : symbol.includes('JPY') ? 3 : 5;

    // ── Validité du signal (prix actuel vs entrée) ────────────────
    let validityBlock = '';
    if (freshPrice) {
        const diff     = freshPrice - entry;
        const diffAbs  = Math.abs(diff);
        const diffPct  = ((diffAbs / entry) * 100).toFixed(3);
        const dec2     = ['BTC/USD'].includes(symbol) ? 0 : 2;

        if (isAnticip || isLimit) {
            // LIMIT/ANTICIP : le prix doit aller VERS la zone
            const needsUp   = isBuy ? false : true;  // SELL LIMIT → prix doit monter vers entrée
            const isGoingRight = needsUp ? freshPrice < entry : freshPrice > entry;
            const distLabel = needsUp
                ? `prix doit monter +${diffAbs.toFixed(dec2)}$`
                : `prix doit descendre -${diffAbs.toFixed(dec2)}$`;

            if (isGoingRight) {
                validityBlock = `📍 *Prix actuel :* \`${freshPrice}\` — ${distLabel}\n✅ *Statut :* Signal VALIDE — prix se dirige vers la zone\n`;
            } else {
                validityBlock = `📍 *Prix actuel :* \`${freshPrice}\` — prix s'éloigne de la zone\n⚠️ *Statut :* Surveille — zone pas encore invalidée\n`;
            }
        } else {
            // MARKET : le prix doit être proche de l'entrée
            const atrEst = Math.abs(takeProfit - entry) / 2;
            const isFresh = diffAbs < atrEst * 0.5;
            if (isFresh) {
                validityBlock = `📍 *Prix actuel :* \`${freshPrice}\` ≈ entrée\n✅ *Statut :* Signal FRAIS — entre maintenant\n`;
            } else {
                const moved = isBuy
                    ? (freshPrice > entry ? `prix monté +${diffAbs.toFixed(dec2)}$` : `prix baissé -${diffAbs.toFixed(dec2)}$`)
                    : (freshPrice < entry ? `prix baissé -${diffAbs.toFixed(dec2)}$` : `prix monté +${diffAbs.toFixed(dec2)}$`);
                validityBlock = `📍 *Prix actuel :* \`${freshPrice}\` — ${moved}\n❌ *Statut :* Signal PÉRIMÉ — move déjà exécuté\n`;
            }
        }
    }

    // ── Header ────────────────────────────────────────────────────
    const dirEmoji = isBuy ? '🟢' : '🔴';
    const dirArrow = isBuy ? '📈' : '📉';
    let header = '';
    if (isAnticip) {
        header = `⚡️ *ANTICIPATION SIGNAL*\n${dirEmoji} *${signal} ${symbol}* — Zone dans \`${distATR?.toFixed(2) || '?'}\` ATR\n`;
    } else if (isLimit) {
        header = `🎯 *LIMIT ORDER SIGNAL*\n${dirEmoji} *${signal} ${symbol}* ${inZone ? '🔥 IN ZONE' : ''}\n`;
    } else {
        header = `${dirArrow} *MARKET SIGNAL* ${dirArrow}\n${dirEmoji} *${signal} ${symbol}* ${inZone ? '🔥 IN ZONE' : ''}\n`;
    }

    let msg = `╔══════════════════════╗\n  ${header}╚══════════════════════╝\n\n`;

    // ── Validité en premier ───────────────────────────────────────
    if (validityBlock) {
        msg += validityBlock;
        msg += `⏱ *Émis à :* \`${timeStr} UTC\`\n\n`;
    }

    // ── Prix ──────────────────────────────────────────────────────
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Entrée :*      \`${entry}\`\n`;
    msg += `🛑 *Stop Loss :*   \`${stopLoss}\`\n`;
    msg += `🏆 *Take Profit :* \`${takeProfit}\`\n`;
    msg += `📊 *R/R :* \`${typeof rr === 'number' ? rr.toFixed(2) : rr}x\`\n\n`;

    // ── Analyse ───────────────────────────────────────────────────
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📶 *Confiance :* ${confBar} *${confidence}%*\n`;
    msg += `🎯 *Score :* \`${scoreStr}/100\`\n`;
    if (mtfConfluence) {
        const mtfEmoji = mtfConfluence === 'HIGH' ? '🔥' : mtfConfluence === 'MEDIUM' ? '⚡' : '❄️';
        msg += `${mtfEmoji} *MTF :* ${mtfConfluence}\n`;
    }
    if (smcBias && smcBias !== 'neutral') msg += `📐 *SMC :* ${smcBias.toUpperCase()}\n`;
    if (killZone) msg += `🕐 *Kill Zone :* ${killZone}\n`;
    if (ote) msg += `🌀 *OTE :* ${ote}\n`;
    if (zoneKind) msg += `🗺 *Zone :* ${zoneKind} (str=${zoneStrength})\n`;
    if (tickMomentum) msg += `⚡ *Momentum :* ${tickMomentum}\n`;
    if (adx?.isStrong) msg += `📶 *ADX :* ${adx.adx?.toFixed(1)} — Tendance forte\n`;
    if (fibonacci?.inOTE) msg += `🌀 *Fibonacci :* OTE 61.8–78.6% ✅\n`;
    if (regime?.regime && regime.regime !== 'unknown') msg += `⚡ *Régime :* ${regime.regime.toUpperCase()}\n`;
    if (ollamaValidated) msg += `🤖 *Ollama :* Validé ✅\n`;

    if (reasoning) {
        const short = reasoning.length > 120 ? reasoning.slice(0, 120) + '…' : reasoning;
        msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n💡 _${short}_\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🤖 _El Joven Scalp PRO · ${aiEngine || 'v10'}_\n`;

    if (isAnticip) {
        msg += `\n⚠️ _Anticipatif — place l'ordre LIMIT @ \`${entry}\` et attends que le prix arrive_`;
    } else if (isLimit) {
        msg += `\n📌 _Place l'ordre LIMIT @ \`${entry}\` — TP auto @ \`${takeProfit}\`_`;
    } else {
        msg += `\n🚀 _MARKET — entre maintenant si signal FRAIS ✅_`;
    }

    return msg;
}

// ── Message résultat TP/SL ────────────────────────────────────────

async function sendSignalResult(sig, result, exitPrice, pips, pnlSign, durationMin) {
    const isBuy = sig.signal === 'BUY' || sig.signal?.includes('BUY');
    const dec   = ['BTC/USD', 'XAU/USD', 'ETH/USD'].includes(sig.symbol) ? 2 : 5;

    let msg = '';

    if (result === 'TP') {
        msg += `\n🎉🎯🏆 *TAKE PROFIT ATTEINT !* 🏆🎯🎉\n\n`;
        msg += `╔══════════════════════╗\n`;
        msg += `  ✅ *${sig.signal} ${sig.symbol}* — GAGNÉ\n`;
        msg += `╚══════════════════════╝\n\n`;
        msg += `📈 *Entrée :* \`${sig.entry}\`\n`;
        msg += `🏆 *TP touché :* \`${exitPrice.toFixed(dec)}\`\n`;
        msg += `${pnlSign === '+' ? '💰' : '💸'} *Gain :* \`${pnlSign}${pips.toFixed(dec)} pips\`\n`;
        msg += `📊 *R/R réalisé :* \`${sig.rr}x\`\n`;
        msg += `⏱ *Durée :* ${durationMin} minutes\n\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🔥 _El Joven ne rate pas ses cibles_ 🔥\n`;
        msg += `🤖 _El Joven Scalp PRO · v10_`;
    } else {
        msg += `\n💀 *STOP LOSS TOUCHÉ* 💀\n\n`;
        msg += `╔══════════════════════╗\n`;
        msg += `  ❌ *${sig.signal} ${sig.symbol}* — STOPPÉ\n`;
        msg += `╚══════════════════════╝\n\n`;
        msg += `📈 *Entrée :* \`${sig.entry}\`\n`;
        msg += `🛑 *SL touché :* \`${exitPrice.toFixed(dec)}\`\n`;
        msg += `💸 *Perte :* \`-${pips.toFixed(dec)} pips\`\n`;
        msg += `⏱ *Durée :* ${durationMin} minutes\n\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `💪 _Le marché teste ta patience. Next signal incoming..._ 🔄\n`;
        msg += `🤖 _El Joven Scalp PRO · v10_`;
    }

    const ok = await sendMessage(msg);
    if (ok) logger.info(`📢 Telegram → Résultat ${result} ${sig.symbol} envoyé`);
}

async function sendExpiredSignal(sig) {
    const msg = `⏰ *Signal expiré*\n\n${sig.signal} ${sig.symbol} @ \`${sig.entry}\`\n_Signal clôturé après 4h sans résultat_\n\n🤖 _El Joven Scalp PRO · v10_`;
    await sendMessage(msg);
    logger.info(`📢 Telegram → Signal expiré ${sig.symbol}`);
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

async function sendSignal(sig) {
    if (!ENABLED) return false;
    if (!sig || sig.signal === 'HOLD') return false;
    if ((sig.confidence || 0) < MIN_CONFIDENCE) return false;

    const rr = typeof sig.rr === 'number' ? sig.rr
             : (sig.stopLoss && sig.takeProfit && sig.entry
                ? Math.abs((sig.takeProfit - sig.entry) / (sig.entry - sig.stopLoss)) : 0);
    if (rr < MIN_RR) return false;

    // Prix frais au moment exact de l'envoi
    const freshPrice = await getFreshPrice(sig.symbol);
    const msg = formatSignalMessage(sig, freshPrice);
    const ok  = await sendMessage(msg);
    if (ok) {
        logger.info(`📢 Telegram → ${sig.signal} ${sig.symbol} | conf=${sig.confidence}% | prix=${freshPrice} envoyé`);
        startTracking(sig);
    }
    return ok;
}

async function sendAlert(text) {
    if (!ENABLED) return false;
    return sendMessage(`⚠️ *El Joven Alert*\n${text}`);
}

async function sendBotStatus(running, intervalMinutes) {
    if (!ENABLED) return false;
    const msg = running
        ? `🟢 *AutoSignal v10 DÉMARRÉ* 🚀\n\n⚡ Tick scan : 500ms\n📊 Market scan : ${intervalMinutes}min\n🎯 Limit scan : 5s\n🤖 Ollama : actif\n📡 Signal tracker : actif\n\n_Filtres : Conf≥${MIN_CONFIDENCE}% · RR≥${MIN_RR}_`
        : `🔴 *AutoSignal ARRÊTÉ* 😴`;
    return sendMessage(msg);
}

async function testConnection() {
    if (!BOT_TOKEN || !CHAT_ID) return { ok: false, reason: 'BOT_TOKEN ou CHAT_ID manquant dans .env' };
    const ok = await sendMessage('✅ *El Joven Scalp PRO v10* — Bot connecté ! 🚀\n\n_Signal tracker activé — Tu recevras les résultats TP/SL après chaque signal._');
    return { ok, reason: ok ? 'OK' : 'Échec envoi' };
}

module.exports = { sendSignal, sendAlert, sendBotStatus, testConnection, isEnabled: () => ENABLED };