import React, { useEffect, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';

interface AssetCell {
  symbol: string;
  label:  string;
  price:  number;
  change: number;
  pct:    number;
  group:  string;
}

const GROUPS: Record<string, string[]> = {
  'Commodities': ['XAU/USD', 'XAG/USD', 'WTI/USD'],
  'Forex':       ['EUR/USD', 'GBP/USD', 'USD/JPY', 'CHF/JPY', 'AUD/USD'],
  'Crypto':      ['BTC/USD', 'ETH/USD', 'SOL/USD'],
  'Stocks':      ['AAPL/USD', 'TSLA/USD', 'NVDA/USD'],
  'Indices':     ['SPX500/USD', 'NAS100/USD', 'US30/USD'],
};

const SHORT: Record<string, string> = {
  'XAU/USD':'GOLD','XAG/USD':'SILVER','WTI/USD':'OIL',
  'EUR/USD':'EUR','GBP/USD':'GBP','USD/JPY':'JPY','CHF/JPY':'CHFJPY','AUD/USD':'AUD',
  'BTC/USD':'BTC','ETH/USD':'ETH','SOL/USD':'SOL',
  'AAPL/USD':'AAPL','TSLA/USD':'TSLA','NVDA/USD':'NVDA',
  'SPX500/USD':'SPX','NAS100/USD':'NDX','US30/USD':'DOW',
};

function heatColor(pct: number): string {
  const clamped = Math.max(-3, Math.min(3, pct));
  if (clamped > 0) {
    const intensity = clamped / 3;
    return `rgba(0, 255, 136, ${0.08 + intensity * 0.35})`;
  } else {
    const intensity = Math.abs(clamped) / 3;
    return `rgba(255, 51, 85, ${0.08 + intensity * 0.35})`;
  }
}

function textColor(pct: number): string {
  if (pct > 0.3)  return 'var(--buy)';
  if (pct < -0.3) return 'var(--sell)';
  return 'var(--text-dim)';
}

export default function MarketHeatmap() {
  const prices = useMarketStore((s) => s.prices);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const symbol    = useMarketStore((s) => s.symbol);
  const [cells, setCells] = useState<AssetCell[]>([]);

  useEffect(() => {
    const all: AssetCell[] = [];
    for (const [group, symbols] of Object.entries(GROUPS)) {
      for (const sym of symbols) {
        const p = prices[sym];
        if (p) {
          all.push({
            symbol: sym,
            label:  SHORT[sym] || sym,
            price:  p.price,
            change: p.change,
            pct:    p.changePct,
            group,
          });
        }
      }
    }
    setCells(all);
  }, [prices]);

  if (cells.length === 0) {
    return (
      <div className="panel">
        <div className="panel-header"><span className="panel-title">💹 HEATMAP</span></div>
        <div className="panel-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const sorted = [...cells].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const max = Math.max(0.01, ...cells.map(c => Math.abs(c.pct)));

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">💹 MARKET HEATMAP</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
          {cells.length} assets
        </span>
      </div>
      <div className="panel-body" style={{ padding: '10px 12px' }}>
        {/* Treemap-style grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(62px, 1fr))',
          gap: 4,
        }}>
          {sorted.map((c) => {
            const size = 0.55 + (Math.abs(c.pct) / max) * 0.45;
            const isSelected = c.symbol === symbol;
            return (
              <button
                key={c.symbol}
                onClick={() => setSymbol(c.symbol)}
                style={{
                  background: heatColor(c.pct),
                  border: `1px solid ${isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 'var(--r-sm)',
                  padding: '8px 4px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  transition: 'all 0.15s ease',
                  transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: isSelected ? `0 0 12px ${c.pct >= 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,85,0.3)'}` : 'none',
                }}
                data-tip={`${c.symbol} • ${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(2)}%`}
              >
                <div style={{
                  fontSize: Math.max(9, 11 * size),
                  fontWeight: 700,
                  color: textColor(c.pct),
                  fontFamily: 'Syne, sans-serif',
                  lineHeight: 1,
                }}>
                  {c.label}
                </div>
                <div style={{
                  fontSize: 9,
                  fontFamily: 'Space Mono, monospace',
                  color: textColor(c.pct),
                  fontWeight: 700,
                }}>
                  {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>

        {/* Légende */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, marginTop: 10,
        }}>
          {[[-3,'Très baissier'], [-1,'Baissier'], [0,'Neutre'], [1,'Haussier'], [3,'Très haussier']].map(([v, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 12, height: 12, borderRadius: 2,
                background: heatColor(v as number),
                border: '1px solid rgba(255,255,255,0.1)',
              }} />
              <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
