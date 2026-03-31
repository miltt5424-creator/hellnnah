import React, { useMemo } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { useMarketStore }  from '../../store/marketStore';

function IndicatorRow({ label, value, color='var(--text-secondary)', mono=true, sublabel='', badge }: { label:string; value:any; color?:string; mono?:boolean; sublabel?:string; badge?:string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid var(--border-sm)' }}>
      <div>
        <span style={{ fontSize:9, color:'var(--text-muted)' }}>{label}</span>
        {sublabel && <span style={{ fontSize:8, color:'var(--text-muted)', marginLeft:4 }}>{sublabel}</span>}
      </div>
      <span style={{ fontFamily: mono?'Space Mono,monospace':undefined, fontSize:10, fontWeight:600, color }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function IndicatorsPanel() {
  const latestRaw = useSignalStore((s) => s.signals[0]);
  const ind = (latestRaw as any)?.indicators || (latestRaw as any)?.indicatorData || {};

  const rsi = ind.rsi ?? null;
  const rsiColor = rsi ? rsi < 30 ? 'var(--buy)' : rsi > 70 ? 'var(--sell)' : 'var(--text-secondary)' : 'var(--text-muted)';
  const macdH = ind.macdHistogram ?? null;
  const adx = ind.adx?.adx ?? null;
  const adxColor = adx ? adx > 50 ? 'var(--buy)' : adx > 25 ? 'var(--gold)' : 'var(--text-muted)' : 'var(--text-muted)';
  // Nouveaux indicateurs v4 — depuis strategy object
  const latest = latestRaw;
  const strat  = (latest as any)?.strategy || {};
  const ichimoku   = strat.ichimoku   || null;
  const supertrend = strat.supertrend || null;
  const divergence = strat.divergence || null;
  const fibonacci  = strat.fibonacci  || null;
  const regime     = strat.regime     || null;
  const adxFull    = strat.adx        || null;
  const ms         = strat.marketStructure?.m1 || null;
  const msH1       = strat.marketStructure?.h1 || null;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🔬 INDICATORS</span>
      </div>
      <div className="panel-body" style={{ display:'flex', flexDirection:'column', gap:0 }}>
        <IndicatorRow label="RSI (14)" value={rsi ? rsi.toFixed(1) : null} color={rsiColor} />
        <IndicatorRow label="MACD Line" value={ind.macdLine?.toFixed(4)} />
        <IndicatorRow label="MACD Signal" value={ind.macdSignal?.toFixed(4)} />
        <IndicatorRow label="MACD Hist" value={macdH?.toFixed(4)} color={macdH > 0 ? 'var(--buy)' : 'var(--sell)'} />
        <IndicatorRow label="ATR (14)" value={ind.atr?.toFixed(2)} color="var(--gold)" />
        <IndicatorRow label="BB Upper" value={ind.bbUpper?.toFixed(2)} color="var(--sell)" />
        <IndicatorRow label="BB Middle" value={ind.bbMiddle?.toFixed(2)} />
        <IndicatorRow label="BB Lower" value={ind.bbLower?.toFixed(2)} color="var(--buy)" />
        <IndicatorRow label="EMA 9" value={ind.ema9?.toFixed(2)} />
        <IndicatorRow label="EMA 21" value={ind.ema21?.toFixed(2)} />
        <IndicatorRow label="EMA 50" value={ind.ema50?.toFixed(2)} />
        <IndicatorRow label="EMA 200"
          value={ind.ema200 != null ? ind.ema200.toFixed(2) : '—'}
          color={(() => {
            if (!ind.ema200 || !price) return 'var(--text-dim)';
            return price > ind.ema200 ? 'var(--buy)' : 'var(--sell)';
          })()}
          badge={(() => {
            if (!ind.ema200 || !price) return undefined;
            return price > ind.ema200 ? '▲ DESSUS' : '▼ DESSOUS';
          })()}
        />

        <IndicatorRow
          label="StochRSI K"
          value={ind.stochRsi?.k?.toFixed(1)}
          color={ind.stochRsi?.k < 20 ? 'var(--buy)' : ind.stochRsi?.k > 80 ? 'var(--sell)' : 'var(--text-secondary)'}
          sublabel={ind.stochRsi?.signal}
        />
        <IndicatorRow label="StochRSI D" value={ind.stochRsi?.d?.toFixed(1)} />
        <IndicatorRow
          label="VWAP"
          value={ind.vwap?.toFixed(2)}
          color="var(--gold)"
          sublabel={ind.vwap && ind.ema9 ? (ind.ema9 > ind.vwap ? '↑ ABOVE' : '↓ BELOW') : ''}
        />
        <IndicatorRow
          label="RSI Divergence"
          value={ind.rsiDivergence?.signal ?? 'NONE'}
          color={ind.rsiDivergence?.signal === 'BULLISH' ? 'var(--buy)' : ind.rsiDivergence?.signal === 'BEARISH' ? 'var(--sell)' : 'var(--text-muted)'}
          mono={false}
        />
        <IndicatorRow
          label="OBV Trend"
          value={ind.obv?.trend ?? '—'}
          color={ind.obv?.trend === 'UP' ? 'var(--buy)' : ind.obv?.trend === 'DOWN' ? 'var(--sell)' : 'var(--text-muted)'}
          mono={false}
        />
        <IndicatorRow
          label="CVD"
          value={ind.cvd?.trend ?? '—'}
          color={ind.cvd?.trend === 'UP' ? 'var(--buy)' : ind.cvd?.trend === 'DOWN' ? 'var(--sell)' : 'var(--text-muted)'}
          mono={false}
        />
        <IndicatorRow
          label="Vol. Profile POC"
          value={ind.volumeProfile?.poc?.toFixed(2)}
          color="var(--gold)"
          sublabel={ind.volumeProfile?.skew}
        />
        <IndicatorRow label="ADX" value={adx?.toFixed(1)} color={adxColor} sublabel={ind.adx?.trendStrength} />
        <IndicatorRow label="Williams %R"
          value={ind.williamsR != null ? `${ind.williamsR.toFixed(1)}` : '—'}
          color={ind.williamsR != null ? (ind.williamsR <= -80 ? 'var(--buy)' : ind.williamsR >= -20 ? 'var(--sell)' : 'var(--text-dim)') : 'var(--text-muted)'}
          badge={ind.williamsR != null ? (ind.williamsR <= -80 ? 'SURVENTE' : ind.williamsR >= -20 ? 'SURACHAT' : undefined) : undefined}
        />
        <IndicatorRow label="CCI (20)"
          value={ind.cci != null ? ind.cci.toFixed(1) : '—'}
          color={ind.cci != null ? (ind.cci > 100 ? 'var(--buy)' : ind.cci < -100 ? 'var(--sell)' : 'var(--text-dim)') : 'var(--text-muted)'}
          badge={ind.cci != null ? (ind.cci > 200 ? '🔥 FORT' : ind.cci < -200 ? '🔥 FORT' : undefined) : undefined}
        />
        <IndicatorRow label="MFI (14)"
          value={ind.mfi != null ? ind.mfi.toFixed(1) : '—'}
          color={ind.mfi != null ? (ind.mfi < 20 ? 'var(--buy)' : ind.mfi > 80 ? 'var(--sell)' : 'var(--text-dim)') : 'var(--text-muted)'}
          badge={ind.mfi != null ? (ind.mfi < 20 ? 'SURVENTE' : ind.mfi > 80 ? 'SURACHAT' : undefined) : undefined}
        />
        <IndicatorRow label="Supertrend" value={ind.supertrend?.signal} color={ind.supertrend?.signal==='BUY'?'var(--buy)':'var(--sell)'} mono={false} />
        <IndicatorRow label="BB Squeeze" value={ind.bbSqueeze?.state} color={ind.bbSqueeze?.isSqueezing?'var(--gold)':'var(--text-muted)'} mono={false} />

        {/* Séparateur */}
        <div style={{ height:1, background:'var(--border)', margin:'6px 0' }} />
        <div style={{ fontSize:9, color:'var(--text-muted)', padding:'4px 0', letterSpacing:'0.1em', fontWeight:700 }}>— INDICATEURS AVANCÉS V4 —</div>

        {/* Ichimoku */}
        <IndicatorRow label="☁️ Ichimoku Bias"
          value={ichimoku ? (ichimoku.aboveCloud ? '↑ AU-DESSUS' : ichimoku.belowCloud ? '↓ EN-DESSOUS' : 'DANS NUAGE') : null}
          color={ichimoku?.bias==='bullish'?'var(--buy)':ichimoku?.bias==='bearish'?'var(--sell)':'var(--text-muted)'}
          mono={false} />
        <IndicatorRow label="☁️ TK Cross"
          value={ichimoku?.tkCross || (ichimoku ? 'aucun' : null)}
          color={ichimoku?.tkCross==='bullish'?'var(--buy)':ichimoku?.tkCross==='bearish'?'var(--sell)':'var(--text-muted)'}
          mono={false} />

        {/* SuperTrend */}
        <IndicatorRow label="📈 SuperTrend"
          value={supertrend ? supertrend.direction?.toUpperCase() + (supertrend.crossed ? ' 🔔' : '') : null}
          color={supertrend?.direction==='bullish'?'var(--buy)':'var(--sell)'}
          mono={false} />
        <IndicatorRow label="📈 ST SL Level"
          value={supertrend?.slLevel}
          color="var(--gold)" />

        {/* ADX complet */}
        <IndicatorRow label="📶 ADX +DI"
          value={adxFull ? `${adxFull.adx} (+${adxFull.pdi} / -${adxFull.mdi})` : null}
          color={adxColor} mono={true} />

        {/* Fibonacci */}
        <IndicatorRow label="🌀 Fibonacci"
          value={fibonacci ? (fibonacci.inOTE ? 'ZONE OTE 61.8-78.6%' : fibonacci.nearFib ? `Near ${fibonacci.nearestLevel?.label}` : fibonacci.direction) : null}
          color={fibonacci?.inOTE ? 'var(--gold)' : 'var(--text-secondary)'}
          mono={false} />

        {/* Divergence RSI */}
        <IndicatorRow label="📊 RSI Divergence"
          value={divergence?.type?.replace('_',' ').toUpperCase() || 'NONE'}
          color={divergence?.type?.includes('bullish')?'var(--buy)':divergence?.type?.includes('bearish')?'var(--sell)':'var(--text-muted)'}
          mono={false} />

        {/* Régime */}
        <IndicatorRow label="⚡ Régime Marché"
          value={regime?.regime?.toUpperCase() || null}
          color={regime?.regime==='compression'?'var(--gold)':regime?.regime==='expansion'?'var(--buy)':'var(--text-secondary)'}
          mono={false} />

        {/* Structure M1 */}
        <IndicatorRow label="🏛️ Structure M1"
          value={ms ? (ms.trend==='bullish' ? `HH×${ms.hhCount} HL×${ms.hlCount}` : ms.trend==='bearish' ? `LL×${ms.llCount} LH×${ms.lhCount}` : 'RANGE') : null}
          color={ms?.trend==='bullish'?'var(--buy)':ms?.trend==='bearish'?'var(--sell)':'var(--text-muted)'}
          mono={false} />

        {/* Structure H1 */}
        <IndicatorRow label="🏛️ Structure H1"
          value={msH1 ? (msH1.trend==='bullish' ? `HH×${msH1.hhCount} HL×${msH1.hlCount}` : msH1.trend==='bearish' ? `LL×${msH1.llCount} LH×${msH1.lhCount}` : 'RANGE') : null}
          color={msH1?.trend==='bullish'?'var(--buy)':msH1?.trend==='bearish'?'var(--sell)':'var(--text-muted)'}
          mono={false} />

      </div>
    </div>
  );
}