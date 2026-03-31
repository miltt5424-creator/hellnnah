import { useEffect, useRef, useCallback, useState } from 'react';
import { useMarketStore } from '../store/marketStore';
import { useSignalStore } from '../store/signalStore';
import { publishLiveTick } from '../utils/liveTickBus';
import type { PriceData, Orderbook } from '../types/market';
import type { TradingSignal } from '../types/signal';

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

const RECONNECT_BASE = 1000;
const RECONNECT_MAX  = 30000;
const HEARTBEAT_MS   = 25000;

function resolveWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function useWebSocket() {
  const wsRef          = useRef<WebSocket | null>(null);
  const retryRef       = useRef(0);
  const heartbeatRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<WsStatus>('connecting');

  const updatePrice    = useMarketStore((s) => s.updatePrice);
  const updateOrderbook = useMarketStore((s) => s.updateOrderbook);
  const symbol         = useMarketStore((s) => s.symbol);
  const addSignal      = useSignalStore((s) => s.addSignal);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus('connecting');
    const ws = new WebSocket(resolveWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      retryRef.current = 0;
      // Subscribe to current symbol
      ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'price') {
          const data: PriceData = {
            price: msg.price, bid: msg.bid, ask: msg.ask,
            change: msg.change, changePct: msg.changePct,
            volume: msg.volume, source: msg.source, ts: msg.ts,
          };
          updatePrice(msg.symbol, data);
          publishLiveTick({ symbol: msg.symbol, price: msg.price, timestamp: msg.ts });
        } else if (msg.type === 'orderbook') {
          updateOrderbook({ bids: msg.bids, asks: msg.asks } as Orderbook);
        } else if (msg.type === 'signal') {
          addSignal({ ...msg, id: `${msg.symbol}-${msg.timestamp}` } as TradingSignal);
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      const delay = Math.min(RECONNECT_BASE * 2 ** retryRef.current, RECONNECT_MAX);
      retryRef.current++;
      setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, [updatePrice, updateOrderbook, addSignal, symbol]);

  useEffect(() => {
    connect();
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Re-subscribe when symbol changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }, [symbol]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send };
}
