import React, { useState } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { formatPrice } from '../../utils/priceFormat';

type Filter = 'ALL' | 'BUY' | 'SELL' | 'HOLD';

function exportCSV(signals: any[]) {
  const header = ['time','signal','symbol','confidence','entry','sl','tp','rr','score','adx','regime','mtf','aiEngine'];
  const rows = signals.map(s => [
    new Date(s.timestamp).toISOString(),
    s.signal, s.symbol, s.confidence,
    s.entry, s.stopLoss, s.takeProfit,
    s.rr?.toFixed ? s.rr.toFixed(2) : s.rr,
    (s as any).compositeScore || '',
    (s as any).adx?.adx || '',
    (s as any).regime?.regime || '',
    (s as any).mtfConfluence || '',
    s.aiEngine || '',
  ].join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'signals.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function SignalHistoryPanel() {
  const signals = useSignalStore((s) => s.signals);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = filter === 'ALL' ? signals : signals.filter(s => s.signal === filter);

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <span className="panel-title">📜 HISTORIQUE SIGNAUX</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono,monospace', marginRight: 4 }}>
            {filtered.length}/{signals.length}
          </span>
          {(['ALL','BUY','SELL'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '2px 7px', borderRadius: 6, fontSize: 8, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${filter===f ? (f==='BUY'?'var(--border-buy)':f==='SELL'?'var(--border-sell)':'var(--border)') : 'var(--border)'}`,
              background: filter===f ? (f==='BUY'?'var(--buy-dim)':f==='SELL'?'var(--sell-dim)':'rgba(255,255,255,0.06)') : 'transparent',
              color: filter===f ? (f==='BUY'?'var(--buy)':f==='SELL'?'var(--sell)':'var(--text-primary)') : 'var(--text-muted)',
            }}>{f}</button>
          ))}
          {signals.length > 0 && (
            <button onClick={() => exportCSV(signals)} title="Exporter CSV" style={{
              padding: '2px 7px', borderRadius: 6, fontSize: 8, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)',
            }}>⬇ CSV</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 300 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 14px', color: 'var(--text-muted)', fontSize: 11 }}>
            Aucun signal {filter !== 'ALL' ? filter : ''}
          </div>
        ) : filtered.map((s, i) => {
          const c = s.signal==='BUY'?'var(--buy)':s.signal==='SELL'?'var(--sell)':'var(--text-dim)';
          const sid = s.id || String(i);
          const isOpen = expanded === sid;
          const rr = s.stopLoss && s.takeProfit && s.entry
            ? Math.abs((s.takeProfit - s.entry) / (s.entry - s.stopLoss)).toFixed(1) : null;
          const adx = (s as any).adx;
          const regime = (s as any).regime;
          const mtfConf = (s as any).mtfConfluence;
          const score = (s as any).compositeScore;
          const fib = (s as any).fibonacci;
          const ichimoku = (s as any).ichimoku;
          const supertrend = (s as any).supertrend;

          return (
            <div key={sid} className="anim-slide-left" style={{ animationDelay: `${i*20}ms`, borderBottom: '1px solid var(--border-sm)' }}>
              {/* Row principale */}
              <div
                onClick={() => setExpanded(isOpen ? null : sid)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                  background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent' }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 6, background: `${c}18`, border: `1px solid ${c}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                  {s.signal==='BUY'?'🟢':s.signal==='SELL'?'🔴':'⚪'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: c }}>{s.signal}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.symbol}</span>
                    {rr && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,193,7,0.1)', color: 'var(--gold)' }}>RR {rr}x</span>}
                    {mtfConf && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4,
                      background: mtfConf==='HIGH'?'rgba(0,230,118,0.1)':'rgba(255,255,255,0.05)',
                      color: mtfConf==='HIGH'?'var(--buy)':'var(--text-muted)' }}>{mtfConf}</span>}
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'Space Mono,monospace' }}>
                      {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <span style={{ fontFamily: 'Space Mono,monospace', fontSize: 9, color: 'var(--text-secondary)' }}>{formatPrice(s.entry, 2)}</span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{s.confidence}%</span>
                    {score !== undefined && <span style={{ fontSize: 8, color: score > 0 ? 'var(--buy)' : 'var(--sell)' }}>{score > 0 ? '+' : ''}{score}</span>}
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', fontStyle: 'italic' }}>{s.aiEngine}</span>
                  </div>
                </div>
                <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 2 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Détails expandés — indicateurs v4 */}
              {isOpen && (
                <div style={{ padding: '8px 12px 10px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border-sm)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 6 }}>
                    {[
                      { label: 'SL', val: s.stopLoss > 0 ? formatPrice(s.stopLoss, 2) : '—', color: 'var(--sell)' },
                      { label: 'TP', val: s.takeProfit > 0 ? formatPrice(s.takeProfit, 2) : '—', color: 'var(--buy)' },
                      { label: 'RR', val: rr ? `${rr}x` : '—', color: 'var(--gold)' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ textAlign: 'center', padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 1 }}>{label}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'Space Mono,monospace' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Badges indicateurs v4 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {adx?.adx && (
                      <span style={{ fontSize: 7, padding: '2px 6px', borderRadius: 4, background: adx.isStrong ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.05)', color: adx.isStrong ? 'var(--buy)' : 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        ADX {adx.adx}{adx.isStrong ? ' 💪' : ''}
                      </span>
                    )}
                    {fib?.inOTE && (
                      <span style={{ fontSize: 7, padding: '2px 6px', borderRadius: 4, background: 'rgba(147,112,219,0.15)', color: '#b39ddb', border: '1px solid rgba(147,112,219,0.25)' }}>
                        🌀 OTE Fib
                      </span>
                    )}
                    {regime?.regime && (
                      <span style={{ fontSize: 7, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>
                        ⚡ {regime.regime}
                      </span>
                    )}
                    {ichimoku?.bias && (
                      <span style={{ fontSize: 7, padding: '2px 6px', borderRadius: 4, background: ichimoku.bias === 'bullish' ? 'rgba(0,230,118,0.1)' : 'rgba(255,51,85,0.1)', color: ichimoku.bias === 'bullish' ? 'var(--buy)' : 'var(--sell)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        ☁ Ichi {ichimoku.bias}
                      </span>
                    )}
                    {supertrend?.direction && (
                      <span style={{ fontSize: 7, padding: '2px 6px', borderRadius: 4, background: supertrend.direction === 'UP' ? 'rgba(0,230,118,0.1)' : 'rgba(255,51,85,0.1)', color: supertrend.direction === 'UP' ? 'var(--buy)' : 'var(--sell)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        ST {supertrend.direction}
                      </span>
                    )}
                  </div>

                  {s.reasoning && (
                    <div style={{ marginTop: 6, fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.5, padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 5 }}>
                      💡 {s.reasoning.length > 100 ? s.reasoning.slice(0, 100) + '…' : s.reasoning}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}