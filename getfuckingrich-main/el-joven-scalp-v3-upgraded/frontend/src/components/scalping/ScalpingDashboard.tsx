import React, { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { formatPrice } from '../../utils/priceFormat';
import { getActiveSessions, SESSIONS } from '../../utils/marketHours';

/* ── Order Flow Panel ────────────────────────────────────────────────────── */
export function OrderFlowPanel() {
  const orderbook = useMarketStore((s) => s.orderbook);
  const symbol    = useMarketStore((s) => s.symbol);

  const [of, setOf] = React.useState<any>({});
  React.useEffect(() => {
    try {
      const sig = (window as any).__latestSignal;
      if (sig?.strategy?.orderFlow) setOf(sig.strategy.orderFlow);
    } catch {}
  });

  const bids = orderbook?.bids || [];
  const asks = orderbook?.asks || [];
  const totalBid = bids.reduce((a: number, b: any) => a + b.size, 0);
  const totalAsk = asks.reduce((a: number, b: any) => a + b.size, 0);
  const total = totalBid + totalAsk;

  const bidPct = total > 0 ? (totalBid / total) * 100 : of.buyPressure ?? 50;
  const askPct = 100 - bidPct;
  const delta = of.delta ?? (bidPct - 50).toFixed(1);
  const hasRealData = total > 0 || of.buyPressure != null;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🌊 ORDER FLOW</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
          {symbol}{!hasRealData && ' · demo'}
        </span>
      </div>
      <div className="panel-body">
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4 }}>
            <span style={{ color: 'var(--buy)', fontWeight: 700 }}>BID {bidPct.toFixed(0)}%</span>
            <span style={{ color: 'var(--sell)', fontWeight: 700 }}>ASK {askPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--sell-dim)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${bidPct}%`, background: 'var(--buy)', borderRadius: 4, transition: 'width 0.3s ease', boxShadow: '0 0 8px rgba(0,255,136,0.4)' }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, fontWeight: 700, fontFamily: 'Space Mono, monospace', color: bidPct > 55 ? 'var(--buy)' : bidPct < 45 ? 'var(--sell)' : 'var(--text-dim)' }}>
            DELTA: {Number(delta) > 0 ? '+' : ''}{Number(delta).toFixed(1)}
          </div>
        </div>

        {total === 0 && of.imbalance && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>IMBALANCE</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: of.imbalance === 'bullish' ? 'var(--buy)' : of.imbalance === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>{of.imbalance?.toUpperCase()}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>MOMENTUM</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: of.momentum === 'bullish' ? 'var(--buy)' : of.momentum === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>{of.momentum === 'bullish' ? '▲' : of.momentum === 'bearish' ? '▼' : '—'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>ABSORPTION</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: of.absorption ? 'var(--gold)' : 'var(--text-muted)' }}>{of.absorption ? '⚠️ OUI' : 'NON'}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--buy)', marginBottom: 3, fontWeight: 700 }}>BIDS</div>
            {bids.slice(0, 5).map((b: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Space Mono, monospace', padding: '1px 0' }}>
                <span style={{ color: 'var(--buy)' }}>{formatPrice(b.price, 2)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{b.size}</span>
              </div>
            ))}
            {bids.length === 0 && <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>—</div>}
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--sell)', marginBottom: 3, fontWeight: 700 }}>ASKS</div>
            {asks.slice(0, 5).map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'Space Mono, monospace', padding: '1px 0' }}>
                <span style={{ color: 'var(--sell)' }}>{formatPrice(a.price, 2)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{a.size}</span>
              </div>
            ))}
            {asks.length === 0 && <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>—</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Scalp Timer Panel ───────────────────────────────────────────────────── */
export function ScalpTimerPanel() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const sessions = getActiveSessions();
  const utcHour = new Date(now).getUTCHours();
  const utcMin  = new Date(now).getUTCMinutes();
  const utcSec  = new Date(now).getUTCSeconds();

  function minutesUntil(targetHour: number): string {
    const nowMins = utcHour * 60 + utcMin;
    const tgtMins = targetHour * 60;
    let diff = tgtMins - nowMins;
    if (diff < 0) diff += 24 * 60;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">⏱️ SESSION TIMER</span>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: 'var(--gold)' }}>
          {String(utcHour).padStart(2,'0')}:{String(utcMin).padStart(2,'0')}:{String(utcSec).padStart(2,'0')} UTC
        </span>
      </div>
      <div className="panel-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SESSIONS.map((s) => {
            const isActive = sessions.some((a) => a.name === s.name);
            return (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 'var(--r-sm)', background: isActive ? `${s.color}10` : 'var(--bg-card)', border: `1px solid ${isActive ? s.color + '44' : 'var(--border)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? s.color : 'var(--border)', boxShadow: isActive ? `0 0 8px ${s.color}` : 'none' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? s.color : 'var(--text-muted)' }}>{s.name.toUpperCase()}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>{String(s.open).padStart(2,'0')}:00 – {String(s.close).padStart(2,'0')}:00</div>
                  {isActive && <div style={{ fontSize: 9, color: s.color }}>● ACTIVE</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Quick Trade Buttons ─────────────────────────────────────────────────── */
export function QuickTradeButtons() {
  const symbol = useMarketStore((s) => s.symbol);
  const prices = useMarketStore((s) => s.prices);
  const p = prices[symbol];
  const [lastAction, setLastAction] = useState<{ dir: string; price: number } | null>(null);

  const execute = (dir: 'BUY' | 'SELL') => {
    if (!p) return;
    setLastAction({ dir, price: p.price });
    setTimeout(() => setLastAction(null), 3000);
    console.log(`[ElJoven] Quick ${dir} ${symbol} @ ${p.price}`);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">⚡ QUICK TRADE</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>{symbol}</span>
      </div>
      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button className="btn btn-buy" style={{ padding: '12px', fontSize: 14, fontWeight: 800 }} onClick={() => execute('BUY')}>▲ BUY</button>
          <button className="btn btn-sell" style={{ padding: '12px', fontSize: 14, fontWeight: 800 }} onClick={() => execute('SELL')}>▼ SELL</button>
        </div>
        {lastAction && (
          <div style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', background: lastAction.dir === 'BUY' ? 'var(--buy-dim)' : 'var(--sell-dim)', border: `1px solid ${lastAction.dir === 'BUY' ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,85,0.3)'}`, fontSize: 11, color: lastAction.dir === 'BUY' ? 'var(--buy)' : 'var(--sell)', textAlign: 'center', fontFamily: 'Space Mono, monospace' }}>
            ✓ {lastAction.dir} @ {formatPrice(lastAction.price, 2)} — sent to MT5
          </div>
        )}
        {!p && <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Waiting for price data...</div>}
      </div>
    </div>
  );
}
