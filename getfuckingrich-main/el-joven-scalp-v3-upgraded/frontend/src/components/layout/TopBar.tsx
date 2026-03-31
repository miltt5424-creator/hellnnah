import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketStore } from '../../store/marketStore';
import { useUIStore } from '../../store/uiStore';
import { useAlertStore } from '../../store/alertStore';
import { formatPrice, formatPct } from '../../utils/priceFormat';
import UserMenu from './UserMenu';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePlan } from '../../hooks/usePlan';

interface TopBarProps { wsStatus: 'connecting' | 'connected' | 'disconnected'; }

const TICKER_SYMS = ['XAU/USD','BTC/USD','EUR/USD','GBP/USD','ETH/USD','NAS100/USD','SPX500/USD','XAG/USD'];

export default function TopBar({ wsStatus }: TopBarProps) {
  const prices       = useMarketStore((s) => s.prices);
  const setPage      = useUIStore((s) => s.setPage);
  const navigate     = useNavigate();
  const page         = useUIStore((s) => s.page);
  const soundEnabled = useAlertStore((s) => s.soundEnabled);
  const toggleSound  = useAlertStore((s) => s.toggleSound);
  const { isInPromo, promoDaysLeft } = usePlan();
  const isMobile = useIsMobile();
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const statusColor = wsStatus === 'connected' ? 'var(--buy)' : wsStatus === 'connecting' ? 'var(--gold)' : 'var(--sell)';
  const statusLabel = wsStatus === 'connected' ? 'LIVE' : wsStatus === 'connecting' ? 'SYNC' : 'OFFLINE';

  const tickerItems = TICKER_SYMS.flatMap(sym => {
    const p = prices[sym]; if (!p) return [];
    const up = p.changePct >= 0;
    const dec = sym.includes('BTC') || sym.includes('NAS') || sym.includes('SPX') ? 0 : sym.includes('JPY') ? 3 : 2;
    return [{ sym, price: p.price, pct: p.changePct, up, dec }];
  });

  return (
    <header style={{
      height: 52, flexShrink: 0, zIndex: 200,
      background: 'var(--glass-01)',
      backdropFilter: 'var(--blur-lg) var(--saturate)',
      WebkitBackdropFilter: 'var(--blur-lg) var(--saturate)',
      borderBottom: '1px solid var(--border-md)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 16,
      boxShadow: '0 1px 0 var(--border), 0 4px 20px rgba(0,0,0,0.4)',
    }}>
      {/* Hamburger mobile */}
      {isMobile && (
        <button onClick={() => window.dispatchEvent(new CustomEvent('open-drawer'))} style={{
          background: "none", border: "1px solid rgba(212,175,55,0.3)", borderRadius: 8,
          color: "var(--gold)", fontSize: 16, cursor: "pointer",
          width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>☰</button>
      )}

      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:170, flexShrink:0 }}>
        <div style={{
          width:32, height:32, borderRadius:'var(--r-md)',
          background:'linear-gradient(135deg, rgba(255,215,0,0.25) 0%, rgba(255,215,0,0.08) 100%)',
          border:'1px solid var(--border-gold)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:16, boxShadow:'var(--shadow-gold)',
          animation:'goldPulse 3s ease infinite',
        }}>⚡</div>
        <div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:900, fontSize:13, color:'var(--gold)', letterSpacing:'0.06em', lineHeight:1 }}>
            EL JOVEN SCALP
          </div>
          <div style={{ fontSize:8, color:'var(--text-muted)', letterSpacing:'0.18em', fontFamily:'Space Mono,monospace', marginTop:2 }}>
            PRO · AI TRADING DESK
          </div>
        </div>
      </div>

      {/* Ticker - desktop only */}
      {!isMobile && <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
        <div style={{ display:'flex', overflow:'hidden' }}>
          <div className="ticker-scroll" style={{ gap:0 }}>
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:6, padding:'0 18px',
                borderRight:'1px solid var(--border)',
                flexShrink:0,
              }}>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--text-dim)', fontFamily:'Space Mono,monospace' }}>
                  {item.sym.split('/')[0]}
                </span>
                <span style={{ fontFamily:'Space Mono,monospace', fontSize:12, fontWeight:700, color:item.up?'var(--buy)':'var(--sell)' }}>
                  {formatPrice(item.price, item.dec)}
                </span>
                <span style={{ fontSize:9, color:item.up?'var(--buy)':'var(--sell)', opacity:0.8 }}>
                  {item.up?'+':''}{item.pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* Nav */}
      {!isMobile && <nav style={{ display:'flex', gap:3, flexShrink:0 }}>
        {([
          { key:'dashboard', label:'📊 Dashboard' },
          { key:'journal',   label:'📒 Journal' },
          { key:'pricing',   label:'💎 Plans' },
          
        ] as const).map((item) => (
          <button key={item.key} className={`btn btn-ghost btn-sm ${page===item.key?'btn-gold':''}`}
            style={{ fontSize:10, padding:'5px 11px', borderColor:page===item.key?'var(--border-gold)':'transparent' }}
            onClick={() => { setPage(item.key as any); navigate('/' + item.key); }}>
            {item.label}
          </button>
        ))}
      </nav>}

      {/* Promo badge */}
      {isInPromo && (
        <div style={{
          display:'flex', alignItems:'center', gap:5, flexShrink:0,
          padding:'4px 10px', borderRadius:'var(--r-full)',
          background:'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.08))',
          border:'1px solid rgba(212,175,55,0.4)',
          animation:'goldPulse 3s ease infinite',
        }}>
          <span style={{fontSize:10}}>🎁</span>
          <span style={{fontFamily:'Space Mono,monospace', fontSize:9, color:'var(--gold)', fontWeight:700}}>
            LANCEMENT · J-{promoDaysLeft}
          </span>
        </div>
      )}

      {/* Right */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <div style={{ fontFamily:'Space Mono,monospace', fontSize:10, color:'var(--text-muted)' }}>
          {time.toUTCString().slice(17,25)} UTC
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={toggleSound} title={soundEnabled?'Mute':'Sound on'} style={{fontSize:13}}>
          {soundEnabled?'🔔':'🔕'}
        </button>
        <UserMenu />
        <div style={{
          display:'flex', alignItems:'center', gap:5,
          padding:'4px 10px', borderRadius:'var(--r-full)',
          background:'rgba(0,0,0,0.35)',
          border:`1px solid ${statusColor}33`,
        }}>
          <span style={{
            width:6, height:6, borderRadius:'50%', background:statusColor,
            boxShadow:`0 0 8px ${statusColor}`,
            animation: wsStatus==='connected'?'pulseDot 2s ease infinite':'pulse 1.5s ease infinite',
          }} />
          <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, color:statusColor, fontWeight:700 }}>
            {statusLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
