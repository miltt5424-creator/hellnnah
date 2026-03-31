import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { useSignalGenerator } from '../../hooks/useSignals';
import { useMarketStore } from '../../store/marketStore';
import { formatPrice } from '../../utils/priceFormat';
import type { AIEngine } from '../../types/signal';

const AI_OPTIONS = [
  { key: 'auto',       label: 'AUTO',     icon: '🤖', color: 'var(--gold)',     desc: 'Best available' },
  { key: 'gemini',     label: 'GEMINI',   icon: '♊',  color: '#4285F4',        desc: 'Google AI Studio' },
  { key: 'grok',       label: 'GROK',     icon: '𝕏',  color: '#e0e0e0',        desc: 'xAI — Console' },
  { key: 'mistral',    label: 'MISTRAL',  icon: '🌬️', color: '#FF6B00',        desc: 'Mistral AI' },
  { key: 'openrouter', label: 'ROUTER',   icon: '🔀',  color: '#9B59B6',        desc: 'OpenRouter' },
] as const;

const TF_MODES = [
  { key: 'scalp',     label: '⚡ Scalp',    tfs: ['1min','3min','5min'],  color: 'var(--gold)',  desc: 'SL tight · 1-5min · quick entries' },
  { key: 'intraday',  label: '📈 Intraday', tfs: ['15min','30min','1h'],  color: '#4285F4',      desc: 'SL medium · 15min-1h · day trades' },
  { key: 'swing',     label: '🌊 Swing',    tfs: ['4h','1D'],             color: '#9B59B6',      desc: 'SL wide · 4h-1D · multi-day' },
] as const;

type TFMode = 'scalp' | 'intraday' | 'swing';

const AUTO_REFRESH_OPTIONS = [
  { label: 'OFF', value: 0 },
  { label: '1m',  value: 60 },
  { label: '3m',  value: 180 },
  { label: '5m',  value: 300 },
  { label: '10m', value: 600 },
];

interface EngineStatus { gemini:boolean; grok:boolean; mistral:boolean; openrouter:boolean; active:string|null; }

export default function AISignalPanel() {
  const latest        = useSignalStore((s) => s.signals[0]);
  const selectedAI    = useSignalStore((s) => s.selectedAI);
  const setAI         = useSignalStore((s) => s.setSelectedAI);
  const setTimeframe  = useMarketStore((s) => s.setTimeframe);
  const { generate, isGenerating, error } = useSignalGenerator();
  const [engines, setEngines]       = useState<EngineStatus|null>(null);
  const [expanded, setExpanded]     = useState(false);
  const [tfMode, setTfMode]         = useState<TFMode>('scalp');
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [countdown, setCountdown]   = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    fetch('/api/signal/engines', { credentials:'include' })
      .then(r => r.json()).then(d => { if(d.success) setEngines({ gemini:d.engines.gemini?.configured||false, grok:d.engines.grok?.configured||false, mistral:d.engines.mistral?.configured||false, openrouter:d.engines.openrouter?.configured||false, active:d.active }); }).catch(()=>{});
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh === 0) { setCountdown(0); return; }
    setCountdown(autoRefresh);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { generate(); return autoRefresh; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, generate]);

  useEffect(() => {
    const tf = TF_MODES.find(m => m.key === tfMode);
    if (tf && setTimeframe) setTimeframe(tf.tfs[0]);
  }, [tfMode]);

  const isConfigured = (k: AIEngine) => k === 'auto' ? true : engines ? (engines as any)[k] : false;
  const sig = latest?.signal;
  const sigColor = sig==='BUY'?'var(--buy)':sig==='SELL'?'var(--sell)':'var(--text-dim)';
  const sigBg = sig==='BUY'?'var(--buy-dim)':sig==='SELL'?'var(--sell-dim)':'var(--glass-03)';
  const conf = latest?.confidence ?? 0;
  const rr = latest?.takeProfit && latest?.stopLoss && latest?.entry
    ? Math.abs((latest.takeProfit - latest.entry) / (latest.entry - latest.stopLoss))
    : null;
  const newsBlocked   = (latest as any)?.newsBlocked;
  const spreadBlocked = (latest as any)?.spreadBlocked;

  return (
    <div className={`panel ${sig==='BUY'?'panel-buy':sig==='SELL'?'panel-sell':''}`}>
      <div className="panel-header">
        <span className="panel-title">⚡ AI SIGNAL</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {engines?.active ? (
            <span style={{ fontSize:9, color:'var(--buy)', fontFamily:'Space Mono,monospace' }}>✅ {engines.active.toUpperCase()}</span>
          ) : engines && (
            <span style={{ fontSize:9, color:'var(--gold)', fontFamily:'Space Mono,monospace' }}>⚠️ DEMO</span>
          )}
        </div>
      </div>

      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {/* AI Engine Selector */}
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          {AI_OPTIONS.map((ai) => {
            const configured = isConfigured(ai.key as AIEngine);
            const active = selectedAI === ai.key;
            return (
              <button key={ai.key} onClick={() => setAI(ai.key as AIEngine)} className="btn btn-sm"
                style={{ borderColor: active ? ai.color + '55' : 'var(--border)', color: active ? ai.color : configured ? 'var(--text-dim)' : 'var(--text-muted)', background: active ? ai.color + '14' : 'transparent', opacity: configured ? 1 : 0.5, fontSize: 9, padding:'3px 8px' }}
                title={ai.desc}>
                <span>{ai.icon}</span> {ai.label}
                {!configured && ai.key !== 'auto' && <span style={{ opacity:0.5 }}> 🔑</span>}
              </button>
            );
          })}
        </div>

        {latest ? (
          <div className="anim-fade-in">
            {/* News / Spread blocked warning */}
            {(newsBlocked || spreadBlocked) && (
              <div style={{ padding:'8px 10px', borderRadius:'var(--r-sm)', marginBottom:8, background:'rgba(255,165,0,0.1)', border:'1px solid rgba(255,165,0,0.4)', fontSize:10, color:'#FFA500', lineHeight:1.5 }}>
                {newsBlocked   && <div>📰 Signal bloqué — événement macro imminent</div>}
                {spreadBlocked && <div>📊 Signal bloqué — spread trop élevé</div>}
                <div style={{ fontSize:8, color:'var(--text-muted)', marginTop:2 }}>{latest.reasoning}</div>
              </div>
            )}

            {/* Big Signal Badge */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:'var(--r-md)', background: sigBg, border:`1px solid ${sigColor}30`, marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:44, height:44, borderRadius:'var(--r-md)', background:`linear-gradient(135deg, ${sigColor}22, ${sigColor}08)`, border:`1px solid ${sigColor}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:`0 0 16px ${sigColor}20` }}>
                  {sig==='BUY'?'🟢':sig==='SELL'?'🔴':'⚪'}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:20, fontWeight:900, color:sigColor, letterSpacing:'0.05em', textShadow:`0 0 20px ${sigColor}60`, lineHeight:1 }}>{sig}</div>
                  <div style={{ fontSize:8, color:'var(--text-muted)', fontFamily:'Space Mono,monospace', marginTop:3 }}>{latest.aiEngine?.toUpperCase()} · {latest.symbol} · {latest.timeframe}</div>
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:18, fontWeight:700, fontFamily:'Space Mono,monospace', color:'var(--text-primary)', lineHeight:1 }}>{formatPrice(latest.price ?? latest.entry, 2)}</div>
                <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:3 }}>Conf: <span style={{ color:sigColor, fontWeight:700 }}>{conf}%</span></div>
              </div>
            </div>

            {/* Confidence Bar */}
            <div style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontSize:9, color:'var(--text-muted)' }}>CONFIDENCE</span>
                <span style={{ fontSize:9, fontFamily:'Space Mono,monospace', color:sigColor }}>{conf}%</span>
              </div>
              <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:'var(--r-full)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${conf}%`, background:`linear-gradient(90deg, ${sigColor}80, ${sigColor})`, borderRadius:'var(--r-full)', transition:'width 0.6s cubic-bezier(0.16,1,0.3,1)', boxShadow:`0 0 8px ${sigColor}` }} />
              </div>
            </div>

            {/* Trade Plan */}
            {latest.entry && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:5, marginBottom:8 }}>
                {[
                  { label:'ENTRY', val: formatPrice(latest.entry, 2), color:'var(--text-primary)' },
                  { label:'STOP',  val: formatPrice(latest.stopLoss, 2), color:'var(--sell)' },
                  { label:'TARGET',val: formatPrice(latest.takeProfit, 2), color:'var(--buy)' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="card" style={{ textAlign:'center', padding:'6px 8px' }}>
                    <div style={{ fontSize:7, color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:3 }}>{label}</div>
                    <div style={{ fontFamily:'Space Mono,monospace', fontSize:10, fontWeight:700, color }}>{val}</div>
                  </div>
                ))}
              </div>
            )}

            {rr !== null && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:9, color:'var(--text-muted)' }}>RISK/REWARD</span>
                <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, fontWeight:700, color: rr >= 2 ? 'var(--buy)' : rr >= 1.5 ? 'var(--gold)' : 'var(--sell)' }}>1 : {rr.toFixed(2)}</span>
              </div>
            )}

            {/* ── MTF Confluence M1/M15/H1 ── */}
            {((latest as any).tf1Bias || (latest as any).mtfConfluence) && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:5, letterSpacing:'0.1em', display:'flex', justifyContent:'space-between' }}>
                  <span>MTF CONFLUENCE</span>
                  <span style={{ color: (latest as any).mtfConfluence === 'HIGH' ? 'var(--buy)' : (latest as any).mtfConfluence === 'MEDIUM' ? 'var(--gold)' : 'var(--sell)', fontWeight:700 }}>
                    {(latest as any).mtfConfluence}
                  </span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
                  {[
                    { label:'M1',  key:'tf1Bias' },
                    { label:'M15', key:'tf15Bias' },
                    { label:'H1',  key:'tf60Bias' },
                  ].map(({ label, key }) => {
                    const bias = (latest as any)[key];
                    const c = bias === 'bullish' ? 'var(--buy)' : bias === 'bearish' ? 'var(--sell)' : 'var(--text-muted)';
                    return (
                      <div key={label} style={{ textAlign:'center', padding:'5px 4px', borderRadius:'var(--r-sm)', background:'rgba(255,255,255,0.03)', border:`1px solid ${c}30` }}>
                        <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:2 }}>{label}</div>
                        <div style={{ fontSize:9, fontWeight:800, color:c }}>{bias === 'bullish' ? '↑' : bias === 'bearish' ? '↓' : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── POC + VWAP ── */}
            {((latest as any).poc || (latest as any).vwap) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginBottom:8 }}>
                {(latest as any).poc && (
                  <div style={{ padding:'5px 8px', borderRadius:'var(--r-sm)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:7, color:'var(--text-muted)', marginBottom:2 }}>POC</div>
                    <div style={{ fontSize:9, fontFamily:'Space Mono,monospace', fontWeight:700, color: (latest as any).nearPOC ? 'var(--buy)' : 'var(--text-secondary)' }}>
                      {(latest as any).poc} {(latest as any).nearPOC && <span style={{ color:'var(--buy)', fontSize:7 }}>✅</span>}
                    </div>
                  </div>
                )}
                {(latest as any).vwap && (
                  <div style={{ padding:'5px 8px', borderRadius:'var(--r-sm)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:7, color:'var(--text-muted)', marginBottom:2 }}>VWAP</div>
                    <div style={{ fontSize:9, fontFamily:'Space Mono,monospace', fontWeight:700, color:'var(--text-secondary)' }}>{(latest as any).vwap}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── DXY Bias ── */}
            {(latest as any).dxyBias && ['XAU/USD','EUR/USD','GBP/USD'].includes(latest.symbol) && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6, padding:'5px 8px', borderRadius:'var(--r-sm)', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                <span style={{ fontSize:9, color:'var(--text-muted)' }}>DXY DOLLAR</span>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:9, fontWeight:700, color: (latest as any).dxyBias === 'bearish' ? 'var(--buy)' : 'var(--sell)', fontFamily:'Space Mono,monospace' }}>
                    {(latest as any).dxyBias === 'bearish' ? '↓ Faible' : '↑ Fort'}
                  </span>
                  <span style={{ fontSize:7, color:'var(--text-muted)' }}>
                    {(latest as any).dxyBias === 'bearish' ? '→ fav. ' + latest.symbol : '→ def. ' + latest.symbol}
                  </span>
                </div>
              </div>
            )}

            {/* ── Kelly Position Size ── */}
            {(latest as any).kellySafe && (
              <div style={{ padding:'7px 10px', borderRadius:'var(--r-sm)', background: (latest as any).kellySafe >= 1.5 ? 'rgba(0,230,118,0.08)' : 'rgba(255,193,7,0.08)', border:`1px solid ${(latest as any).kellySafe >= 1.5 ? 'rgba(0,230,118,0.3)' : 'rgba(255,193,7,0.3)'}`, marginBottom:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ fontSize:9, color:'var(--text-muted)' }}>⚖️ KELLY POSITION SIZE</span>
                  <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, fontWeight:800, color: (latest as any).kellySafe >= 1.5 ? 'var(--buy)' : 'var(--gold)' }}>
                    {(latest as any).kellySafe}% du capital
                  </span>
                </div>
                <div style={{ fontSize:8, color:'var(--text-muted)' }}>{(latest as any).kellyNote}</div>
              </div>
            )}

            {latest.reasoning && (
              <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.03)', borderRadius:'var(--r-sm)', border:'1px solid var(--border)', cursor:'pointer' }} onClick={()=>setExpanded(!expanded)}>
                <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:3, display:'flex', justifyContent:'space-between' }}>
                  <span>AI REASONING</span><span>{expanded?'▲':'▼'}</span>
                </div>
                <div style={{ fontSize:10, color:'var(--text-secondary)', lineHeight:1.5, display: expanded ? 'block' : '-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                  {latest.reasoning}
                </div>
                {expanded && (
                  <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                    {(latest as any).ichimoku && (
                      <div style={{ fontSize:9, color: (latest as any).ichimoku.bias === 'bullish' ? 'var(--buy)' : (latest as any).ichimoku.bias === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>
                        ☁️ Ichimoku: {(latest as any).ichimoku.bias} {(latest as any).ichimoku.tkCross ? `| TK Cross ${(latest as any).ichimoku.tkCross}` : ''} {(latest as any).ichimoku.aboveCloud ? '| Au-dessus du nuage' : (latest as any).ichimoku.belowCloud ? '| En-dessous du nuage' : '| Dans le nuage'}
                      </div>
                    )}
                    {(latest as any).supertrend && (
                      <div style={{ fontSize:9, color: (latest as any).supertrend.direction === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>
                        📈 SuperTrend: {(latest as any).supertrend.direction} {(latest as any).supertrend.crossed ? '🔔 CROSSED!' : ''} | SL dynamique: {(latest as any).supertrend.slLevel}
                      </div>
                    )}
                    {(latest as any).divergence && (
                      <div style={{ fontSize:9, color: (latest as any).divergence.type?.includes('bullish') ? 'var(--buy)' : 'var(--sell)', fontWeight:700 }}>
                        📊 {(latest as any).divergence.desc}
                      </div>
                    )}
                    {(latest as any).rejection && (latest as any).rejection.map((r: any, i: number) => (
                      <div key={i} style={{ fontSize:9, color: r.signal === 'BUY' ? 'var(--buy)' : r.signal === 'SELL' ? 'var(--sell)' : 'var(--text-muted)' }}>
                        🕯️ {r.desc}
                      </div>
                    ))}
                    {(latest as any).liquiditySweep && (
                      <div style={{ fontSize:9, color:'var(--gold)' }}>⚡ {(latest as any).liquiditySweep}</div>
                    )}
                    {(latest as any).inducement && (
                      <div style={{ fontSize:9, color:'var(--gold)' }}>🎯 {(latest as any).inducement}</div>
                    )}
                    {(latest as any).killZone && (
                      <div style={{ fontSize:9, color:'var(--text-secondary)' }}>🕐 {(latest as any).killZone}</div>
                    )}
                    {/* ADX */}
                    {(latest as any).adx && (
                      <div style={{ fontSize:9, color: (latest as any).adx.isStrong ? ((latest as any).adx.trend?.includes('bullish') ? 'var(--buy)' : 'var(--sell)') : 'var(--text-muted)' }}>
                        📶 ADX {(latest as any).adx.adx} — {(latest as any).adx.isStrong ? 'tendance forte' : 'sans tendance / chop'}
                      </div>
                    )}
                    {/* Fibonacci */}
                    {(latest as any).fibonacci && (
                      <div style={{ fontSize:9, color: (latest as any).fibonacci.inOTE ? 'var(--gold)' : 'var(--text-muted)' }}>
                        🌀 Fibonacci {(latest as any).fibonacci.direction === 'upswing' ? '↑' : '↓'}
                        {(latest as any).fibonacci.inOTE ? ' — Zone OTE 61.8-78.6% ✅' : (latest as any).fibonacci.nearFib ? ` — près ${(latest as any).fibonacci.nearestLevel?.label}` : ''}
                      </div>
                    )}
                    {/* Régime */}
                    {(latest as any).regime && (
                      <div style={{ fontSize:9, color: (latest as any).regime.regime === 'compression' ? 'var(--gold)' : (latest as any).regime.regime === 'expansion' ? 'var(--buy)' : 'var(--text-muted)' }}>
                        ⚡ {(latest as any).regime.description || (latest as any).regime.regime?.toUpperCase()}
                      </div>
                    )}
                    {/* MSS */}
                    {(latest as any).mss && (
                      <div style={{ fontSize:9, color: (latest as any).mss.type === 'bullish' ? 'var(--buy)' : 'var(--sell)', fontWeight:700 }}>
                        🏛️ MSS {(latest as any).mss.type?.toUpperCase()} confirmé @ {(latest as any).mss.level?.toFixed(2)}
                      </div>
                    )}
                    {/* Premium/Discount */}
                    {(latest as any).premiumDiscount && (
                      <div style={{ fontSize:9, color: (latest as any).premiumDiscount.zone === 'discount' ? 'var(--buy)' : (latest as any).premiumDiscount.zone === 'premium' ? 'var(--sell)' : 'var(--text-muted)' }}>
                        💎 Zone {(latest as any).premiumDiscount.zone?.toUpperCase()} — {(latest as any).premiumDiscount.pct}% du range 50 périodes
                      </div>
                    )}
                    {/* Structure M1 */}
                    {(latest as any).marketStructure?.m1 && (
                      <div style={{ fontSize:9, color: (latest as any).marketStructure.m1.trend === 'bullish' ? 'var(--buy)' : (latest as any).marketStructure.m1.trend === 'bearish' ? 'var(--sell)' : 'var(--text-muted)' }}>
                        🏛️ Structure M1: {(latest as any).marketStructure.m1.trend === 'bullish'
                          ? `HH×${(latest as any).marketStructure.m1.hhCount} HL×${(latest as any).marketStructure.m1.hlCount}`
                          : (latest as any).marketStructure.m1.trend === 'bearish'
                          ? `LL×${(latest as any).marketStructure.m1.llCount} LH×${(latest as any).marketStructure.m1.lhCount}`
                          : 'Range — pas de tendance claire'}
                      </div>
                    )}
                    {/* Next Kill Zone */}
                    {(latest as any).nextKillZone && (
                      <div style={{ fontSize:9, color:'var(--gold)' }}>
                        ⏰ Prochaine session: {(latest as any).nextKillZone.name} dans {(latest as any).nextKillZone.hoursLeft}h
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {latest.timeframesBias && (
              <div style={{ display:'flex', gap:4, marginTop:6 }}>
                {Object.entries(latest.timeframesBias).map(([tf, bias]) => (
                  <div key={tf} className="pill" style={{ background: bias==='bull'?'var(--buy-dim)':bias==='bear'?'var(--sell-dim)':'var(--glass-03)', borderColor: bias==='bull'?'var(--border-buy)':bias==='bear'?'var(--border-sell)':'var(--border)', color: bias==='bull'?'var(--buy)':bias==='bear'?'var(--sell)':'var(--text-muted)' }}>
                    {tf} {bias==='bull'?'↑':bias==='bear'?'↓':'—'}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-muted)', fontSize:11 }}>
            <div style={{ fontSize:28, marginBottom:8, opacity:0.4 }}>⚡</div>
            Génère ton premier signal IA
          </div>
        )}

        {/* TF Mode selector */}
        <div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:6, letterSpacing:'0.1em' }}>MODE DE SIGNAL</div>
          <div style={{ display:'flex', gap:5 }}>
            {TF_MODES.map(m => {
              const active = tfMode === m.key;
              return (
                <button key={m.key} className="btn btn-sm" title={m.desc} onClick={() => setTfMode(m.key as TFMode)}
                  style={{ flex:1, justifyContent:'center', borderColor: active ? m.color+'55' : 'var(--border)', color: active ? m.color : 'var(--text-dim)', background: active ? m.color+'12' : 'transparent', fontSize:9, fontWeight: active ? 800 : 600 }}>
                  {m.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize:8, color:'var(--text-muted)', marginTop:4 }}>{TF_MODES.find(m => m.key === tfMode)?.desc}</div>
        </div>

        {/* Generate + Auto-refresh */}
        <div style={{ display:'flex', gap:5 }}>
          <button className={`btn ${isGenerating ? '' : 'btn-gold'}`} style={{ flex:1, justifyContent:'center', gap:6, fontWeight:800, letterSpacing:'0.06em', fontSize:11, padding:'10px 14px' }} onClick={generate} disabled={isGenerating}>
            {isGenerating ? <><span className="spinner spinner-sm" />ANALYSE...</> : <><span>⚡</span>GÉNÉRER</>}
          </button>
          <button className="btn btn-sm" title="Refresh maintenant" onClick={generate} disabled={isGenerating} style={{ width:36, padding:0, justifyContent:'center', borderColor:'var(--border)', fontSize:14 }}>🔄</button>
          <select value={autoRefresh} onChange={e => setAutoRefresh(Number(e.target.value))} style={{ background:'var(--glass-03)', border:'1px solid var(--border)', borderRadius:'var(--r-sm)', color: autoRefresh > 0 ? 'var(--gold)' : 'var(--text-muted)', fontSize:9, padding:'0 6px', cursor:'pointer', fontFamily:'Space Mono,monospace', outline:'none', width:52 }}>
            {AUTO_REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {autoRefresh > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1, height:2, background:'rgba(255,255,255,0.07)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:2, background:'var(--gold)', width:`${(countdown / autoRefresh) * 100}%`, transition:'width 1s linear', boxShadow:'0 0 6px var(--gold)' }} />
            </div>
            <span style={{ fontSize:8, color:'var(--gold)', fontFamily:'Space Mono,monospace', flexShrink:0 }}>{countdown}s</span>
          </div>
        )}

        {error && (
          <div style={{ fontSize:9, color:'var(--sell)', padding:'6px 10px', background:'var(--sell-dim)', borderRadius:'var(--r-sm)', border:'1px solid var(--border-sell)' }}>
            ⚠️ {error}
          </div>
        )}
      </div>
    </div>
  );
}