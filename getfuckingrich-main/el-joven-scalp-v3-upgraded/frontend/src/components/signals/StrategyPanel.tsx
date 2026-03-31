import React, { useEffect, useState, useCallback } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { useMarketStore } from '../../store/marketStore';
import { formatPrice } from '../../utils/priceFormat';

export default function StrategyPanel() {
  const latest = useSignalStore((s) => s.signals[0]);
  const symbol = useMarketStore((s) => s.symbol);
  const [strategy, setStrategy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchStrategy = async () => {
    setLoading(true);
    try {
      const base = (window as any).API_BASE || '';
      const r = await fetch(`${base}/api/signal`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe: '5min', ai: 'auto' }),
      });
      const d = await r.json();
      if (d.success && d.strategy) { setStrategy(d.strategy); setLastUpdated(Date.now()); }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    if (latest?.strategy) { setStrategy(latest.strategy); setLastUpdated(latest.timestamp || Date.now()); }
  }, [latest]);

  useEffect(() => {
    const isRecent = latest?.timestamp && (Date.now() - latest.timestamp) < 60000;
    if (!isRecent) fetchStrategy();
    const interval = setInterval(() => {
      const stillRecent = latest?.timestamp && (Date.now() - latest.timestamp) < 60000;
      if (!stillRecent) fetchStrategy();
    }, 30000);
    return () => clearInterval(interval);
  }, [symbol]);

  const score = strategy?.score || 0;

  // Sessions mondiales temps réel
  const [sessionTimes, setSessionTimes] = useState<Record<string, { time: string; open: boolean }>>({});
  const updateSessions = useCallback(() => {
    const now = new Date();
    const sessions = {
      Tokyo:   { offset: 9,  open: [0, 9]  },  // 00h-09h UTC
      Londres: { offset: 0,  open: [7, 16] },  // 07h-16h UTC
      NewYork: { offset: -5, open: [12, 21]},  // 12h-21h UTC
    };
    const result: Record<string, { time: string; open: boolean }> = {};
    for (const [name, cfg] of Object.entries(sessions)) {
      const h = now.getUTCHours(), m = now.getUTCMinutes();
      const localH = (h + cfg.offset + 24) % 24;
      const open = h >= cfg.open[0] && h < cfg.open[1];
      result[name] = { time: `${String(localH).padStart(2,'0')}:${String(m).padStart(2,'0')}`, open };
    }
    setSessionTimes(result);
  }, []);
  useEffect(() => { updateSessions(); const t = setInterval(updateSessions, 30000); return () => clearInterval(t); }, [updateSessions]);
  const scoreColor = score > 30 ? 'var(--buy)' : score < -30 ? 'var(--sell)' : 'var(--gold)';
  const scoreBg    = score > 30 ? 'var(--buy-dim)' : score < -30 ? 'var(--sell-dim)' : 'rgba(255,215,0,0.08)';
  const smc  = strategy?.smc || {};
  const ict  = strategy?.ict || {};
  const hlz  = strategy?.hlz || {};
  const of   = strategy?.orderFlow || {};
  const pe   = strategy?.preciseEntry || {};
  const hhll      = strategy?.hhll       || null;
  const adx          = strategy?.adx            || null;
  const fibonacci    = strategy?.fibonacci      || null;
  const regime       = strategy?.regime         || null;
  const ichimoku     = strategy?.ichimoku       || null;
  const supertrend   = strategy?.supertrend     || null;
  const divergence   = strategy?.divergence     || null;
  const rejection    = strategy?.rejection      || null;
  const mss          = strategy?.mss            || null;
  const premDiscount = strategy?.premiumDiscount|| null;
  const nextKZ       = strategy?.nextKillZone   || null;
  const marketStruct = strategy?.marketStructure|| null;

  const biasColor = smc.bias === 'bullish' ? 'var(--buy)' : smc.bias === 'bearish' ? 'var(--sell)' : 'var(--text-muted)';
  const biasIcon  = smc.bias === 'bullish' ? '🟢' : smc.bias === 'bearish' ? '🔴' : '⚪';

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <div>
            <div className="panel-title">STRATEGY ENGINE</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 1 }}>SMC · ICT · HLZ · ADX · Fibonacci · Ichimoku</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {lastUpdated && <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-sm" onClick={fetchStrategy} disabled={loading} style={{ fontSize: 10, padding: '3px 8px', borderColor: 'var(--border)' }}>
            {loading ? <span className="spinner spinner-sm" /> : '🔄'}
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Score Global */}
        <div className="card" style={{ padding: '10px 12px', background: scoreBg, borderColor: `${scoreColor}40` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>SCORE COMPOSITE</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: scoreColor, fontFamily: 'Space Mono,monospace' }}>{score > 0 ? '+' : ''}{score}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>BIAS SMC</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: biasColor }}>{biasIcon} {(smc.bias || 'neutral').toUpperCase()}</div>
            </div>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(255,255,255,0.2)' }} />
            <div style={{ height: '100%', borderRadius: 3, background: scoreColor, width: `${Math.abs(score) / 2}%`, marginLeft: score >= 0 ? '50%' : `${50 - Math.abs(score) / 2}%`, transition: 'all 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 7, color: 'var(--sell)' }}>SELL -100</span>
            <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>0</span>
            <span style={{ fontSize: 7, color: 'var(--buy)' }}>BUY +100</span>
          </div>
        </div>

        {/* Sessions mondiales */}
        {Object.keys(sessionTimes).length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4 }}>
            {Object.entries(sessionTimes).map(([name, data]) => (
              <div key={name} style={{ padding:'5px 6px', borderRadius:8, textAlign:'center', background: data.open ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.02)', border:`1px solid ${data.open ? 'rgba(0,230,118,0.3)' : 'var(--border)'}` }}>
                <div style={{ fontSize:7, color: data.open ? 'var(--buy)' : 'var(--text-muted)', marginBottom:2, fontWeight:700 }}>
                  {data.open ? '🟢' : '⚫'} {name}
                </div>
                <div style={{ fontSize:9, fontFamily:'Space Mono,monospace', color: data.open ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: data.open ? 700 : 400 }}>
                  {data.time}
                </div>
                {data.open && <div style={{ fontSize:6, color:'var(--buy)', marginTop:1 }}>OUVERTE</div>}
              </div>
            ))}
          </div>
        )}

        {/* Signaux actifs */}
        {strategy?.signals?.length > 0 && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5 }}>⚡ SIGNAUX ACTIFS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {strategy.signals.map((s: string, i: number) => (
                <div key={i} style={{ fontSize: 9, padding: '4px 8px', borderRadius: 'var(--r-sm)', background: s.includes('haussier')||s.includes('bullish')||s.includes('✅') ? 'var(--buy-dim)' : s.includes('baissier')||s.includes('bearish') ? 'var(--sell-dim)' : 'rgba(255,255,255,0.04)', border: `1px solid ${s.includes('haussier')||s.includes('bullish')||s.includes('✅') ? 'var(--border-buy)' : s.includes('baissier')||s.includes('bearish') ? 'var(--border-sell)' : 'var(--border)'}`, color: s.includes('haussier')||s.includes('bullish')||s.includes('✅') ? 'var(--buy)' : s.includes('baissier')||s.includes('bearish') ? 'var(--sell)' : 'var(--text-dim)' }}>
                  {s.includes('haussier')||s.includes('bullish') ? '▲' : s.includes('baissier')||s.includes('bearish') ? '▼' : '●'} {s}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HHLL Multi-Timeframe */}
        {hhll && (
          <div>
            <div style={{ fontSize: 9, color: '#00BCD4', marginBottom: 5, fontWeight: 700 }}>📐 HHLL — STRUCTURE 3TF</div>
            <div className="card" style={{ padding: '8px 10px', borderColor: hhll.structure === 'bullish' ? 'rgba(0,255,136,0.3)' : hhll.structure === 'bearish' ? 'rgba(255,51,85,0.3)' : 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: hhll.structure === 'bullish' ? 'var(--buy)' : hhll.structure === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>
                  {hhll.structure === 'bullish' ? '▲ HH/HL' : hhll.structure === 'bearish' ? '▼ LH/LL' : '— NEUTRAL'}
                </span>
                {hhll.aligned && <span style={{ fontSize: 8, color: 'var(--gold)', padding: '2px 6px', background: 'rgba(255,215,0,0.1)', borderRadius: 4 }}>✅ 3TF ALIGNÉS</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['LTF', hhll.details?.tf1], ['MTF', hhll.details?.tf3], ['HTF', hhll.details?.tf12]].map(([label, val]) => (
                  <div key={label as string} style={{ flex: 1, textAlign: 'center', padding: '4px', borderRadius: 4, background: val === 'bullish' ? 'var(--buy-dim)' : val === 'bearish' ? 'var(--sell-dim)' : 'rgba(255,255,255,0.03)', border: `1px solid ${val === 'bullish' ? 'var(--border-buy)' : val === 'bearish' ? 'var(--border-sell)' : 'var(--border)'}` }}>
                    <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: val === 'bullish' ? 'var(--buy)' : val === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>{val === 'bullish' ? '▲' : val === 'bearish' ? '▼' : '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SMC */}
        <div>
          <div style={{ fontSize: 9, color: 'var(--gold)', marginBottom: 5, fontWeight: 700 }}>📐 SMC — SMART MONEY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <div className="card" style={{ padding: '6px 8px' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>BOS</div>
              {smc.bos ? (
                <div style={{ fontSize: 9, fontWeight: 700, color: smc.bos.type === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>
                  {smc.bos.type === 'bullish' ? '▲' : '▼'} {smc.bos.type?.toUpperCase()}
                  {smc.bos.volumeConfirmed === false && <span style={{ fontSize:7, color:'var(--gold)', marginLeft:3 }}>⚠️vol</span>}<br/>
                  <span style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', color: 'var(--text-dim)' }}>@ {smc.bos.level?.toFixed(2)}</span>
                </div>
              ) : <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>—</div>}
            </div>
            <div className="card" style={{ padding: '6px 8px' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>CHOCH</div>
              {smc.choch ? (
                <div style={{ fontSize: 9, fontWeight: 700, color: smc.choch.type === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>
                  {smc.choch.type === 'bullish' ? '▲' : '▼'} {smc.choch.type?.toUpperCase()}<br/>
                  <span style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', color: 'var(--text-dim)' }}>@ {smc.choch.level?.toFixed(2)}</span>
                </div>
              ) : <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>—</div>}
            </div>
          </div>

          {/* MSS — Market Structure Shift */}
          {mss && (
            <div style={{ marginTop:5, padding:'6px 10px', borderRadius:'var(--r-sm)', background: mss.type==='bullish'?'var(--buy-dim)':'var(--sell-dim)', border:`1px solid ${mss.type==='bullish'?'var(--border-buy)':'var(--border-sell)'}` }}>
              <div style={{ fontSize:8, fontWeight:700, color:mss.type==='bullish'?'var(--buy)':'var(--sell)' }}>
                🏛️ MSS {mss.type?.toUpperCase()} CONFIRMÉ @ {mss.level?.toFixed(2)}
              </div>
            </div>
          )}

          {smc.orderBlocks?.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 3 }}>ORDER BLOCKS</div>
              {smc.orderBlocks.map((ob: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', marginBottom: 3, borderRadius: 'var(--r-sm)', background: ob.type === 'bullish' ? 'var(--buy-dim)' : 'var(--sell-dim)', border: `1px solid ${ob.type === 'bullish' ? 'var(--border-buy)' : 'var(--border-sell)'}` }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: ob.type === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>{ob.type === 'bullish' ? '🟢' : '🔴'} OB {ob.type?.toUpperCase()}</span>
                  <span style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', color: 'var(--text-dim)' }}>{ob.low?.toFixed(2)} — {ob.high?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {smc.fvg?.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 3 }}>FAIR VALUE GAPS</div>
              {smc.fvg.map((f: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', marginBottom: 3, borderRadius: 'var(--r-sm)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 8, color: f.type === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>FVG {f.type?.toUpperCase()}</span>
                  <span style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', color: 'var(--text-dim)' }}>{f.bottom?.toFixed(2)} — {f.top?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ICT */}
        <div>
          <div style={{ fontSize: 9, color: '#4285F4', marginBottom: 5, fontWeight: 700 }}>🕐 ICT — INNER CIRCLE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 5 }}>
            <div className="card" style={{ padding: '6px 8px', borderColor: ict.killZone ? 'rgba(255,215,0,0.3)' : 'var(--border)' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>KILL ZONE</div>
              {ict.killZone ? (
                <div style={{ fontSize: 8, fontWeight: 700, color: ict.killZone.quality === 1 ? 'var(--text-muted)' : 'var(--gold)' }}>
                  {ict.killZone.quality === 3 ? '🔥' : ict.killZone.quality === 2 ? '🟡' : '⚪'} {ict.killZone.name}<br/>
                  <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>{ict.killZone.bias}</span>
                </div>
              ) : <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Inactive</div>}
            </div>
            <div className="card" style={{ padding: '6px 8px' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>OTE ZONE</div>
              {ict.ote ? (
                <div style={{ fontSize: 8, fontWeight: 700, color: ict.ote.type === 'bullish_ote' ? 'var(--buy)' : 'var(--sell)' }}>
                  {ict.ote.type === 'bullish_ote' ? '▲' : '▼'} {ict.ote.level?.toFixed(2)}<br/>
                  <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>61.8%={ict.ote.fib618?.toFixed(2)}</span>
                </div>
              ) : <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>—</div>}
            </div>
          </div>

          {ict.liquiditySweep && (
            <div style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', marginBottom: 5, background: ict.liquiditySweep.type === 'bullish_sweep' ? 'var(--buy-dim)' : 'var(--sell-dim)', border: `1px solid ${ict.liquiditySweep.type === 'bullish_sweep' ? 'var(--border-buy)' : 'var(--border-sell)'}` }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: ict.liquiditySweep.type === 'bullish_sweep' ? 'var(--buy)' : 'var(--sell)' }}>💧 LIQUIDITY SWEEP — {ict.liquiditySweep.type?.replace('_', ' ').toUpperCase()}</div>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>{ict.liquiditySweep.desc} @ {ict.liquiditySweep.level?.toFixed(2)}</div>
            </div>
          )}

          {ict.pdArray?.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {ict.pdArray.map((p: any, i: number) => (
                <div key={i} className="card" style={{ flex: 1, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{p.label}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--text-primary)' }}>{p.price?.toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
          {/* Premium/Discount zone */}
          {premDiscount && (
            <div style={{ marginTop:5, padding:'6px 10px', borderRadius:'var(--r-sm)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:8, color:'var(--text-muted)' }}>💎 ZONE ICT</span>
              <span style={{ fontSize:9, fontWeight:700, color: premDiscount.zone==='discount'?'var(--buy)':premDiscount.zone==='premium'?'var(--sell)':'var(--gold)' }}>
                {premDiscount.zone?.toUpperCase()} {premDiscount.pct}%
              </span>
            </div>
          )}

          {/* Next Kill Zone */}
          {nextKZ && (
            <div style={{ marginTop:5, padding:'6px 10px', borderRadius:'var(--r-sm)', background:'rgba(255,193,7,0.08)', border:'1px solid rgba(255,193,7,0.3)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:8, color:'var(--gold)' }}>⏰ Prochaine session</span>
              <span style={{ fontSize:9, fontWeight:700, color:'var(--gold)', fontFamily:'Space Mono,monospace' }}>
                {nextKZ.name} dans {nextKZ.hoursLeft}h
              </span>
            </div>
          )}

          {/* Structure HH/HL */}
          {marketStruct && (
            <div style={{ marginTop:5 }}>
              <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:3 }}>STRUCTURE DE MARCHÉ</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                {[['M1', marketStruct.m1], ['H1', marketStruct.h1]].filter(([,v]) => v).map(([tf, ms]: any) => (
                  <div key={tf} style={{ padding:'5px 8px', borderRadius:'var(--r-sm)', background:'rgba(255,255,255,0.03)', border:`1px solid ${ms.trend==='bullish'?'var(--border-buy)':ms.trend==='bearish'?'var(--border-sell)':'var(--border)'}` }}>
                    <div style={{ fontSize:7, color:'var(--text-muted)', marginBottom:2 }}>🏛️ {tf}</div>
                    <div style={{ fontSize:9, fontWeight:700, color: ms.trend==='bullish'?'var(--buy)':ms.trend==='bearish'?'var(--sell)':'var(--text-muted)' }}>
                      {ms.trend==='bullish' ? `HH×${ms.hhCount} HL×${ms.hlCount}` : ms.trend==='bearish' ? `LL×${ms.llCount} LH×${ms.lhCount}` : 'RANGE'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* HLZ */}
        <div>
          <div style={{ fontSize: 9, color: '#9B59B6', marginBottom: 5, fontWeight: 700 }}>📊 HLZ — KEY ZONES</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            <div style={{ padding: '6px 8px', background: 'var(--buy-dim)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-buy)' }}>
              <div style={{ fontSize: 7, color: 'var(--buy)', marginBottom: 2 }}>🟢 SUPPORT</div>
              {hlz.nearestSupport ? (<><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--buy)', fontFamily: 'Space Mono,monospace' }}>{hlz.nearestSupport.price?.toFixed(2)}</div><div style={{ fontSize: 7, color: 'var(--text-muted)' }}>Force: {hlz.nearestSupport.strength}</div></>) : <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>—</div>}
            </div>
            <div style={{ padding: '6px 8px', background: 'var(--sell-dim)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-sell)' }}>
              <div style={{ fontSize: 7, color: 'var(--sell)', marginBottom: 2 }}>🔴 RÉSISTANCE</div>
              {hlz.nearestResistance ? (<><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sell)', fontFamily: 'Space Mono,monospace' }}>{hlz.nearestResistance.price?.toFixed(2)}</div><div style={{ fontSize: 7, color: 'var(--text-muted)' }}>Force: {hlz.nearestResistance.strength}</div></>) : <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>—</div>}
            </div>
          </div>
        </div>

        {/* Order Flow */}
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-primary)', marginBottom: 5, fontWeight: 700 }}>🌊 ORDER FLOW</div>
          <div className="card" style={{ padding: '8px 10px' }}>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 8, color: 'var(--buy)' }}>BUY {of.buyPressure || 50}%</span>
                <span style={{ fontSize: 8, color: 'var(--sell)' }}>SELL {of.sellPressure || 50}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--sell-dim)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, var(--buy), var(--buy-dim))', width: `${of.buyPressure || 50}%`, transition: 'width 0.5s ease' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>DELTA</div>
                <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: (of.delta||0) > 0 ? 'var(--buy)' : 'var(--sell)' }}>{(of.delta||0) > 0 ? '+' : ''}{of.delta || 0}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>IMBALANCE</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: of.imbalance === 'bullish' ? 'var(--buy)' : of.imbalance === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>{of.imbalance?.toUpperCase() || 'NEUTRAL'}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>MOMENTUM</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: of.momentum === 'bullish' ? 'var(--buy)' : of.momentum === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>{of.momentum === 'bullish' ? '▲' : of.momentum === 'bearish' ? '▼' : '—'} {of.momentum?.toUpperCase() || 'NEUTRAL'}</div>
              </div>
            </div>
            {of.absorption && <div style={{ marginTop: 6, fontSize: 8, color: 'var(--gold)', textAlign: 'center', padding: '3px', background: 'rgba(255,215,0,0.08)', borderRadius: 'var(--r-sm)' }}>⚠️ ABSORPTION détectée</div>}
          </div>
        </div>

        {/* Entrée précise */}
        {pe.entry && (
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 5 }}>🎯 ENTRÉE PRÉCISE (ALGO)</div>
            <div className="card" style={{ padding: '8px 10px', borderColor: 'rgba(255,215,0,0.3)' }}>
              <div style={{ fontSize: 8, color: 'var(--gold)', marginBottom: 6 }}>📍 {pe.entryReason}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 2 }}>ENTRÉE</div><div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--text-primary)' }}>{formatPrice(pe.entry, 2)}</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 7, color: 'var(--sell)', marginBottom: 2 }}>SL</div><div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--sell)' }}>{formatPrice(pe.stopLoss, 2)}</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: 7, color: 'var(--buy)', marginBottom: 2 }}>TP</div><div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono,monospace', color: 'var(--buy)' }}>{formatPrice(pe.takeProfit, 2)}</div></div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 6 }}><span style={{ fontSize: 9, fontWeight: 700, color: (pe.rr||0) >= 2 ? 'var(--buy)' : 'var(--gold)', fontFamily: 'Space Mono,monospace' }}>RR {pe.rr?.toFixed(2)}x</span></div>
            </div>
          </div>
        )}

        {/* ADX — Force de la tendance */}
        {adx && (
          <div>
            <div style={{ fontSize: 9, color: '#E91E63', marginBottom: 5, fontWeight: 700 }}>📶 ADX — FORCE DE TENDANCE</div>
            <div className="card" style={{ padding: '8px 10px', borderColor: adx.isStrong ? 'rgba(233,30,99,0.4)' : 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'Space Mono,monospace', color: adx.isStrong ? (adx.trend.includes('bullish') ? 'var(--buy)' : 'var(--sell)') : 'var(--text-muted)' }}>
                  {adx.adx}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: adx.isStrong ? (adx.trend.includes('bullish') ? 'var(--buy)' : 'var(--sell)') : 'var(--text-muted)' }}>
                    {adx.isStrong ? (adx.trend.includes('bullish') ? '🟢 TENDANCE FORTE ↑' : '🔴 TENDANCE FORTE ↓') : adx.trend === 'developing' ? '🟡 EN FORMATION' : '⚪ CHOP / RANGE'}
                  </div>
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>+DI {adx.pdi} / -DI {adx.mdi}</div>
                </div>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(adx.adx, 60) / 60 * 100}%`, background: adx.isStrong ? (adx.trend.includes('bullish') ? 'var(--buy)' : 'var(--sell)') : 'var(--text-muted)', borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: 7, color: 'var(--text-muted)' }}>
                <span>0 RANGE</span><span style={{ color: 'var(--gold)' }}>25 TENDANCE</span><span>60+</span>
              </div>
            </div>
          </div>
        )}

        {/* Fibonacci Automatique */}
        {fibonacci && (
          <div>
            <div style={{ fontSize: 9, color: '#FF9800', marginBottom: 5, fontWeight: 700 }}>🌀 FIBONACCI AUTO</div>
            <div className="card" style={{ padding: '8px 10px', borderColor: fibonacci.inOTE ? 'rgba(255,152,0,0.5)' : 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  Swing {fibonacci.direction === 'upswing' ? '↑ Haussier' : '↓ Baissier'}
                </span>
                {fibonacci.inOTE && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#FF9800', padding: '2px 6px', background: 'rgba(255,152,0,0.15)', borderRadius: 4 }}>
                    🎯 ZONE OTE (61.8-78.6%)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {fibonacci.levels?.map((lvl: any) => (
                  <div key={lvl.ratio} style={{
                    padding: '3px 6px', borderRadius: 4, fontSize: 8, fontFamily: 'Space Mono,monospace',
                    background: Math.abs(lvl.ratio - (fibonacci.nearestLevel?.ratio || -1)) < 0.001 ? 'rgba(255,152,0,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${Math.abs(lvl.ratio - (fibonacci.nearestLevel?.ratio || -1)) < 0.001 ? 'rgba(255,152,0,0.5)' : 'var(--border)'}`,
                    color: (lvl.ratio === 0.618 || lvl.ratio === 0.786) ? '#FF9800' : 'var(--text-dim)',
                  }}>
                    {lvl.label} <span style={{ color: 'var(--text-primary)' }}>{lvl.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Régime + Ichimoku + SuperTrend + Divergence */}
        {(regime || ichimoku || supertrend || (divergence) || (rejection && rejection.length > 0)) && (
          <div>
            <div style={{ fontSize: 9, color: '#00BCD4', marginBottom: 5, fontWeight: 700 }}>🔬 INDICATEURS AVANCÉS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

              {regime && (
                <div className="card" style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>RÉGIME</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: regime.regime === 'compression' ? 'var(--gold)' : regime.regime === 'expansion' ? 'var(--buy)' : 'var(--text-primary)' }}>
                    {regime.regime === 'compression' ? '⚡' : regime.regime === 'expansion' ? '🚀' : regime.regime === 'range' ? '📊' : '🎯'} {regime.regime?.toUpperCase()}
                  </span>
                </div>
              )}

              {ichimoku && (
                <div className="card" style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: ichimoku.bias === 'bullish' ? 'var(--border-buy)' : ichimoku.bias === 'bearish' ? 'var(--border-sell)' : 'var(--border)' }}>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>☁️ ICHIMOKU</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: ichimoku.bias === 'bullish' ? 'var(--buy)' : ichimoku.bias === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>
                      {ichimoku.aboveCloud ? '↑ AU-DESSUS' : ichimoku.belowCloud ? '↓ EN-DESSOUS' : '⚡ DANS NUAGE'}
                    </span>
                    {ichimoku.tkCross && <div style={{ fontSize: 7, color: 'var(--gold)' }}>TK Cross {ichimoku.tkCross}</div>}
                  </div>
                </div>
              )}

              {supertrend && (
                <div className="card" style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: supertrend.direction === 'bullish' ? 'var(--border-buy)' : 'var(--border-sell)' }}>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>📈 SUPERTREND {supertrend.crossed && <span style={{ color: 'var(--gold)' }}>🔔</span>}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: supertrend.direction === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>
                      {supertrend.direction?.toUpperCase()}
                    </span>
                    <div style={{ fontSize: 7, color: 'var(--text-muted)', fontFamily: 'Space Mono,monospace' }}>SL {supertrend.slLevel}</div>
                  </div>
                </div>
              )}

              {divergence && (
                <div className="card" style={{ padding: '6px 10px', borderColor: divergence.type?.includes('bullish') ? 'var(--border-buy)' : 'var(--border-sell)' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: divergence.type?.includes('bullish') ? 'var(--buy)' : 'var(--sell)' }}>
                    📊 {divergence.desc}
                  </span>
                </div>
              )}

              {rejection?.map((r: any, i: number) => (
                <div key={i} className="card" style={{ padding: '6px 10px', borderColor: r.signal === 'BUY' ? 'var(--border-buy)' : r.signal === 'SELL' ? 'var(--border-sell)' : 'var(--border)' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: r.signal === 'BUY' ? 'var(--buy)' : r.signal === 'SELL' ? 'var(--sell)' : 'var(--text-muted)' }}>
                    🕯️ {r.desc}
                  </span>
                </div>
              ))}

            </div>
          </div>
        )}

        {!strategy && !loading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 11 }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>🧠</div>
            Clique sur 🔄 pour analyser
          </div>
        )}
      </div>
    </div>
  );
}