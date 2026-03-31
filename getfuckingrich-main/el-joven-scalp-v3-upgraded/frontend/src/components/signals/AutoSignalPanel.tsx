import React, { useState, useEffect, useRef } from 'react';
import { useSignalStore } from '../../store/signalStore';

interface AutoStatus {
  running: boolean;
  intervalMinutes: number;
  clients: number;
  limitScan?: string;
}

interface ZoneAlert {
  symbol: string;
  direction: 'BUY' | 'SELL';
  zoneKind: string;
  zoneEntry: number;
  currentPrice: number;
  distATR: number;
  distPct: number;
  status: string;
  strength: number;
  desc: string;
  message: string;
  timestamp: number;
}

interface ZonesSnapshot {
  symbol: string;
  zones: {
    type: string;
    kind: string;
    entry: number;
    distATR: number;
    distPct: number;
    status: string;
    strength: number;
    rr: string;
  }[];
  timestamp: number;
}

export default function AutoSignalPanel() {
  const [status, setStatus]        = useState<AutoStatus | null>(null);
  const [interval, setIntervalMin] = useState(1);
  const [loading, setLoading]      = useState(false);
  const [zoneAlerts, setZoneAlerts]   = useState<ZoneAlert[]>([]);
  const [zonesMap, setZonesMap]       = useState<Record<string, ZonesSnapshot>>({});
  const [activeTab, setActiveTab]     = useState<'signals' | 'zones'>('signals');
  const wsRef = useRef<WebSocket | null>(null);

  const signals     = useSignalStore((s) => s.signals);
  const autoSignals = signals.filter((s) => (s as any).source === 'scheduler');
  const limitSignals = signals.filter((s) => (s as any).orderType === 'LIMIT');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/autosignal/status', { credentials: 'include' });
      const d   = await res.json();
      if (d.success) setStatus(d);
    } catch { /**/ }
  };

  // Écoute des zone_alerts et zones_snapshot via WebSocket
  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'zone_alert') {
          setZoneAlerts(prev => {
            const filtered = prev.filter(z => !(z.symbol === data.symbol && z.zoneKind === data.zoneKind && Math.abs(z.zoneEntry - data.zoneEntry) < 1));
            return [data, ...filtered].slice(0, 20);
          });
        }
        if (data.type === 'zones_snapshot') {
          setZonesMap(prev => ({ ...prev, [data.symbol]: data }));
        }
      } catch { /**/ }
    };

    return () => { ws.close(); };
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 10000);
    return () => clearInterval(t);
  }, []);

  const toggle = async () => {
    setLoading(true);
    try {
      const running = status?.running;
      const url     = running ? '/api/autosignal/stop' : '/api/autosignal/start';
      const body    = running ? {} : { interval };
      const res     = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.success) setStatus(d);
    } catch { /**/ } finally { setLoading(false); }
  };

  const kindIcon: Record<string, string> = {
    ob: '📦', fvg: '🕳️', equal_highs: '🎯', equal_lows: '🎯', swing: '🔁', round: '🔵',
  };

  const strengthLabel = (s: number) => s === 3 ? '🔥 Fort' : s === 2 ? '⚡ Moyen' : '💧 Faible';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🤖 AUTO-SIGNAL</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {status?.running && (
            <span style={{ fontSize: 9, color: 'var(--buy)', fontFamily: 'Space Mono, monospace' }} className="anim-pulse">
              ● ACTIF
            </span>
          )}
          {limitSignals.length > 0 && (
            <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,193,7,0.2)', color: 'var(--gold)', fontWeight: 700 }}>
              {limitSignals.length} LIMIT
            </span>
          )}
        </div>
      </div>

      <div className="panel-body">
        {/* Contrôle */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4 }}>INTERVALLE MARKET</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 3, 5, 10, 15].map((m) => (
                <button
                  key={m}
                  onClick={() => setIntervalMin(m)}
                  disabled={status?.running}
                  className="btn btn-ghost"
                  style={{
                    fontSize: 9, padding: '3px 6px', flex: 1,
                    borderColor: interval === m ? 'var(--gold)' : 'var(--border)',
                    color: interval === m ? 'var(--gold)' : 'var(--text-muted)',
                    background: interval === m ? 'var(--gold-soft)' : 'transparent',
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
          <button
            className={status?.running ? 'btn btn-sell' : 'btn btn-buy'}
            style={{ padding: '8px 14px', marginTop: 14, fontSize: 11 }}
            onClick={toggle}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : status?.running ? '⏹ STOP' : '▶ START'}
          </button>
        </div>

        {/* Stats rapides */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 10 }}>
          {[
            { label: 'ÉTAT',    value: status?.running ? 'ON' : 'OFF',   color: status?.running ? 'var(--buy)' : 'var(--text-muted)' },
            { label: 'MARKET',  value: String(autoSignals.length),        color: 'var(--text-primary)' },
            { label: 'LIMIT',   value: String(limitSignals.length),       color: 'var(--gold)' },
            { label: 'ZONES',   value: String(zoneAlerts.length),         color: 'var(--buy)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--glass-card)', borderRadius: 'var(--r-sm)', padding: '5px 6px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 7, color: 'var(--text-muted)', marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Space Mono, monospace', color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['signals', 'zones'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="btn btn-ghost"
              style={{
                fontSize: 9, padding: '4px 10px', flex: 1,
                borderColor: activeTab === tab ? 'var(--gold)' : 'var(--border)',
                color: activeTab === tab ? 'var(--gold)' : 'var(--text-muted)',
                background: activeTab === tab ? 'var(--gold-soft)' : 'transparent',
              }}
            >
              {tab === 'signals' ? `📡 SIGNAUX (${autoSignals.length + limitSignals.length})` : `🗺️ ZONES (${zoneAlerts.length})`}
            </button>
          ))}
        </div>

        {/* Tab Signaux */}
        {activeTab === 'signals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 380, overflowY: 'auto' }}>
            {/* Limit signals en premier (priorité) */}
            {limitSignals.slice(0, 3).map((s: any, i) => (
              <div key={`l${i}`} style={{
                padding: '8px 10px',
                background: s.signal === 'BUY' ? 'rgba(0,230,118,0.07)' : 'rgba(255,51,85,0.07)',
                border: `1px solid var(--gold)`,
                borderRadius: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,193,7,0.25)', color: 'var(--gold)', fontWeight: 900 }}>
                      🎯 LIMIT
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 900, color: s.signal === 'BUY' ? 'var(--buy)' : 'var(--sell)' }}>{s.signal}</span>
                    <span style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{s.symbol}</span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{s.zoneKind}</span>
                  </div>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                    {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginBottom: 4 }}>
                  {[['ENTRÉE', s.entry, 'var(--gold)'], ['SL', s.stopLoss, 'var(--sell)'], ['TP', s.takeProfit, 'var(--buy)']].map(([label, val, color]) => (
                    <div key={label as string} style={{ textAlign: 'center', padding: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: 5 }}>
                      <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{label}</div>
                      <div style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', fontWeight: 700, color: color as string }}>{val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {s.rr && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,193,7,0.1)', color: 'var(--gold)', fontFamily: 'Space Mono,monospace' }}>RR {s.rr}x</span>}
                  {s.zoneStrength && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)' }}>{strengthLabel(s.zoneStrength)}</span>}
                  {s.reasoning && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>{s.reasoning.slice(0, 40)}</span>}
                </div>
              </div>
            ))}

            {/* Market signals */}
            {autoSignals.slice(0, 5).map((s: any, i) => {
              const sigColor = s.signal === 'BUY' ? 'var(--buy)' : s.signal === 'SELL' ? 'var(--sell)' : 'var(--text-muted)';
              return (
                <div key={`m${i}`} style={{
                  padding: '8px 10px',
                  background: s.signal === 'BUY' ? 'rgba(0,230,118,0.05)' : s.signal === 'SELL' ? 'rgba(255,51,85,0.05)' : 'var(--glass-card)',
                  border: `1px solid ${s.inZone ? 'rgba(156,39,176,0.5)' : s.signal === 'BUY' ? 'rgba(0,230,118,0.2)' : s.signal === 'SELL' ? 'rgba(255,51,85,0.2)' : 'var(--border)'}`,
                  borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: sigColor }}>{s.signal}</span>
                      <span style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{s.symbol}</span>
                      {s.inZone && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(156,39,176,0.2)', color: '#CE93D8', fontWeight: 700 }}>📍 IN ZONE</span>}
                      {s.mtfConfluence && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: s.mtfConfluence === 'HIGH' ? 'rgba(0,230,118,0.15)' : 'rgba(255,193,7,0.15)', color: s.mtfConfluence === 'HIGH' ? 'var(--buy)' : 'var(--gold)', fontWeight: 700 }}>{s.mtfConfluence}</span>}
                    </div>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                      {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginBottom: 4 }}>
                    {[['ENTRÉE', s.entry, 'var(--text-primary)'], ['SL', s.stopLoss, 'var(--sell)'], ['TP', s.takeProfit, 'var(--buy)']].map(([label, val, color]) => (
                      <div key={label as string} style={{ textAlign: 'center', padding: '3px', background: 'rgba(255,255,255,0.04)', borderRadius: 5 }}>
                        <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{label}</div>
                        <div style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', fontWeight: 700, color: color as string }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {s.rr && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,193,7,0.1)', color: 'var(--gold)', fontFamily: 'Space Mono,monospace' }}>RR {s.rr}x</span>}
                    {s.confidence && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)' }}>CONF {s.confidence}%</span>}
                    {s.adx?.isStrong && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(233,30,99,0.15)', color: '#E91E63' }}>ADX {s.adx.adx}</span>}
                    {s.ichimoku && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: s.ichimoku.aboveCloud ? 'rgba(0,230,118,0.1)' : 'rgba(255,51,85,0.1)', color: s.ichimoku.aboveCloud ? 'var(--buy)' : 'var(--sell)' }}>☁️ {s.ichimoku.aboveCloud ? '↑' : '↓'}</span>}
                    {s.mss && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(156,39,176,0.15)', color: '#9C27B0' }}>MSS {s.mss.type === 'bullish' ? '↑' : '↓'}</span>}
                    {s.kellySafe && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,193,7,0.1)', color: 'var(--gold)' }}>Kelly {s.kellySafe}%</span>}
                  </div>
                </div>
              );
            })}

            {autoSignals.length === 0 && limitSignals.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                {status?.running ? 'En attente de signaux…' : 'Lance le moteur pour recevoir des signaux.'}
              </div>
            )}
          </div>
        )}

        {/* Tab Zones */}
        {activeTab === 'zones' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 380, overflowY: 'auto' }}>
            {/* Zones snapshot par symbole */}
            {Object.values(zonesMap).map((snap) => (
              <div key={snap.symbol} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 4 }}>
                  {snap.symbol}
                </div>
                {snap.zones.slice(0, 4).map((z, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 8px', marginBottom: 3,
                    background: z.type === 'bullish' ? 'rgba(0,230,118,0.04)' : 'rgba(255,51,85,0.04)',
                    border: `1px solid ${z.status === 'active' ? (z.type === 'bullish' ? 'rgba(0,230,118,0.5)' : 'rgba(255,51,85,0.5)') : 'var(--border)'}`,
                    borderRadius: 7,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11 }}>{kindIcon[z.kind] || '📍'}</span>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: z.type === 'bullish' ? 'var(--buy)' : 'var(--sell)' }}>
                          {z.type === 'bullish' ? '▲ BUY' : '▼ SELL'} {z.kind.replace('_', ' ').toUpperCase()}
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'Space Mono,monospace' }}>
                          @ {z.entry} · RR {z.rr}x
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', color: z.distATR < 1 ? 'var(--gold)' : 'var(--text-dim)' }}>
                        {z.distATR.toFixed(1)} ATR
                      </div>
                      <div style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, marginTop: 2, background: z.status === 'active' ? 'rgba(255,193,7,0.25)' : z.status === 'approaching' ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.06)', color: z.status === 'active' ? 'var(--gold)' : z.status === 'approaching' ? '#00BCD4' : 'var(--text-muted)' }}>
                        {z.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Zone alerts récentes */}
            {zoneAlerts.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 4 }}>ALERTES RÉCENTES</div>
                {zoneAlerts.slice(0, 5).map((alert, i) => (
                  <div key={i} style={{
                    padding: '6px 8px', marginBottom: 3,
                    background: 'var(--glass-card)',
                    border: '1px solid var(--border)', borderRadius: 7,
                  }}>
                    <div style={{ fontSize: 9, color: alert.direction === 'BUY' ? 'var(--buy)' : 'var(--sell)', marginBottom: 2 }}>
                      {alert.message}
                    </div>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(zonesMap).length === 0 && zoneAlerts.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                Les zones seront détectées automatiquement.<br />Lance le moteur pour commencer.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
