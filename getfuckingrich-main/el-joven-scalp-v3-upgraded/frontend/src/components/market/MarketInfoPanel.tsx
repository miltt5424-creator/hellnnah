import React, { useEffect, useRef, useState } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { formatPrice, formatChange, formatPct } from '../../utils/priceFormat';
import { getMarketStatus } from '../../utils/marketHours';

const META: Record<string, { icon:string; name:string; dec:number }> = {
  'XAU/USD':    { icon:'🥇', name:'Gold Spot',    dec:2 },
  'XAG/USD':    { icon:'🥈', name:'Silver Spot',   dec:3 },
  'WTI/USD':    { icon:'⛽', name:'WTI Crude',     dec:2 },
  'EUR/USD':    { icon:'💶', name:'Euro/Dollar',   dec:5 },
  'GBP/USD':    { icon:'💷', name:'Pound/Dollar',  dec:5 },
  'USD/JPY':    { icon:'💴', name:'Dollar/Yen',    dec:3 },
  'AUD/USD':    { icon:'🦘', name:'AUD/Dollar',    dec:5 },
  'BTC/USD':    { icon:'₿',  name:'Bitcoin',       dec:0 },
  'ETH/USD':    { icon:'Ξ',  name:'Ethereum',      dec:2 },
  'SOL/USD':    { icon:'◎',  name:'Solana',        dec:2 },
  'AAPL/USD':   { icon:'🍎', name:'Apple',         dec:2 },
  'TSLA/USD':   { icon:'⚡', name:'Tesla',         dec:2 },
  'NVDA/USD':   { icon:'🟩', name:'NVIDIA',        dec:2 },
  'SPX500/USD': { icon:'🏛️', name:'S&P 500',       dec:0 },
  'NAS100/USD': { icon:'🧠', name:'Nasdaq 100',    dec:0 },
  'US30/USD':   { icon:'🏗️', name:'Dow Jones',     dec:0 },
};

const TIMEFRAMES = ['1min','5min','15min','1h','4h','1d'] as const;

export default function MarketInfoPanel() {
  const symbol    = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const setTF     = useMarketStore((s) => s.setTimeframe);
  const prices    = useMarketStore((s) => s.prices);
  const p         = prices[symbol];
  const meta      = META[symbol] || { icon:'📈', name:symbol, dec:2 };
  const { open, label: openLabel, reason: openReason } = getMarketStatus(symbol);
  const up        = p && p.changePct >= 0;

  const [flash, setFlash] = useState<'up'|'down'|null>(null);
  const prevPrice = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!p) return;
    if (prevPrice.current !== undefined && prevPrice.current !== p.price) {
      setFlash(p.price > prevPrice.current ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 600);
      prevPrice.current = p.price;
      return () => clearTimeout(t);
    }
    prevPrice.current = p.price;
  }, [p?.price]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            width:32, height:32, borderRadius:'var(--r-md)',
            background:'rgba(255,255,255,0.06)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:16, border:'1px solid var(--border)',
          }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:'var(--text-primary)', lineHeight:1 }}>{symbol}</div>
            <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>{meta.name}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span className="pill" style={{
            background: open ? 'var(--buy-dim)' : 'var(--sell-dim)',
            borderColor: open ? 'var(--border-buy)' : 'var(--border-sell)',
            color: open ? 'var(--buy)' : 'var(--sell)',
          }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', animation: open?'pulseDot 2s infinite':'none' }} />
            {openLabel} {openReason ? `· ${openReason}` : ''}
          </span>
        </div>
      </div>

      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {p ? (
          <>
            <div className={flash === 'up' ? 'anim-flash-green' : flash === 'down' ? 'anim-flash-red' : ''}
              style={{ display:'flex', alignItems:'baseline', gap:8, padding:'4px 0', borderRadius:'var(--r-sm)' }}>
              <span style={{
                fontFamily:'Space Mono,monospace', fontSize:28, fontWeight:700,
                color: up ? 'var(--buy)' : 'var(--sell)', lineHeight:1,
                textShadow: `0 0 20px ${up?'var(--buy)':'var(--sell)'}50`,
              }}>
                {formatPrice(p.price, meta.dec)}
              </span>
              <div>
                <div style={{ fontFamily:'Space Mono,monospace', fontSize:11, color: up ? 'var(--buy)' : 'var(--sell)' }}>
                  {up?'+':''}{formatChange(p.change, meta.dec)}
                </div>
                <div style={{ fontFamily:'Space Mono,monospace', fontSize:10, color: up ? 'var(--buy)' : 'var(--sell)', opacity:0.8 }}>
                  {formatPct(p.changePct)}
                </div>
              </div>
            </div>

            {(p.bid || p.ask) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5 }}>
                {[
                  { label:'BID', val: p.bid, color:'var(--sell)' },
                  { label:'ASK', val: p.ask, color:'var(--buy)' },
                  { label:'SPREAD', val: p.ask && p.bid ? p.ask - p.bid : null, color:'var(--gold)' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="card" style={{ textAlign:'center', padding:'5px 6px' }}>
                    <div style={{ fontSize:7, color:'var(--text-muted)', marginBottom:2, letterSpacing:'0.1em' }}>{label}</div>
                    <div style={{ fontFamily:'Space Mono,monospace', fontSize:9, fontWeight:700, color }}>
                      {val ? val.toFixed(meta.dec) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeframe selector */}
            <div>
              <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:4, letterSpacing:'0.1em' }}>TIMEFRAME</div>
              <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                {TIMEFRAMES.map((tf) => (
                  <button key={tf} className={`btn btn-sm ${timeframe===tf?'btn-gold':''}`}
                    style={{ padding:'3px 8px', fontSize:9, borderColor:timeframe===tf?'var(--border-gold)':'var(--border)' }}
                    onClick={() => setTF(tf)}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {p.source && (
              <div style={{ fontSize:8, color:'var(--text-muted)', fontFamily:'Space Mono,monospace' }}>
                SOURCE: {p.source.toUpperCase()}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign:'center', padding:'16px 0', color:'var(--text-muted)', fontSize:11 }}>
            <div className="spinner" style={{ margin:'0 auto 8px' }} />
            Fetching {symbol}...
          </div>
        )}
      </div>
    </div>
  );
}
