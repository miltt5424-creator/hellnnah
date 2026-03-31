import React, { useState, useEffect } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { useIsMobile } from '../../hooks/useIsMobile';

// Radar-like scorecard : un bloc par module du strategyEngine
const MODULES = [
  { key: 'mtf',        label: 'MTF',        icon: '🔁', desc: 'Multi-Timeframe' },
  { key: 'smc',        label: 'SMC',        icon: '📐', desc: 'Smart Money' },
  { key: 'ict',        label: 'ICT',        icon: '🕐', desc: 'Kill Zone / OTE' },
  { key: 'ichimoku',   label: 'ICHIMOKU',   icon: '☁️', desc: 'Nuage' },
  { key: 'supertrend', label: 'SUPERTREND', icon: '📈', desc: 'Direction' },
  { key: 'adx',        label: 'ADX',        icon: '📶', desc: 'Force tendance' },
  { key: 'fibonacci',  label: 'FIBONACCI',  icon: '🌀', desc: 'OTE zone' },
  { key: 'divergence', label: 'DIVERGENCE', icon: '📊', desc: 'RSI' },
  { key: 'volume',     label: 'VOLUME',     icon: '⚖️', desc: 'POC / VWAP' },
  { key: 'dxy',        label: 'DXY',        icon: '💵', desc: 'Corrélation' },
  { key: 'regime',     label: 'RÉGIME',     icon: '⚡', desc: 'Marché' },
  { key: 'structure',  label: 'STRUCTURE',  icon: '🏛️', desc: 'HH/HL' },
];

function getModuleSignal(key: string, latest: any): { signal: 'BUY' | 'SELL' | 'NEUTRAL'; value: string; active: boolean } {
  const s = latest?.strategy || latest;
  const neutral = { signal: 'NEUTRAL' as const, value: '—', active: false };
  if (!s) return neutral;

  switch (key) {
    case 'mtf': {
      const dir = s.mtfDirection || s.mtf?.direction;
      const conf = s.mtfConfluence || s.mtf?.confluence;
      if (!dir || dir === 'neutral') return { ...neutral, value: conf || '—', active: !!conf };
      return { signal: dir === 'bullish' ? 'BUY' : 'SELL', value: conf || dir, active: true };
    }
    case 'smc': {
      const bias = s.smcBias || s.smc?.bias;
      if (!bias || bias === 'neutral') return neutral;
      return { signal: bias === 'bullish' ? 'BUY' : 'SELL', value: bias.toUpperCase(), active: true };
    }
    case 'ict': {
      const kz = s.killZone || s.ict?.killZone?.name;
      const ote = s.ote || s.ict?.ote?.type;
      if (!kz && !ote) return neutral;
      const val = kz ? kz.replace(' KZ','').replace(' Open','') : ote?.includes('bullish') ? 'OTE ↑' : 'OTE ↓';
      const sig = ote ? (ote.includes('bullish') ? 'BUY' : 'SELL') : 'NEUTRAL';
      return { signal: sig as any, value: val, active: true };
    }
    case 'ichimoku': {
      const ich = s.ichimoku || s.strategy?.ichimoku;
      if (!ich) return neutral;
      const sig = ich.bias === 'bullish' ? 'BUY' : ich.bias === 'bearish' ? 'SELL' : 'NEUTRAL';
      const val = ich.aboveCloud ? '↑ DESSUS' : ich.belowCloud ? '↓ DESSOUS' : 'DANS';
      return { signal: sig as any, value: val + (ich.tkCross ? ' TK' : ''), active: true };
    }
    case 'supertrend': {
      const st = s.supertrend || s.strategy?.supertrend;
      if (!st) return neutral;
      return { signal: st.direction === 'bullish' ? 'BUY' : 'SELL', value: st.direction?.toUpperCase() + (st.crossed ? ' 🔔' : ''), active: true };
    }
    case 'adx': {
      const adx = s.adx || s.strategy?.adx;
      if (!adx) return neutral;
      const val = `${adx.adx}`;
      const sig = adx.isStrong ? (adx.trend?.includes('bullish') ? 'BUY' : 'SELL') : 'NEUTRAL';
      return { signal: sig as any, value: val + (adx.isStrong ? ' 💪' : ' weak'), active: adx.isStrong };
    }
    case 'fibonacci': {
      const fib = s.fibonacci || s.strategy?.fibonacci;
      if (!fib) return neutral;
      const sig = fib.inOTE ? (fib.direction === 'upswing' ? 'BUY' : 'SELL') : 'NEUTRAL';
      return { signal: sig as any, value: fib.inOTE ? 'ZONE OTE' : fib.nearFib ? fib.nearestLevel?.label || '—' : '—', active: fib.inOTE || fib.nearFib };
    }
    case 'divergence': {
      const div = s.divergence || s.strategy?.divergence;
      if (!div) return neutral;
      const sig = div.type?.includes('bullish') ? 'BUY' : div.type?.includes('bearish') ? 'SELL' : 'NEUTRAL';
      const val = div.type?.includes('regular') ? 'RVRSMNT' : 'CONTINU.';
      return { signal: sig as any, value: val, active: true };
    }
    case 'volume': {
      const poc = s.poc || s.strategy?.volProfile?.poc;
      const nearPOC = s.nearPOC || s.strategy?.volProfile?.nearPOC;
      const skew = s.strategy?.volProfile?.skew;
      if (!poc) return neutral;
      const sig = skew === 'BUY' ? 'BUY' : skew === 'SELL' ? 'SELL' : 'NEUTRAL';
      return { signal: sig as any, value: nearPOC ? '✅ POC' : 'LOIN POC', active: !!poc };
    }
    case 'dxy': {
      const dxyBias = s.dxyBias || s.strategy?.dxy?.dxyBias;
      if (!dxyBias || !['XAU/USD','EUR/USD','GBP/USD'].includes(s.symbol || '')) return { ...neutral, value: 'N/A' };
      const favoursBuy = dxyBias === 'bearish';
      return { signal: favoursBuy ? 'BUY' : 'SELL', value: dxyBias === 'bearish' ? '↓ DXY' : '↑ DXY', active: true };
    }
    case 'regime': {
      const regime = s.regime || s.strategy?.regime;
      if (!regime) return neutral;
      const icon = regime.regime === 'compression' ? '⚡' : regime.regime === 'expansion' ? '🚀' : regime.regime === 'range' ? '📊' : '🎯';
      return { signal: 'NEUTRAL', value: icon + ' ' + (regime.regime || '').toUpperCase(), active: true };
    }
    case 'structure': {
      const ms = s.marketStructure?.m1 || s.strategy?.marketStructure?.m1;
      if (!ms || ms.trend === 'undetermined') return neutral;
      const sig = ms.trend === 'bullish' ? 'BUY' : ms.trend === 'bearish' ? 'SELL' : 'NEUTRAL';
      const val = ms.trend === 'bullish' ? `HH×${ms.hhCount} HL×${ms.hlCount}` : ms.trend === 'bearish' ? `LL×${ms.llCount} LH×${ms.lhCount}` : 'RANGE';
      return { signal: sig as any, value: val, active: true };
    }
    default: return neutral;
  }
}

export default function CompositeScorePanel() {
  const isMobile = useIsMobile();
  const latest = useSignalStore((s) => s.signals[0]);
  const score = (latest as any)?.compositeScore ?? 0;
  const signalDir = score >= 30 ? 'BUY' : score <= -30 ? 'SELL' : 'NEUTRAL';
  const signalColor = signalDir === 'BUY' ? 'var(--buy)' : signalDir === 'SELL' ? 'var(--sell)' : 'var(--text-dim)';
  const scoreDisplay = score > 0 ? `+${score}` : `${score}`;
  const pct = Math.max(0, Math.min(100, (score + 100) / 2));

  // Compter les modules actifs bullish/bearish
  const moduleSignals = MODULES.map(m => ({ ...m, ...getModuleSignal(m.key, latest) }));
  const bullCount = moduleSignals.filter(m => m.signal === 'BUY').length;
  const bearCount = moduleSignals.filter(m => m.signal === 'SELL').length;
  const activeCount = moduleSignals.filter(m => m.active).length;

  // Next kill zone
  const nextKZ = (latest as any)?.nextKillZone || (latest as any)?.strategy?.nextKillZone;

  // Fear & Greed Index via backend (cache 1h, pas de CORS)
  const [fearGreed, setFearGreed] = useState<{ value: number; label: string } | null>(null);
  useEffect(() => {
    const load = () =>
      fetch('/api/feargreed', { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (d.success) setFearGreed({ value: d.value, label: d.label }); })
        .catch(() => {});
    load();
    const t = setInterval(load, 3600000); // refresh toutes les 1h
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🎯 COMPOSITE SCORE</span>
        <span style={{ fontFamily:'Space Mono,monospace', fontSize:16, fontWeight:700, color:signalColor, textShadow:`0 0 12px ${signalColor}` }}>{scoreDisplay}</span>
      </div>
      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>

        {/* Score bar */}
        <div style={{ padding:'10px 12px', background: signalDir === 'BUY' ? 'var(--buy-dim)' : signalDir === 'SELL' ? 'var(--sell-dim)' : 'rgba(255,255,255,0.03)', borderRadius:10, border:`1px solid ${signalColor}30` }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <div style={{ fontSize:18, fontWeight:900, color:signalColor, letterSpacing:'0.05em' }}>
              {signalDir === 'BUY' ? '📈 BULLISH' : signalDir === 'SELL' ? '📉 BEARISH' : '⚖️ NEUTRAL'}
            </div>
            <div style={{ textAlign:'right', fontSize:10, color:'var(--text-muted)' }}>
              <div>🟢 {bullCount} modules</div>
              <div>🔴 {bearCount} modules</div>
            </div>
          </div>
          <div style={{ height:8, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden', position:'relative' }}>
            <div style={{ position:'absolute', left:'50%', height:'100%', width:1, background:'rgba(255,255,255,0.25)' }} />
            <div style={{ height:'100%', borderRadius:4, background:signalColor, boxShadow:`0 0 10px ${signalColor}`,
              width:`${Math.abs(score)/2}%`, marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score)/2}%`,
              transition:'width 0.7s cubic-bezier(0.16,1,0.3,1)' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:3, fontSize:8, color:'var(--text-muted)', fontFamily:'Space Mono,monospace' }}>
            <span>BEAR -100</span><span>0</span><span>+100 BULL</span>
          </div>
        </div>

        {/* Next Kill Zone countdown */}
        {nextKZ && (
          <div style={{ padding:'6px 10px', borderRadius:8, background:'rgba(255,193,7,0.08)', border:'1px solid rgba(255,193,7,0.3)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:9, color:'var(--gold)' }}>⏰ Prochaine session</span>
            <span style={{ fontSize:9, fontWeight:700, color:'var(--gold)', fontFamily:'Space Mono,monospace' }}>
              {nextKZ.name} dans {nextKZ.hoursLeft}h
            </span>
          </div>
        )}

        {/* Fear & Greed Index */}
        {fearGreed && (
          <div style={{ padding:'8px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ position:'relative', width:36, height:36, flexShrink:0 }}>
              <svg width="36" height="36" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                <circle cx="18" cy="18" r="14" fill="none"
                  stroke={fearGreed.value <= 40 ? 'var(--sell)' : fearGreed.value >= 60 ? 'var(--buy)' : 'var(--gold)'}
                  strokeWidth="4"
                  strokeDasharray={`${fearGreed.value * 0.879} 87.9`}
                  strokeLinecap="round" />
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:900, fontFamily:'Space Mono,monospace', color: fearGreed.value <= 40 ? 'var(--sell)' : fearGreed.value >= 60 ? 'var(--buy)' : 'var(--gold)' }}>
                {fearGreed.value}
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:2 }}>😱 FEAR & GREED — BTC</div>
              <div style={{ fontSize:10, fontWeight:700, color: fearGreed.value <= 40 ? 'var(--sell)' : fearGreed.value >= 60 ? 'var(--buy)' : 'var(--gold)' }}>
                {fearGreed.label.toUpperCase()}
              </div>
            </div>
          </div>
        )}

        {/* Scorecard 14 modules */}
        <div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:6, letterSpacing:'0.1em' }}>
            SCORECARD — {activeCount}/{MODULES.length} modules actifs
          </div>
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap:4 }}>
            {moduleSignals.map(m => {
              const sigColor = m.signal === 'BUY' ? 'var(--buy)' : m.signal === 'SELL' ? 'var(--sell)' : 'var(--text-muted)';
              const bg = m.signal === 'BUY' ? 'rgba(0,230,118,0.07)' : m.signal === 'SELL' ? 'rgba(255,51,85,0.07)' : 'rgba(255,255,255,0.02)';
              const border = m.signal === 'BUY' ? 'rgba(0,230,118,0.2)' : m.signal === 'SELL' ? 'rgba(255,51,85,0.2)' : 'var(--border)';
              return (
                <div key={m.key} style={{ padding:'6px 7px', borderRadius:8, background:bg, border:`1px solid ${border}`, opacity: m.active ? 1 : 0.4 }}>
                  <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:2 }}>{m.icon} {m.label}</div>
                  <div style={{ fontSize:9, fontWeight:700, color:sigColor, fontFamily:'Space Mono,monospace', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {m.value || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Signaux actifs du moteur */}
        {(latest as any)?.strategy?.signals?.length > 0 && (
          <div>
            <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:5, letterSpacing:'0.1em' }}>⚡ SIGNAUX ACTIFS</div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {((latest as any).strategy.signals as string[]).slice(0, 6).map((s, i) => {
                const isBull = s.includes('haussier') || s.includes('bullish') || s.includes('↑');
                const isBear = s.includes('baissier') || s.includes('bearish') || s.includes('↓');
                return (
                  <div key={i} style={{ fontSize:9, padding:'3px 8px', borderRadius:6,
                    background: isBull ? 'var(--buy-dim)' : isBear ? 'var(--sell-dim)' : 'rgba(255,255,255,0.03)',
                    border:`1px solid ${isBull ? 'var(--border-buy)' : isBear ? 'var(--border-sell)' : 'var(--border)'}`,
                    color: isBull ? 'var(--buy)' : isBear ? 'var(--sell)' : 'var(--text-dim)' }}>
                    {isBull ? '▲' : isBear ? '▼' : '●'} {s}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!latest && (
          <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-muted)', fontSize:11 }}>
            <div style={{ fontSize:28, marginBottom:8, opacity:0.4 }}>🎯</div>
            En attente du premier signal…
          </div>
        )}
      </div>
    </div>
  );
}