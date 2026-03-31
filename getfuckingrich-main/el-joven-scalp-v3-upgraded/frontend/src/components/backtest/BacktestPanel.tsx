import React, { useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatPrice } from '../../utils/priceFormat';

const SYMBOLS  = ['BTC/USD','ETH/USD','XAU/USD','EUR/USD','GBP/USD','NAS100/USD','SPX500/USD'];
const TF_OPTIONS = [
  { label:'1min', value:'1min' }, { label:'5min', value:'5min' },
  { label:'15min',value:'15min'},{ label:'1h',   value:'1h'   },
  { label:'4h',   value:'4h'   },{ label:'1D',   value:'1d'   },
];
const BARS_OPTIONS = [100, 200, 300, 500];

interface Scenario {
  name: string; probability: number; color: string;
  condition: string; targets: { label:string; price:number; distPct:number }[];
  invalidation: string;
}
interface Level { price: number; touches: number; distATR: number; isRound?: boolean; }
interface AnalysisResult {
  symbol: string; timeframe: string; bars: number; livePrice: number; dataSource: string;
  structure: { trend:string; strength:string; description:string };
  regime: { regime:string; volatility:string; bbWidth:number; atrRatio:number; description:string };
  levels: { supports:Level[]; resistances:Level[]; nearestSupport:Level|null; nearestResistance:Level|null };
  indicators: { rsi:number; atr:number; ema9:number; ema21:number; ema50:number|null; macdLine:number; macdHistogram:number; bbUpper:number; bbMiddle:number; bbLower:number; stochK:number|null; stochSignal:string|null; vwap:number|null; obvTrend:string|null; poc:number|null; pocSkew:string|null };
  ichimoku: any; supertrend: any; divergence: any; rejection: any[];
  scenarios: Scenario[]; dominant: string; momentum: number;
  summary: string[];
}

const TREND_COLOR: Record<string,string> = { bullish:'var(--buy)', bearish:'var(--sell)', range:'var(--gold)', undetermined:'var(--text-muted)' };
const REGIME_ICON: Record<string,string> = { trending:'🎯', range:'📊', compression:'⚡', expansion:'📈' };

function MomentumBar({ value }: { value: number }) {
  const pct  = (value + 100) / 2;
  const color = value > 20 ? 'var(--buy)' : value < -20 ? 'var(--sell)' : 'var(--gold)';
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:9, color:'var(--text-muted)' }}>MOMENTUM GLOBAL</span>
        <span style={{ fontSize:10, fontFamily:'Space Mono,monospace', fontWeight:700, color }}>
          {value > 0 ? '+' : ''}{value}
        </span>
      </div>
      <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', left:'50%', top:0, height:'100%', width:1, background:'rgba(255,255,255,0.2)' }} />
        <div style={{
          height:'100%', width:`${Math.abs(value) / 2}%`,
          background: color,
          borderRadius:3, boxShadow:`0 0 6px ${color}`,
          position:'absolute',
          left: value > 0 ? '50%' : `calc(50% - ${Math.abs(value) / 2}%)`,
        }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:2, fontSize:8, color:'var(--text-muted)' }}>
        <span>BEAR -100</span><span>NEUTRE</span><span>+100 BULL</span>
      </div>
    </div>
  );
}

function LevelRow({ level, type }: { level: Level; type: 'support'|'resistance' }) {
  const color = type === 'support' ? 'var(--buy)' : 'var(--sell)';
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 8px', borderRadius:6, background:'rgba(255,255,255,0.02)', marginBottom:3, border:`1px solid ${color}18` }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {level.isRound && <span style={{ fontSize:7, background:'rgba(212,175,55,0.2)', color:'var(--gold)', padding:'1px 4px', borderRadius:3 }}>ROUND</span>}
        <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, fontWeight:700, color }}>{level.price}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:8, color:'var(--text-muted)' }}>{level.touches}x testé</span>
        <span style={{ fontSize:8, color:'var(--text-dim)' }}>{level.distATR} ATR</span>
      </div>
    </div>
  );
}

export default function BacktestPanel() {
  const isMobile = useIsMobile();
  const [form, setForm]     = useState({ symbol:'BTC/USD', timeframe:'1h', bars:200 });
  const [result, setResult] = useState<AnalysisResult|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string|null>(null);
  const [tab, setTab]       = useState<'overview'|'levels'|'indicators'|'scenarios'>('overview');

  const run = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/backtest', {
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify(form),
      });
      if (res.status === 401) { setError('Session expirée — reconnectez-vous'); return; }
      const d = await res.json();
      if (d.success) { setResult(d); setTab('overview'); }
      else setError(d.error || 'Erreur analyse');
    } catch(e) { setError(e instanceof Error ? e.message : 'Erreur réseau'); }
    finally { setLoading(false); }
  };

  const selectStyle: React.CSSProperties = {
    width:'100%', padding: isMobile ? '11px 10px' : '7px 10px',
    background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:8, color:'#f5f0e8', fontSize: isMobile ? 13 : 11, outline:'none',
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🔭 ANALYSE DU MARCHÉ</span>
        {result && (
          <span style={{ fontSize:9, color: result.dominant === 'bullish' ? 'var(--buy)' : 'var(--sell)', fontFamily:'Space Mono,monospace' }}>
            {result.dominant === 'bullish' ? '↑ HAUSSIER' : '↓ BAISSIER'}
          </span>
        )}
      </div>

      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>

        {/* Config */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:4 }}>SYMBOLE</div>
            <select style={selectStyle} value={form.symbol} onChange={e => setForm(f => ({...f, symbol:e.target.value}))}>
              {SYMBOLS.map(s => <option key={s} value={s} style={{background:'#0a0806'}}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:4 }}>TIMEFRAME</div>
            <select style={selectStyle} value={form.timeframe} onChange={e => setForm(f => ({...f, timeframe:e.target.value}))}>
              {TF_OPTIONS.map(t => <option key={t.value} value={t.value} style={{background:'#0a0806'}}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:5 }}>BOUGIES ANALYSÉES</div>
          <div style={{ display:'flex', gap:4 }}>
            {BARS_OPTIONS.map(b => (
              <button key={b} onClick={() => setForm(f => ({...f, bars:b}))} style={{
                flex:1, padding:'5px 0', fontSize:10, border:'1px solid', cursor:'pointer', borderRadius:6,
                borderColor: form.bars === b ? 'var(--gold)' : 'var(--border)',
                color:       form.bars === b ? 'var(--gold)' : 'var(--text-muted)',
                background:  form.bars === b ? 'rgba(212,175,55,0.1)' : 'transparent',
              }}>{b}</button>
            ))}
          </div>
        </div>

        <button className={`btn ${loading ? '' : 'btn-gold'}`} style={{ width:'100%', justifyContent:'center', padding:'10px', fontWeight:800, fontSize:11, letterSpacing:'0.05em' }} onClick={run} disabled={loading}>
          {loading ? <><span className="spinner spinner-sm" />ANALYSE EN COURS...</> : <>🔭 ANALYSER LE MARCHÉ</>}
        </button>

        {error && <div style={{ fontSize:10, color:'var(--sell)', padding:'6px 10px', background:'var(--sell-dim)', borderRadius:6 }}>⚠️ {error}</div>}

        {result && (
          <div className="anim-fade-in">

            {/* Tabs */}
            <div style={{ display:'flex', gap:3, marginBottom:10 }}>
              {(['overview','levels','indicators','scenarios'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex:1, padding:'5px 4px', fontSize:9, border:'1px solid', cursor:'pointer', borderRadius:6, fontWeight:600,
                  borderColor: tab === t ? 'var(--gold)55' : 'var(--border)',
                  color:       tab === t ? 'var(--gold)'   : 'var(--text-dim)',
                  background:  tab === t ? 'rgba(212,175,55,0.1)' : 'transparent',
                  textTransform:'uppercase', letterSpacing:'0.05em',
                }}>{t === 'overview' ? '📊' : t === 'levels' ? '📍' : t === 'indicators' ? '📈' : '🎯'} {t}</button>
              ))}
            </div>

            {/* ── OVERVIEW TAB ── */}
            {tab === 'overview' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>

                {/* Prix + source */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:'rgba(255,255,255,0.03)', borderRadius:8, border:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:8, color:'var(--text-muted)' }}>{result.symbol} · {result.timeframe} · {result.bars} bougies</div>
                    <div style={{ fontSize:16, fontWeight:800, fontFamily:'Space Mono,monospace', color:'var(--text-primary)' }}>{result.livePrice}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:8, color:'var(--text-muted)' }}>SOURCE</div>
                    <div style={{ fontSize:9, color: result.dataSource === 'binance' ? 'var(--buy)' : 'var(--gold)', fontFamily:'Space Mono,monospace' }}>{result.dataSource?.toUpperCase()}</div>
                  </div>
                </div>

                {/* Momentum */}
                <MomentumBar value={result.momentum} />

                {/* Structure + Régime */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <div style={{ padding:'8px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:`1px solid ${TREND_COLOR[result.structure.trend]}30` }}>
                    <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>STRUCTURE</div>
                    <div style={{ fontSize:11, fontWeight:800, color: TREND_COLOR[result.structure.trend], marginBottom:3 }}>
                      {result.structure.trend.toUpperCase()}
                    </div>
                    <div style={{ fontSize:8, color:'var(--text-muted)' }}>{result.structure.strength}</div>
                  </div>
                  <div style={{ padding:'8px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                    <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>RÉGIME</div>
                    <div style={{ fontSize:11, fontWeight:800, color:'var(--gold)', marginBottom:3 }}>
                      {REGIME_ICON[result.regime.regime]} {result.regime.regime.toUpperCase()}
                    </div>
                    <div style={{ fontSize:8, color:'var(--text-muted)' }}>Vol: {result.regime.volatility}</div>
                  </div>
                </div>

                {/* Ichimoku + SuperTrend */}
                {(result.ichimoku || result.supertrend) && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {result.ichimoku && (
                      <div style={{ padding:'8px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                        <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>☁️ ICHIMOKU</div>
                        <div style={{ fontSize:10, fontWeight:700, color: result.ichimoku.bias === 'bullish' ? 'var(--buy)' : result.ichimoku.bias === 'bearish' ? 'var(--sell)' : 'var(--gold)' }}>
                          {result.ichimoku.aboveCloud ? '↑ AU-DESSUS' : result.ichimoku.belowCloud ? '↓ EN-DESSOUS' : '⚡ DANS LE NUAGE'}
                        </div>
                        {result.ichimoku.tkCross && <div style={{ fontSize:8, color:'var(--gold)', marginTop:2 }}>TK Cross {result.ichimoku.tkCross}</div>}
                      </div>
                    )}
                    {result.supertrend && (
                      <div style={{ padding:'8px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                        <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:4 }}>📈 SUPERTREND</div>
                        <div style={{ fontSize:10, fontWeight:700, color: result.supertrend.direction === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>
                          {result.supertrend.direction.toUpperCase()} {result.supertrend.crossed && '🔔'}
                        </div>
                        <div style={{ fontSize:8, color:'var(--text-dim)', marginTop:2, fontFamily:'Space Mono,monospace' }}>SL: {result.supertrend.slLevel}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Divergence + Rejection */}
                {(result.divergence?.rsi || (result.rejection && result.rejection.length > 0)) && (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {result.divergence?.rsi && (
                      <div style={{ padding:'7px 10px', borderRadius:8, background: result.divergence.rsi.type?.includes('bullish') ? 'rgba(0,230,118,0.08)' : 'rgba(255,51,85,0.08)', border:`1px solid ${result.divergence.rsi.type?.includes('bullish') ? 'rgba(0,230,118,0.3)' : 'rgba(255,51,85,0.3)'}` }}>
                        <div style={{ fontSize:9, fontWeight:700, color: result.divergence.rsi.type?.includes('bullish') ? 'var(--buy)' : 'var(--sell)' }}>
                          📊 {result.divergence.rsi.desc}
                        </div>
                      </div>
                    )}
                    {result.rejection?.map((r: any, i: number) => (
                      <div key={i} style={{ padding:'6px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', fontSize:9, color: r.signal === 'BUY' ? 'var(--buy)' : r.signal === 'SELL' ? 'var(--sell)' : 'var(--text-muted)' }}>
                        🕯️ {r.desc}
                      </div>
                    ))}
                  </div>
                )}

                {/* Synthèse */}
                <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.03)', borderRadius:8, border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:6, letterSpacing:'0.1em' }}>SYNTHÈSE TECHNIQUE</div>
                  {result.summary.map((line, i) => line ? (
                    <div key={i} style={{ fontSize:10, color:'var(--text-secondary)', lineHeight:1.7 }}>{line}</div>
                  ) : <div key={i} style={{ height:6 }} />)}
                </div>
              </div>
            )}

            {/* ── LEVELS TAB ── */}
            {tab === 'levels' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.1em' }}>RÉSISTANCES (vendre / TP pour BUY)</div>
                {result.levels.resistances.map((l, i) => <LevelRow key={i} level={l} type="resistance" />)}
                <div style={{ height:1, background:'var(--border)', margin:'4px 0' }} />
                <div style={{ textAlign:'center', padding:'6px', background:'rgba(255,255,255,0.05)', borderRadius:6, fontFamily:'Space Mono,monospace', fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>
                  PRIX ACTUEL : {result.livePrice}
                </div>
                <div style={{ height:1, background:'var(--border)', margin:'4px 0' }} />
                <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.1em' }}>SUPPORTS (acheter / TP pour SELL)</div>
                {result.levels.supports.map((l, i) => <LevelRow key={i} level={l} type="support" />)}
                {result.indicators.poc && (
                  <div style={{ padding:'7px 10px', borderRadius:8, background:'rgba(212,175,55,0.08)', border:'1px solid rgba(212,175,55,0.3)', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:9, color:'var(--gold)' }}>⚖️ POC (Volume institutionnel)</span>
                    <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, fontWeight:700, color:'var(--gold)' }}>{result.indicators.poc}</span>
                  </div>
                )}
                {result.indicators.vwap && (
                  <div style={{ padding:'7px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:9, color:'var(--text-muted)' }}>📊 VWAP</span>
                    <span style={{ fontFamily:'Space Mono,monospace', fontSize:10, fontWeight:700, color:'var(--text-secondary)' }}>{result.indicators.vwap}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── INDICATORS TAB ── */}
            {tab === 'indicators' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {[
                  { label:'RSI 14', value: result.indicators.rsi, color: result.indicators.rsi < 30 ? 'var(--buy)' : result.indicators.rsi > 70 ? 'var(--sell)' : 'var(--text-primary)', suffix:'', note: result.indicators.rsi < 30 ? 'SURVENDU' : result.indicators.rsi > 70 ? 'SURACHETE' : '' },
                  { label:'MACD Hist', value: result.indicators.macdHistogram, color: result.indicators.macdHistogram > 0 ? 'var(--buy)' : 'var(--sell)', suffix:'', note: result.indicators.macdHistogram > 0 ? '↑ momentum' : '↓ momentum' },
                  { label:'EMA 9', value: result.indicators.ema9, color:'var(--text-primary)', suffix:'', note:'' },
                  { label:'EMA 21', value: result.indicators.ema21, color:'var(--text-primary)', suffix:'', note:'' },
                  { label:'EMA 50', value: result.indicators.ema50 ?? 'N/A', color: result.indicators.ema50 && result.livePrice > result.indicators.ema50 ? 'var(--buy)' : 'var(--sell)', suffix:'', note: result.indicators.ema50 ? (result.livePrice > result.indicators.ema50 ? 'au-dessus' : 'en-dessous') : '' },
                  { label:'StochRSI K', value: result.indicators.stochK ?? 'N/A', color: result.indicators.stochSignal === 'BULLISH' ? 'var(--buy)' : result.indicators.stochSignal === 'BEARISH' ? 'var(--sell)' : 'var(--text-primary)', suffix:'', note: result.indicators.stochSignal ?? '' },
                  { label:'OBV', value: result.indicators.obvTrend ?? 'N/A', color: result.indicators.obvTrend === 'UP' ? 'var(--buy)' : 'var(--sell)', suffix:'', note:'' },
                  { label:'POC Skew', value: result.indicators.pocSkew ?? 'N/A', color: result.indicators.pocSkew === 'BUY' ? 'var(--buy)' : result.indicators.pocSkew === 'SELL' ? 'var(--sell)' : 'var(--text-muted)', suffix:'', note:'' },
                ].map(({ label, value, color, note }) => (
                  <div key={label} style={{ padding:'8px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', textAlign:'center' }}>
                    <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:11, fontWeight:700, fontFamily:'Space Mono,monospace', color }}>{typeof value === 'number' ? (Math.abs(value) < 0.001 ? value.toExponential(2) : value) : value}</div>
                    {note && <div style={{ fontSize:7, color, marginTop:2, opacity:0.8 }}>{note}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* ── SCENARIOS TAB ── */}
            {tab === 'scenarios' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {result.scenarios.map((sc, i) => (
                  <div key={i} style={{ padding:'10px', borderRadius:10, background: sc.color === 'buy' ? 'rgba(0,230,118,0.07)' : 'rgba(255,51,85,0.07)', border:`1px solid ${sc.color === 'buy' ? 'rgba(0,230,118,0.3)' : 'rgba(255,51,85,0.3)'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:11, fontWeight:800, color: sc.color === 'buy' ? 'var(--buy)' : 'var(--sell)' }}>{sc.name}</span>
                      <span style={{ fontFamily:'Space Mono,monospace', fontSize:13, fontWeight:900, color: sc.color === 'buy' ? 'var(--buy)' : 'var(--sell)' }}>{sc.probability}%</span>
                    </div>
                    {/* Probability bar */}
                    <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, marginBottom:8, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${sc.probability}%`, background: sc.color === 'buy' ? 'var(--buy)' : 'var(--sell)', borderRadius:2, transition:'width 0.8s ease' }} />
                    </div>
                    <div style={{ fontSize:9, color:'var(--text-secondary)', marginBottom:6, lineHeight:1.5 }}>{sc.condition}</div>
                    {/* Targets */}
                    <div style={{ display:'flex', gap:4, marginBottom:6 }}>
                      {sc.targets.map((t, j) => (
                        <div key={j} style={{ flex:1, padding:'5px 6px', background:'rgba(255,255,255,0.05)', borderRadius:6, textAlign:'center' }}>
                          <div style={{ fontSize:8, color:'var(--text-muted)', marginBottom:2 }}>{t.label}</div>
                          <div style={{ fontFamily:'Space Mono,monospace', fontSize:9, fontWeight:700, color: sc.color === 'buy' ? 'var(--buy)' : 'var(--sell)' }}>{t.price}</div>
                          <div style={{ fontSize:7, color:'var(--text-muted)' }}>{t.distPct > 0 ? '+' : ''}{t.distPct}%</div>
                        </div>
                      ))}
                    </div>
                    {/* Invalidation */}
                    <div style={{ fontSize:8, color:'var(--text-muted)', padding:'4px 6px', background:'rgba(255,255,255,0.03)', borderRadius:4 }}>
                      ❌ Invalidation : {sc.invalidation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}