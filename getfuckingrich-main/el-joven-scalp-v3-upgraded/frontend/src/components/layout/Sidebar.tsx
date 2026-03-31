import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMarketStore } from '../../store/marketStore';
import { formatPrice } from '../../utils/priceFormat';

const GROUPS = [
  { label:'COMMODITIES', items:[
    { symbol:'XAU/USD', icon:'🥇', name:'Gold',      sub:'XAU/USD', dec:2 },
    { symbol:'XAG/USD', icon:'🥈', name:'Silver',    sub:'XAG/USD', dec:3 },
    { symbol:'WTI/USD', icon:'⛽', name:'Oil',       sub:'WTI/USD', dec:2 },
  ]},
  { label:'FOREX', items:[
    { symbol:'EUR/USD', icon:'💶', name:'EUR/USD',   sub:'Euro/Dollar',   dec:5 },
    { symbol:'GBP/USD', icon:'💷', name:'GBP/USD',   sub:'Pound/Dollar',  dec:5 },
    { symbol:'USD/JPY', icon:'💴', name:'USD/JPY',   sub:'Dollar/Yen',    dec:3 },
    { symbol:'AUD/USD', icon:'🦘', name:'AUD/USD',   sub:'Aussie/Dollar', dec:5 },
  ]},
  { label:'CRYPTO', items:[
    { symbol:'BTC/USD', icon:'₿',  name:'Bitcoin',  sub:'BTC/USD', dec:0 },
    { symbol:'ETH/USD', icon:'Ξ',  name:'Ethereum', sub:'ETH/USD', dec:2 },
    { symbol:'SOL/USD', icon:'◎',  name:'Solana',   sub:'SOL/USD', dec:2 },
  ]},
  { label:'STOCKS', items:[
    { symbol:'AAPL/USD', icon:'🍎', name:'Apple',   sub:'AAPL', dec:2 },
    { symbol:'TSLA/USD', icon:'⚡', name:'Tesla',   sub:'TSLA', dec:2 },
    { symbol:'NVDA/USD', icon:'🟩', name:'NVIDIA',  sub:'NVDA', dec:2 },
  ]},
  { label:'INDICES', items:[
    { symbol:'SPX500/USD', icon:'🏛️', name:'S&P 500',   sub:'SPX500', dec:0 },
    { symbol:'NAS100/USD', icon:'🧠', name:'Nasdaq 100', sub:'NAS100', dec:0 },
    { symbol:'US30/USD',   icon:'🏗️', name:'Dow Jones',  sub:'US30',   dec:0 },
  ]},
];

export default function Sidebar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [plan, setPlan] = useState('free');
  const symbol    = useMarketStore((s) => s.symbol);

  useEffect(() => {
    fetch('/api/auth/check', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.plan) setPlan(d.plan); })
      .catch(() => {});
  }, []);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const prices    = useMarketStore((s) => s.prices);
  const [collapsed, setCollapsed] = useState<Record<string,boolean>>({});
  const [open, setOpen] = useState(true);
  const toggle = (label: string) => setCollapsed(c => ({ ...c, [label]: !c[label] }));

  return (
    <div style={{ display: 'flex', position: 'relative', flexShrink: 0 }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: open ? 210 : 0,
        minWidth: open ? 210 : 0,
        overflow: 'hidden',
        transition: 'width 0.3s cubic-bezier(0.16,1,0.3,1), min-width 0.3s cubic-bezier(0.16,1,0.3,1)',
        background: 'var(--bg-deep)',
        borderRight: open ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Watchlist
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
            {Object.keys(prices).length} live feeds
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {GROUPS.map((group) => (
            <div key={group.label}>
              <button
                onClick={() => toggle(group.label)}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px 4px', background:'transparent', border:'none', cursor:'pointer' }}
              >
                <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'var(--text-muted)', textTransform:'uppercase' }}>
                  {group.label}
                </span>
                <span style={{ fontSize:8, color:'var(--text-muted)', transform: collapsed[group.label] ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }}>▾</span>
              </button>

              {!collapsed[group.label] && group.items.map((item) => {
                const p      = prices[item.symbol];
                const active = symbol === item.symbol;
                const up     = p && p.changePct >= 0;
                return (
                  <button
                    key={item.symbol}
                    onClick={() => setSymbol(item.symbol)}
                    style={{
                      width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'9px 16px',
                      background: active ? 'rgba(255,215,0,0.06)' : 'transparent',
                      border: 'none',
                      borderLeft: `2px solid ${active ? 'var(--gold)' : 'transparent'}`,
                      cursor:'pointer', transition:'background 0.15s', textAlign:'left',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:18, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, background: active ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)', flexShrink:0 }}>
                        {item.icon}
                      </span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color: active ? 'var(--gold)' : 'var(--text-primary)', lineHeight:1.2 }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:1, fontFamily:'Space Mono, monospace' }}>
                          {item.sub}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {p ? (
                        <>
                          <div style={{ fontSize:11, fontFamily:'Space Mono, monospace', fontWeight:700, color: active ? 'var(--gold)' : 'var(--text-primary)', lineHeight:1.2 }}>
                            {formatPrice(p.price, item.dec)}
                          </div>
                          <div style={{ fontSize:9, color: up ? 'var(--buy)' : 'var(--sell)', fontFamily:'Space Mono, monospace', marginTop:1 }}>
                            {up ? '+' : ''}{p.changePct.toFixed(2)}%
                          </div>
                        </>
                      ) : (
                        <div className="skeleton" style={{ width:40, height:10, marginLeft:'auto' }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', flexDirection:'column', gap:8 }}>
          <div className={`plan-badge plan-${plan}`} style={{ width:'100%', justifyContent:'center', padding:'6px 0', fontSize:10 }}>
            {plan === 'admin' ? '🛡️ ADMIN' : plan === 'elite' ? '👑 ELITE' : plan === 'pro' ? '⚡ PRO' : '🌱 FREE'}
          </div>
          {(plan === 'admin') && (
            <button
              onClick={() => navigate('/admin')}
              style={{
                width: '100%', padding: '7px 0',
                background: location.pathname === '/admin' ? 'rgba(255,68,68,0.15)' : 'rgba(255,68,68,0.06)',
                border: '1px solid rgba(255,68,68,0.3)',
                borderRadius: 8, color: '#ff6b6b',
                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              🛡️ ADMIN PANEL
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              width: '100%', padding: '7px 0',
              background: location.pathname === '/dashboard' ? 'rgba(212,175,55,0.1)' : 'transparent',
              border: '1px solid rgba(212,175,55,0.2)',
              borderRadius: 8, color: 'var(--gold)',
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}
          >
            📊 Dashboard
          </button>
        </div>
      </aside>

      {/* ── Toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'absolute',
          top: '50%',
          right: open ? -14 : -6,
          transform: 'translateY(-50%)',
          zIndex: 50,
          width: 24,
          height: 48,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 10,
          transition: 'all 0.2s',
          padding: 0,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--gold)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
        title={open ? 'Fermer sidebar' : 'Ouvrir sidebar'}
      >
        {open ? '◀' : '▶'}
      </button>

    </div>
  );
}
