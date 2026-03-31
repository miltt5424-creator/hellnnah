import React, { useEffect, useState } from 'react';
import { useJournalStore } from '../store/journalStore';
import { computeStats } from '../utils/journalStats';
import { formatPnl } from '../utils/priceFormat';
import type { Trade } from '../types/journal';

export default function JournalPage() {
  const trades    = useJournalStore((s) => s.trades);
  const stats     = useJournalStore((s) => s.stats);
  const setTrades = useJournalStore((s) => s.setTrades);
  const setStats  = useJournalStore((s) => s.setStats);
  const addTrade  = useJournalStore((s) => s.addTrade);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    symbol: 'XAU/USD', direction: 'BUY',
    entryPrice: '', exitPrice: '', lotSize: '0.1',
    setup: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'trades' | 'stats' | 'calendar' | 'heatmap'>('trades');

  useEffect(() => {
    fetch('/api/journal?limit=100', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setTrades(d.trades); })
      .catch(() => {});
    fetch('/api/journal/stats', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setStats(d.stats); })
      .catch(() => {});
  }, [setTrades, setStats]);

  const localStats    = computeStats(trades);
  const displayStats  = stats || localStats;

  const saveTrade = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          entryPrice: parseFloat(form.entryPrice),
          exitPrice:  form.exitPrice ? parseFloat(form.exitPrice) : undefined,
          lotSize:    parseFloat(form.lotSize),
        }),
      });
      const data = await res.json();
      if (data.success) {
        addTrade(data.trade);
        setShowForm(false);
        setForm({ symbol: 'XAU/USD', direction: 'BUY', entryPrice: '', exitPrice: '', lotSize: '0.1', setup: '', notes: '' });
        // Refresh stats
        fetch('/api/journal/stats', { credentials: 'include' })
          .then((r) => r.json())
          .then((d) => { if (d.success) setStats(d.stats); })
          .catch(() => {});
      }
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px',
    fontSize: 11,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: active ? 'var(--gold)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
    transition: 'all 0.2s',
  });

  return (
    <div style={{ padding: 16, overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Stats row principale ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {[
          { label: 'TOTAL TRADES',   value: displayStats.total,                                                    color: 'var(--gold)' },
          { label: 'WIN RATE',       value: `${(displayStats.winRate ?? 0).toFixed(1)}%`,                          color: (displayStats.winRate ?? 0) >= 50 ? 'var(--buy)' : 'var(--sell)' },
          { label: 'TOTAL P&L',      value: formatPnl(displayStats.totalPnl ?? 0),                                 color: (displayStats.totalPnl ?? 0) >= 0 ? 'var(--buy)' : 'var(--sell)' },
          { label: 'PROFIT FACTOR',  value: displayStats.profitFactor ? displayStats.profitFactor.toFixed(2) : '—', color: (displayStats.profitFactor ?? 0) >= 1.5 ? 'var(--buy)' : 'var(--text-dim)' },
          { label: 'SHARPE RATIO',   value: displayStats.sharpeRatio  ? displayStats.sharpeRatio.toFixed(2)  : '—', color: (displayStats.sharpeRatio  ?? 0) >= 1   ? 'var(--buy)' : 'var(--text-dim)' },
          { label: 'MAX DRAWDOWN',   value: displayStats.maxDrawdown  ? `$${displayStats.maxDrawdown.toFixed(0)}` : '—', color: 'var(--sell)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="panel" style={{ padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.1em' }}>{label}</div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 16, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Stats row secondaire ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'AVG WIN',      value: `+$${(displayStats.avgWin  ?? 0).toFixed(2)}`, color: 'var(--buy)' },
          { label: 'AVG LOSS',     value: `$${(displayStats.avgLoss  ?? 0).toFixed(2)}`,  color: 'var(--sell)' },
          { label: 'OPEN TRADES',  value: (displayStats as any).openTrades ?? 0,           color: 'var(--gold)' },
          { label: 'STREAK',
            value: (displayStats as any).currentStreak
              ? `${(displayStats as any).currentStreak} ${(displayStats as any).streakType === 'win' ? '🔥' : '❄️'}`
              : '—',
            color: (displayStats as any).streakType === 'win' ? 'var(--buy)' : 'var(--sell)',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="panel" style={{ padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.1em' }}>{label}</div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 14, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Header + tabs ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button style={tabStyle(activeTab === 'trades')}   onClick={() => setActiveTab('trades')}>📒 TRADES</button>
          <button style={tabStyle(activeTab === 'stats')}    onClick={() => setActiveTab('stats')}>📊 SETUP</button>
          <button style={tabStyle(activeTab === 'calendar')} onClick={() => setActiveTab('calendar')}>📅 CALENDRIER</button>
          <button style={tabStyle(activeTab === 'heatmap')}  onClick={() => setActiveTab('heatmap')}>🔥 HEATMAP</button>
        </div>
        <button className="btn btn-gold" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '✕ CANCEL' : '+ ADD TRADE'}
        </button>
      </div>

      {/* ── Formulaire ── */}
      {showForm && (
        <div className="panel" style={{ padding: 16, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
            {[
              { label: 'SYMBOL',      key: 'symbol',     type: 'text',   placeholder: 'XAU/USD' },
              { label: 'DIRECTION',   key: 'direction',  type: 'text',   placeholder: 'BUY / SELL' },
              { label: 'ENTRY PRICE', key: 'entryPrice', type: 'number', placeholder: '0.00' },
              { label: 'EXIT PRICE',  key: 'exitPrice',  type: 'number', placeholder: '(optional)' },
              { label: 'LOT SIZE',    key: 'lotSize',    type: 'number', placeholder: '0.01' },
              { label: 'SETUP',       key: 'setup',      type: 'text',   placeholder: 'SMC BOS, OB, FVG...' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, letterSpacing: '0.08em' }}>{label}</label>
                <input
                  className="input"
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ fontSize: 12, padding: '6px 8px' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, letterSpacing: '0.08em' }}>NOTES</label>
            <textarea
              className="input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Setup, reasoning, lessons learned..."
              rows={2}
              style={{ fontSize: 12, padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <button className="btn btn-gold" onClick={saveTrade} disabled={saving || !form.entryPrice}>
            {saving ? <><span className="spinner" /> SAVING...</> : '💾 SAVE TRADE'}
          </button>
        </div>
      )}

      {/* ── Tab : Trades ── */}
      {activeTab === 'trades' && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-header">
            <span className="panel-title">TRADE HISTORY</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
              {trades.length} trades
            </span>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['SYMBOL','DIR','ENTRY','EXIT','LOT','P&L','SETUP','STATUS','DATE'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontSize: 9,
                      fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em',
                      background: 'var(--bg-card)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t: Trade) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700 }}>{t.symbol}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`tag tag-${t.direction === 'BUY' ? 'buy' : 'sell'}`}>{t.direction}</span>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace' }}>{( t.entryPrice ?? t.entry ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>
                      {(t.exitPrice ?? t.exit) ? (t.exitPrice ?? t.exit)!.toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace' }}>{t.lotSize ?? t.size ?? "—"}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace', fontWeight: 700,
                      color: t.pnl === null ? 'var(--text-muted)' : (t.pnl ?? 0) >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                      {t.pnl !== null ? formatPnl(t.pnl ?? 0) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 10 }}>
                      {(t as any).setup || '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`tag ${t.status === 'open' ? 'tag-med' : t.pnl && (t.pnl ?? 0) >= 0 ? 'tag-buy' : 'tag-sell'}`}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'var(--text-muted)' }}>
                      {new Date(t.openedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {trades.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucun trade enregistré. Ajoute ton premier trade !
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab : By Setup ── */}
      {activeTab === 'stats' && (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel-header">
            <span className="panel-title">PERFORMANCE PAR SETUP</span>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['SETUP','TRADES','WINS','WIN RATE','TOTAL P&L'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontSize: 9,
                      fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em',
                      background: 'var(--bg-card)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries((displayStats as any).bySetup || {}).map(([setup, s]: [string, any]) => (
                  <tr key={setup} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--gold)' }}>{setup}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace' }}>{s.trades}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace', color: 'var(--buy)' }}>{s.wins}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace',
                      color: s.winRate >= 50 ? 'var(--buy)' : 'var(--sell)' }}>
                      {s.winRate.toFixed(1)}%
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'Space Mono, monospace', fontWeight: 700,
                      color: s.totalPnl >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                      {formatPnl(s.totalPnl)}
                    </td>
                  </tr>
                ))}
                {Object.keys((displayStats as any).bySetup || {}).length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucune donnée — ferme des trades avec un setup renseigné
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* ── Tab : Calendrier PnL ── */}
      {activeTab === 'calendar' && (() => {
        const cal: any[] = (displayStats as any).calendar || [];
        if (!cal.length) return (
          <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            Aucune donnée — ferme des trades pour voir le calendrier
          </div>
        );
        // Regrouper par mois
        const byMonth: Record<string, any[]> = {};
        cal.forEach(d => {
          const m = d.date.slice(0, 7);
          if (!byMonth[m]) byMonth[m] = [];
          byMonth[m].push(d);
        });
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(byMonth).reverse().map(([month, days]) => {
              const monthPnl = days.reduce((a: number, d: any) => a + d.pnl, 0);
              const firstDay = new Date(month + '-01').getDay();
              const daysInMonth = new Date(parseInt(month.slice(0,4)), parseInt(month.slice(5,7)), 0).getDate();
              const grid: (any | null)[] = Array(firstDay === 0 ? 6 : firstDay - 1).fill(null);
              for (let d = 1; d <= daysInMonth; d++) {
                const iso = `${month}-${String(d).padStart(2,'0')}`;
                const found = days.find((x: any) => x.date === iso);
                grid.push(found ? { ...found, day: d } : { day: d, empty: true });
              }
              return (
                <div key={month} className="panel">
                  <div className="panel-header">
                    <span className="panel-title">{new Date(month + '-15').toLocaleDateString('fr-FR', { month:'long', year:'numeric' }).toUpperCase()}</span>
                    <span style={{ fontFamily:'Space Mono,monospace', fontSize:13, fontWeight:700, color: monthPnl >= 0 ? 'var(--buy)' : 'var(--sell)' }}>
                      {monthPnl >= 0 ? '+' : ''}{monthPnl.toFixed(2)}$
                    </span>
                  </div>
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:4 }}>
                      {['L','M','M','J','V','S','D'].map((d,i) => (
                        <div key={i} style={{ textAlign:'center', fontSize:8, color:'var(--text-muted)', padding:'2px 0' }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
                      {grid.map((cell, i) => {
                        if (cell === null) return <div key={i} />;
                        if (cell.empty) return (
                          <div key={i} style={{ aspectRatio:'1', borderRadius:4, background:'rgba(255,255,255,0.02)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'var(--text-muted)' }}>{cell.day}</div>
                        );
                        const hasTrade = !cell.empty && cell.trades > 0;
                        const bg = hasTrade ? (cell.pnl >= 0 ? `rgba(0,230,118,${Math.min(0.8, 0.15 + Math.abs(cell.pnl)/20)})` : `rgba(255,51,85,${Math.min(0.8, 0.15 + Math.abs(cell.pnl)/20)})`) : 'rgba(255,255,255,0.02)';
                        const textColor = hasTrade ? (cell.pnl >= 0 ? 'var(--buy)' : 'var(--sell)') : 'var(--text-muted)';
                        return (
                          <div key={i} title={hasTrade ? `${cell.trades} trades · ${cell.pnl >= 0 ? '+' : ''}${cell.pnl.toFixed(2)}$ · WR ${((cell.wins/cell.trades)*100).toFixed(0)}%` : String(cell.day)}
                            style={{ aspectRatio:'1', borderRadius:4, background:bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:hasTrade?'pointer':'default', border:`1px solid ${hasTrade?(cell.pnl>=0?'rgba(0,230,118,0.2)':'rgba(255,51,85,0.2)'):'transparent'}` }}>
                            <span style={{ fontSize:7, color:textColor, fontWeight:hasTrade?700:400 }}>{cell.day}</span>
                            {hasTrade && <span style={{ fontSize:6, color:textColor }}>{cell.pnl >= 0 ? '+' : ''}{cell.pnl.toFixed(0)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Tab : Heatmap performance ── */}
      {activeTab === 'heatmap' && (() => {
        const closed = trades.filter((t: any) => t.status === 'closed' && t.pnl !== null);
        if (!closed.length) return (
          <div className="panel" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            Aucun trade fermé pour construire la heatmap
          </div>
        );
        // Heatmap par heure (0-23) et jour de semaine (0=Lun..6=Dim)
        const grid: Record<string, { pnl: number; trades: number; wins: number }> = {};
        const days = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
        closed.forEach((t: any) => {
          const d = new Date(t.openedAt || t.closedAt);
          const h = d.getUTCHours();
          const dow = (d.getUTCDay() + 6) % 7; // 0=Lun
          const key = `${dow}_${h}`;
          if (!grid[key]) grid[key] = { pnl: 0, trades: 0, wins: 0 };
          grid[key].pnl += t.pnl;
          grid[key].trades++;
          if (t.pnl > 0) grid[key].wins++;
        });
        const maxAbs = Math.max(...Object.values(grid).map(v => Math.abs(v.pnl)), 1);
        const hours = Array.from({ length: 24 }, (_, i) => i);
        return (
          <div className="panel">
            <div className="panel-header"><span className="panel-title">🔥 HEATMAP — PnL par heure UTC × jour</span></div>
            <div style={{ padding: '8px 12px', overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24,1fr)`, gap: 2, minWidth: 600 }}>
                {/* Header heures */}
                <div />
                {hours.map(h => (
                  <div key={h} style={{ textAlign:'center', fontSize:7, color:'var(--text-muted)', padding:'2px 0' }}>
                    {h}h
                  </div>
                ))}
                {/* Lignes jours */}
                {days.map((day, dow) => (
                  <React.Fragment key={dow}>
                    <div style={{ fontSize:8, color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:4 }}>{day}</div>
                    {hours.map(h => {
                      const cell = grid[`${dow}_${h}`];
                      if (!cell) return (
                        <div key={h} style={{ aspectRatio:'1', borderRadius:3, background:'rgba(255,255,255,0.02)' }} />
                      );
                      const intensity = Math.min(0.9, 0.15 + Math.abs(cell.pnl) / maxAbs * 0.75);
                      const bg = cell.pnl >= 0 ? `rgba(0,230,118,${intensity})` : `rgba(255,51,85,${intensity})`;
                      const wr = ((cell.wins / cell.trades) * 100).toFixed(0);
                      return (
                        <div key={h} title={`${day} ${h}h · ${cell.trades} trades · ${cell.pnl >= 0 ? '+' : ''}${cell.pnl.toFixed(2)}$ · WR ${wr}%`}
                          style={{ aspectRatio:'1', borderRadius:3, background:bg, cursor:'pointer' }} />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center', justifyContent:'center' }}>
                <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                  {[0.15, 0.35, 0.55, 0.75, 0.9].map((op, i) => (
                    <div key={i} style={{ width:10, height:10, borderRadius:2, background:`rgba(0,230,118,${op})` }} />
                  ))}
                  <span style={{ fontSize:8, color:'var(--text-muted)', marginLeft:4 }}>PnL positif</span>
                </div>
                <div style={{ display:'flex', gap:3, alignItems:'center', marginLeft:12 }}>
                  {[0.15, 0.35, 0.55, 0.75, 0.9].map((op, i) => (
                    <div key={i} style={{ width:10, height:10, borderRadius:2, background:`rgba(255,51,85,${op})` }} />
                  ))}
                  <span style={{ fontSize:8, color:'var(--text-muted)', marginLeft:4 }}>PnL négatif</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}