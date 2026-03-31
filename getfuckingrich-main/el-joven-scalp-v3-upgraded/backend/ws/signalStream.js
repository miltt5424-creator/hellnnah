'use strict';
/**
 * Signal Stream v2 — El Joven Scalp PRO
 * ========================================
 * Changements v1 → v2 :
 *  ① Canal 'zone_alert' : alerte quand le prix s'approche d'une zone
 *     → pré-alerte avant le signal limit (permet au trader de se préparer)
 *  ② Canal 'market_signal' : conservé, maintenant basé sur strategyEngine réel
 *  ③ Canal 'limit_signal' : reçu depuis limitSignal.js via autoSignal
 *  ④ Suppression du generateAutoSignal() aléatoire (était un placeholder inutile)
 *  ⑤ broadcast() utilise maintenant l'état des zones pour les alertes
 */

const logger = require('../utils/logger');
const { getPrice } = require('../services/priceAggregator');
const { getCachedZones } = require('../services/zoneEngine');

const clients = new Set();
let broadcastTimer = null;

// ── Broadcast zone alerts périodiques ────────────────────────────
// Toutes les 30s : vérifie les zones proches et envoie les alertes

async function broadcastZoneAlerts() {
    if (clients.size === 0) return;
    try {
        const symbols = ['XAU/USD', 'BTC/USD', 'EUR/USD', 'GBP/USD', 'ETH/USD'];

        await Promise.allSettled(symbols.map(async (symbol) => {
            try {
                const { getPriceHistory } = require('../services/priceAggregator');
                const priceData = await getPrice(symbol);
                const livePrice = priceData?.price;
                if (!livePrice) return;

                const h1Hist = await getPriceHistory(symbol, '1h', 60);
                if (!h1Hist?.candles?.length) return;

                const zoneData = getCachedZones(h1Hist.candles, null, livePrice, symbol);
                if (!zoneData?.approaching?.length) return;

                // Envoyer les zones qui s'approchent (distATR < 3)
                const nearby = zoneData.approaching.filter(z => z.distATR < 3).slice(0, 3);
                for (const zone of nearby) {
                    const dec = livePrice >= 1000 ? 0 : livePrice >= 1 ? 2 : 5;
                    const payload = JSON.stringify({
                        type:         'zone_alert',
                        symbol,
                        direction:    zone.type === 'bullish' ? 'BUY' : 'SELL',
                        zoneKind:     zone.kind,
                        zoneEntry:    +zone.entry.toFixed(dec),
                        zoneTop:      +zone.top.toFixed(dec),
                        zoneBottom:   +zone.bottom.toFixed(dec),
                        currentPrice: +livePrice.toFixed(dec),
                        distATR:      zone.distATR,
                        distPct:      zone.distPct,
                        status:       zone.status,
                        strength:     zone.strength,
                        desc:         zone.desc || `Zone ${zone.kind} ${zone.type}`,
                        message:      `⚡ ${symbol} : zone ${zone.kind.toUpperCase()} ${zone.type === 'bullish' ? 'BUY' : 'SELL'} à ${zone.distATR.toFixed(1)} ATR (${zone.distPct.toFixed(2)}%)`,
                        timestamp:    Date.now(),
                    });

                    for (const ws of clients) {
                        if (ws.readyState === ws.OPEN) {
                            try { ws.send(payload); } catch { /* ignore */ }
                        }
                    }
                }

                // Snapshot de toutes les zones actives (pour le frontend)
                if (zoneData.zones.length > 0) {
                    const zonesPayload = JSON.stringify({
                        type:    'zones_snapshot',
                        symbol,
                        zones:   zoneData.zones.slice(0, 10).map(z => ({
                            type:      z.type,
                            kind:      z.kind,
                            entry:     +z.entry.toFixed(livePrice >= 1000 ? 0 : 2),
                            distATR:   z.distATR,
                            distPct:   z.distPct,
                            status:    z.status,
                            strength:  z.strength,
                            rr:        z.rr,
                        })),
                        timestamp: Date.now(),
                    });

                    for (const ws of clients) {
                        if (ws.readyState === ws.OPEN) {
                            try { ws.send(zonesPayload); } catch { /* ignore */ }
                        }
                    }
                }

            } catch { /* ignore individual symbol errors */ }
        }));

    } catch (err) {
        logger.warn('SignalStream v2 error', { err: err.message });
    }
}

// ── Envoi d'un signal externe (depuis autoSignal ou limitSignal) ──
// Utilisé pour broadcaster un signal déjà construit

function sendToAll(payloadObj) {
    const payload = JSON.stringify(payloadObj);
    for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); } catch { /* ignore */ }
        }
    }
}

// ── Lifecycle ─────────────────────────────────────────────────────

function start() {
    if (broadcastTimer) return;
    // Zone alerts toutes les 30s
    broadcastTimer = setInterval(broadcastZoneAlerts, 30000);
    // Premier envoi après 5s
    setTimeout(broadcastZoneAlerts, 5000);
    logger.info('SignalStream v2 démarré — zone alerts 30s');
}

function registerClient(ws) {
    clients.add(ws);
    start();
    // Envoyer un snapshot immédiat des zones au nouveau client
    setTimeout(() => broadcastZoneAlerts(), 1000);
}

function unregisterClient(ws) {
    clients.delete(ws);
}

module.exports = { registerClient, unregisterClient, sendToAll };
