'use strict';

/**
 * Chat Bus — version simple sans Redis (100% gratuit)
 * Diffuse les messages aux clients WebSocket connectés (même instance)
 */

const clients = new Map(); // id -> ws

function registerClient(id, ws) {
    clients.set(id, ws);
}

function unregisterClient(id) {
    clients.delete(id);
}

async function broadcastChat(message) {
    const payload = JSON.stringify({ type: 'chat', ...message });
    for (const ws of clients.values()) {
        if (ws.readyState === ws.OPEN) {
            try { ws.send(payload); } catch { /* ignore */ }
        }
    }
}

module.exports = { registerClient, unregisterClient, broadcastChat };
