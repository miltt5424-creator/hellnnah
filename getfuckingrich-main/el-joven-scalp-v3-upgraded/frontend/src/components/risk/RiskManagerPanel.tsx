import React, { useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { useSignalStore } from '../../store/signalStore';
import { calculateRisk } from '../../utils/riskCalc';
import { formatPrice } from '../../utils/priceFormat';

export default function RiskManagerPanel() {
  const prices   = useMarketStore((s) => s.prices);
  const symbol   = useMarketStore((s) => s.symbol);
  const latest   = useSignalStore((s) => s.signals[0]);

  const currentPrice = prices[symbol]?.price || 0;

  const [balance, setBalance]  = useState('10000');
  const [riskPct, setRiskPct]  = useState('1');
  const [entry, setEntry]      = useState('');
  const [sl, setSl]            = useState('');
  const [tp, setTp]            = useState('');

  // Auto-fill from latest signal
  const fillFromSignal = () => {
    if (!latest) return;
    setEntry(String(latest.entry.toFixed(2)));
    setSl(String(latest.stopLoss.toFixed(2)));
    setTp(String(latest.takeProfit.toFixed(2)));
  };

  const entryN   = parseFloat(entry)  || currentPrice;
  const slN      = parseFloat(sl)     || 0;
  const tpN      = parseFloat(tp)     || 0;
  const balN     = parseFloat(balance) || 10000;
  const riskN    = parseFloat(riskPct) || 1;

  const result = slN > 0 ? calculateRisk({
    accountBalance: balN,
    riskPercent: riskN,
    entryPrice: entryN,
    stopLoss: slN,
    takeProfit: tpN > 0 ? tpN : undefined,
  }) : null;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">💰 RISK MANAGER</span>
        {latest && (
          <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }} onClick={fillFromSignal}>
            AUTO FILL
          </button>
        )}
      </div>
      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {[
            { label: 'BALANCE ($)', value: balance, setter: setBalance, placeholder: '10000', full: false },
            { label: 'RISK (%)',    value: riskPct, setter: setRiskPct, placeholder: '1',     full: false },
            { label: 'ENTRY',      value: entry,   setter: setEntry,   placeholder: formatPrice(currentPrice, 2), full: false },
            { label: 'STOP LOSS',  value: sl,      setter: setSl,      placeholder: 'Stop price',   full: false },
            { label: 'TAKE PROFIT',value: tp,      setter: setTp,      placeholder: 'Target price', full: true },
          ].map(({ label, value, setter, placeholder, full }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: full ? 'span 2' : undefined }}>
              <label style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>
                {label}
              </label>
              <input
                className="input"
                type="number"
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                style={{ fontSize: 10, padding: '4px 7px' }}
              />
            </div>
          ))}
        </div>

        {result ? (
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--r-sm)',
            padding: '10px 12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 12px',
          }}>
            {[
              { label: 'LOT SIZE',    value: result.lotSize.toFixed(2),         color: 'var(--gold)' },
              { label: 'RISK $',      value: `$${result.riskAmount.toFixed(2)}`, color: 'var(--sell)' },
              { label: 'R:R RATIO',   value: result.rrRatio ? `1:${result.rrRatio}` : '—', color: result.rrRatio && result.rrRatio >= 2 ? 'var(--buy)' : 'var(--text-dim)' },
              { label: 'GAIN $',      value: result.potentialGain ? `+$${result.potentialGain.toFixed(2)}` : '—', color: 'var(--buy)' },
              { label: 'SL DISTANCE', value: result.slDistance.toFixed(2),       color: 'var(--text-primary)' },
              { label: 'TP DISTANCE', value: result.tpDistance ? result.tpDistance.toFixed(2) : '—', color: 'var(--text-primary)' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 1 }}>{label}</div>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>
            Enter entry and stop loss to calculate
          </div>
        )}
      </div>
    </div>
  );
}
