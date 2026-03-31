import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSignalStore } from '../../store/signalStore';
import { useMarketStore }  from '../../store/marketStore';
import { formatPrice }     from '../../utils/priceFormat';

type BotMode = 'auto' | 'semi' | 'off';

interface ConfirmModal {
  side: 'BUY' | 'SELL';
  symbol: string;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  entry: number;
  rr: string;
  compositeScore: number;
  orderType?: 'MARKET' | 'LIMIT';
}

interface BotFilter {
  minConfidence: number;
  minScore: number;
  minRR: number;
  maxSimultaneous: number;
  allowedSymbols: string[];
  requireMTFHigh: boolean;
  requireOTE: boolean;
  requireKillZone: boolean;
  allowLimitOrders: boolean;   // ← nouveau : accepter les limit orders
}

const DEFAULT_FILTER: BotFilter = {
  minConfidence: 60,
  minScore: 15,           // ← abaissé de 25 à 15 pour les signaux in-zone
  minRR: 1.5,
  maxSimultaneous: 3,
  allowedSymbols: ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'],
  requireMTFHigh: false,
  requireOTE: false,
  requireKillZone: false,
  allowLimitOrders: true,  // ← actif par défaut
};

function passesFilter(sig: any, filter: BotFilter): { ok: boolean; reason?: string } {
  if (!sig || sig.signal === 'HOLD') return { ok: false, reason: 'Signal HOLD' };
  if ((sig.confidence || 0) < filter.minConfidence) return { ok: false, reason: `Conf ${sig.confidence}% < ${filter.minConfidence}% min` };
  if (Math.abs(sig.compositeScore || 0) < filter.minScore) return { ok: false, reason: `Score ${sig.compositeScore} < ${filter.minScore} min` };
  const rr = sig.stopLoss && sig.takeProfit && sig.entry
    ? Math.abs((sig.takeProfit - sig.entry) / (sig.entry - sig.stopLoss)) : 0;
  if (rr < filter.minRR) return { ok: false, reason: `RR ${rr.toFixed(1)} < ${filter.minRR} min` };
  if (!filter.allowedSymbols.includes(sig.symbol)) return { ok: false, reason: `${sig.symbol} non autorisé` };
  if (filter.requireMTFHigh && sig.mtfConfluence !== 'HIGH') return { ok: false, reason: 'MTF confluence < HIGH' };
  if (filter.requireOTE && !sig.ote) return { ok: false, reason: 'Pas de zone OTE' };
  if (filter.requireKillZone && !sig.killZone) return { ok: false, reason: 'Pas de Kill Zone active' };
  // Limit orders : si allowLimitOrders est false, on skip les limit signals
  if (!filter.allowLimitOrders && sig.orderType === 'LIMIT') return { ok: false, reason: 'Limit orders désactivés dans les filtres' };
  return { ok: true };
}

function checkMaxTrades(openPos: number, filter: BotFilter): { ok: boolean; reason?: string } {
  if (openPos >= filter.maxSimultaneous) return { ok: false, reason: `Max ${filter.maxSimultaneous} trades simultanés atteint` };
  return { ok: true };
}

const SYMBOLS = ['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'];

export default function MT5ExecutionPanel() {
  const [status,    setStatus]    = useState<any>(null);
  const [history,   setHistory]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [feedback,  setFeedback]  = useState('');
  const [lots,      setLots]      = useState('0.1');
  const [botMode,   setBotMode]   = useState<BotMode>('off');
  const [autoCount, setAutoCount] = useState(0);
  const [confirm,   setConfirm]   = useState<ConfirmModal | null>(null);
  const [filter,    setFilter]    = useState<BotFilter>(DEFAULT_FILTER);
  const [showFilter,setShowFilter]= useState(false);
  const [filterTab, setFilterTab] = useState<'filter'|'history'>('history');
  const [botLog,    setBotLog]    = useState<{ ts: number; msg: string; ok: boolean }[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [paperMode, setPaperMode]       = useState(false);
  const [paperTrades, setPaperTrades]   = useState<any[]>([]);
  const [paperPnl, setPaperPnl]         = useState(0);

  const lastSigRef = useRef<string>('');

  const signals = useSignalStore((s) => s.signals);
  const symbol  = useMarketStore((s) => s.symbol);
  const latest  = signals[0] as any;
  // Dernier signal limit disponible
  const latestLimit = signals.find((s: any) => s.orderType === 'LIMIT') as any;

  const connected = status?.connected;
  const openPos   = status?.openPositions ?? 0;

  const addLog = (msg: string, ok: boolean) => {
    setBotLog(prev => [{ ts: Date.now(), msg, ok }, ...prev].slice(0, 30));
  };

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/mt5/status', { credentials: 'include' });
      setStatus(await r.json());
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/mt5/history?limit=20', { credentials: 'include' });
      const d = await r.json();
      if (d.success) setHistory(d.trades);
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus(); fetchHistory();
    const t = setInterval(() => { fetchStatus(); fetchHistory(); }, 5000);
    return () => clearInterval(t);
  }, []);

  // ── Gestion ordres LIMIT automatiques ────────────────────────────
  // En mode auto, les limit signals sont aussi traités automatiquement
  useEffect(() => {
    if (botMode !== 'auto' || !filter.allowLimitOrders) return;
    if (!latestLimit) return;
    const sigId = `limit-${latestLimit.symbol}-${latestLimit.signal}-${latestLimit.timestamp}`;
    if (sigId === lastSigRef.current) return;
    lastSigRef.current = sigId;

    const check = passesFilter(latestLimit, filter);
    if (!check.ok) {
      setSkippedCount(c => c + 1);
      addLog(`⏭ SKIP LIMIT ${latestLimit.symbol} — ${check.reason}`, false);
      return;
    }
    addLog(`🎯 AUTO LIMIT ${latestLimit.signal} ${latestLimit.symbol} zone=${latestLimit.zoneKind}`, true);
    placeOrder(latestLimit.signal as 'BUY' | 'SELL', true, latestLimit.symbol, 'LIMIT', latestLimit.entry, latestLimit.stopLoss, latestLimit.takeProfit);
  }, [latestLimit, botMode, filter]);

  // AUTO mode market signals
  useEffect(() => {
    if (botMode !== 'auto') return;
    if (!latest || latest.orderType === 'LIMIT') return; // limit géré ci-dessus
    const sigId = `${latest.symbol}-${latest.signal}-${latest.timestamp}`;
    if (sigId === lastSigRef.current) return;
    lastSigRef.current = sigId;

    const check = passesFilter(latest, filter);
    if (!check.ok) { setSkippedCount(c => c + 1); addLog(`⏭ SKIP ${latest.symbol} ${latest.signal} — ${check.reason}`, false); return; }
    const maxCheck = checkMaxTrades(openPos, filter);
    if (!maxCheck.ok) { setSkippedCount(c => c + 1); addLog(`⏭ SKIP ${latest.symbol} — ${maxCheck.reason}`, false); return; }
    addLog(`🚀 AUTO ${latest.signal} ${latest.symbol} — conf ${latest.confidence}%`, true);
    placeOrder(latest.signal as 'BUY' | 'SELL', true);
  }, [latest, botMode, filter]);

  // SEMI mode
  useEffect(() => {
    if (botMode !== 'semi') return;
    const sig = latestLimit || latest;
    if (!sig || !sig.signal || sig.signal === 'HOLD') return;
    const sigId = `${sig.symbol}-${sig.signal}-${sig.timestamp}`;
    if (sigId === lastSigRef.current) return;
    lastSigRef.current = sigId;

    const check = passesFilter(sig, filter);
    if (!check.ok) { addLog(`⏭ SKIP ${sig.symbol} — ${check.reason}`, false); return; }
    const rr = sig.stopLoss && sig.takeProfit && sig.entry
      ? Math.abs((sig.takeProfit - sig.entry) / (sig.entry - sig.stopLoss)).toFixed(1) : '?';
    setConfirm({
      side: sig.signal as 'BUY' | 'SELL',
      symbol: sig.symbol || symbol,
      stopLoss: sig.stopLoss || 0,
      takeProfit: sig.takeProfit || 0,
      confidence: sig.confidence || 0,
      entry: sig.entry || 0,
      rr,
      compositeScore: sig.compositeScore || 0,
      orderType: sig.orderType || 'MARKET',
    });
  }, [latest, latestLimit, botMode, filter]);

  const closePaperTrade = (tradeIdx: number, exitPrice: number) => {
    setPaperTrades(prev => {
      const updated = [...prev];
      const t = updated[tradeIdx];
      if (!t || t.closed) return prev;
      const pnl = t.side === 'BUY' ? (exitPrice - t.entry) * 100 * parseFloat(lots) : (t.entry - exitPrice) * 100 * parseFloat(lots);
      updated[tradeIdx] = { ...t, closed: true, exit: exitPrice, pnl: parseFloat(pnl.toFixed(2)), closedAt: new Date().toLocaleTimeString() };
      setPaperPnl(p => parseFloat((p + updated[tradeIdx].pnl).toFixed(2)));
      return updated;
    });
  };

  // ── placeOrder v2 — supporte LIMIT et MARKET ─────────────────────
  const placeOrder = async (
    side: 'BUY' | 'SELL',
    isAuto = false,
    overrideSymbol?: string,
    orderType: 'MARKET' | 'LIMIT' = 'MARKET',
    overrideEntry?: number,
    overrideSL?: number,
    overrideTP?: number,
  ) => {
    // PAPER MODE
    if (paperMode) {
      const orderSym = overrideSymbol || latest?.symbol || symbol;
      const entry    = overrideEntry || latest?.entry || 0;
      const sl       = overrideSL    || latest?.stopLoss || 0;
      const tp       = overrideTP    || latest?.takeProfit || 0;
      const trade    = { id: Date.now(), side, symbol: orderSym, entry, sl, tp, lots: parseFloat(lots), orderType, openedAt: new Date().toLocaleTimeString(), closed: false };
      setPaperTrades(prev => [trade, ...prev].slice(0, 20));
      const msg = `📄 PAPER ${orderType} ${side} ${orderSym} @${entry} | SL:${sl} TP:${tp}`;
      setFeedback(msg); addLog(msg, true);
      if (isAuto) setAutoCount(c => c + 1);
      setConfirm(null); setLoading(false);
      return;
    }

    setLoading(true); setFeedback(''); setConfirm(null);
    const orderSym   = overrideSymbol || latest?.symbol || symbol;
    const stopLoss   = overrideSL   || latest?.stopLoss   || 0;
    const takeProfit = overrideTP   || latest?.takeProfit || 0;
    const entryPrice = overrideEntry || latest?.entry     || 0;
    const confidence = latest?.confidence || 0;

    try {
      const r = await fetch('/api/mt5/command', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          symbol:     orderSym,
          orderType,                                           // ← MARKET ou LIMIT
          price:      orderType === 'LIMIT' ? entryPrice : undefined, // prix pour limit
          stopLoss,
          takeProfit,
          lots:       parseFloat(lots),
          confidence,
          comment:    `ElJoven_${orderType}_${isAuto ? 'AUTO' : 'SEMI'}_${confidence}pct`,
        }),
      });
      const d = await r.json();
      if (d.success) {
        const msg = `✅ ${orderType} ${isAuto ? 'AUTO' : 'SEMI'} ${side} ${orderSym} ${lots}lot @ ${orderType === 'LIMIT' ? entryPrice : 'market'} | SL:${stopLoss > 0 ? formatPrice(stopLoss, 2) : 'N/A'} TP:${takeProfit > 0 ? formatPrice(takeProfit, 2) : 'N/A'}`;
        setFeedback(msg); addLog(msg, true);
        if (isAuto) setAutoCount(c => c + 1);
      } else {
        const msg = `❌ ${d.error || 'Erreur inconnue'}`;
        setFeedback(msg); addLog(msg, false);
      }
      fetchHistory(); fetchStatus();
    } catch {
      setFeedback('❌ Backend introuvable');
      addLog('❌ Backend introuvable', false);
    } finally { setLoading(false); }
  };

  const closeAll = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/mt5/close-all', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const d = await r.json();
      const msg = d.success ? `✅ Positions fermées` : `❌ ${d.error}`;
      setFeedback(msg); addLog(msg, d.success);
      fetchHistory(); fetchStatus();
    } catch { setFeedback('❌ Backend introuvable'); }
    finally { setLoading(false); }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">⚡ MT5 EXECUTION</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {connected !== undefined && (
            <span style={{ fontSize: 9, color: connected ? 'var(--buy)' : 'var(--sell)', fontFamily: 'Space Mono, monospace' }}>
              {connected ? '● CONNECTÉ' : '○ DÉCO'}
            </span>
          )}
          {paperMode && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,188,212,0.2)', color: '#00BCD4' }}>PAPER</span>}
        </div>
      </div>

      <div className="panel-body">
        {/* Mode bot */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {(['off', 'semi', 'auto'] as BotMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setBotMode(m)}
              className="btn btn-ghost"
              style={{
                flex: 1, fontSize: 9, padding: '5px 0',
                borderColor: botMode === m ? (m === 'auto' ? 'var(--buy)' : m === 'semi' ? 'var(--gold)' : 'var(--border)') : 'var(--border)',
                color: botMode === m ? (m === 'auto' ? 'var(--buy)' : m === 'semi' ? 'var(--gold)' : 'var(--text-primary)') : 'var(--text-muted)',
                background: botMode === m ? (m === 'auto' ? 'var(--buy-dim)' : m === 'semi' ? 'var(--gold-soft)' : 'rgba(255,255,255,0.05)') : 'transparent',
              }}
            >
              {m === 'off' ? '✋ MANUEL' : m === 'semi' ? '⚡ SEMI' : '🤖 AUTO'}
            </button>
          ))}
        </div>

        {/* Lots + Paper mode */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>LOTS</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['0.01', '0.05', '0.1', '0.5', '1.0'].map((l) => (
                <button
                  key={l}
                  onClick={() => setLots(l)}
                  className="btn btn-ghost"
                  style={{
                    fontSize: 8, padding: '3px 5px', flex: 1,
                    borderColor: lots === l ? 'var(--gold)' : 'var(--border)',
                    color: lots === l ? 'var(--gold)' : 'var(--text-muted)',
                    background: lots === l ? 'var(--gold-soft)' : 'transparent',
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
            <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>PAPER</span>
            <input type="checkbox" checked={paperMode} onChange={(e) => setPaperMode(e.target.checked)} style={{ cursor: 'pointer' }} />
          </label>
        </div>

        {/* Dernier signal info */}
        {(latestLimit || latest) && (latestLimit || latest).signal !== 'HOLD' && (
          <div style={{
            padding: '8px 10px', marginBottom: 10,
            background: (latestLimit || latest).orderType === 'LIMIT' ? 'rgba(255,193,7,0.07)' : 'var(--glass-card)',
            border: `1px solid ${(latestLimit || latest).orderType === 'LIMIT' ? 'var(--gold)' : 'var(--border)'}`,
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {(latestLimit || latest).orderType === 'LIMIT' && (
                  <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: 'rgba(255,193,7,0.25)', color: 'var(--gold)', fontWeight: 900 }}>
                    🎯 LIMIT
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 900, color: (latestLimit || latest).signal === 'BUY' ? 'var(--buy)' : 'var(--sell)' }}>
                  {(latestLimit || latest).signal}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', fontWeight: 700 }}>
                  {(latestLimit || latest).symbol}
                </span>
                {(latestLimit || latest).inZone && (
                  <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 4, background: 'rgba(156,39,176,0.2)', color: '#CE93D8' }}>📍 ZONE</span>
                )}
              </div>
              <span style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'Space Mono,monospace' }}>
                conf {(latestLimit || latest).confidence}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3 }}>
              {[
                ['PRIX', (latestLimit || latest).entry, 'var(--text-primary)'],
                ['SL',   (latestLimit || latest).stopLoss, 'var(--sell)'],
                ['TP',   (latestLimit || latest).takeProfit, 'var(--buy)'],
                ['RR',   (latestLimit || latest).rr + 'x', 'var(--gold)'],
              ].map(([label, val, color]) => (
                <div key={label as string} style={{ textAlign: 'center', padding: '3px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                  <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontSize: 8, fontFamily: 'Space Mono,monospace', fontWeight: 700, color: color as string }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Boutons manuels */}
        {botMode === 'off' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {/* Market orders */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button className="btn btn-buy" style={{ fontSize: 12, fontWeight: 800, minHeight: 42 }}
                onClick={() => placeOrder('BUY', false, undefined, 'MARKET')} disabled={loading || !connected}>
                {loading ? <span className="spinner spinner-sm" /> : '▲ BUY MARKET'}
              </button>
              <button className="btn btn-sell" style={{ fontSize: 12, fontWeight: 800, minHeight: 42 }}
                onClick={() => placeOrder('SELL', false, undefined, 'MARKET')} disabled={loading || !connected}>
                {loading ? <span className="spinner spinner-sm" /> : '▼ SELL MARKET'}
              </button>
            </div>

            {/* Limit orders — activés si un limit signal est disponible */}
            {latestLimit && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  className="btn"
                  style={{
                    fontSize: 11, fontWeight: 800, minHeight: 38,
                    background: latestLimit.signal === 'BUY' ? 'rgba(0,230,118,0.12)' : 'transparent',
                    border: '1px solid var(--gold)',
                    color: 'var(--gold)',
                    opacity: latestLimit.signal === 'BUY' ? 1 : 0.4,
                  }}
                  onClick={() => placeOrder('BUY', false, latestLimit.symbol, 'LIMIT', latestLimit.entry, latestLimit.stopLoss, latestLimit.takeProfit)}
                  disabled={loading || !connected || latestLimit.signal !== 'BUY'}
                >
                  🎯 BUY LIMIT @ {latestLimit.entry}
                </button>
                <button
                  className="btn"
                  style={{
                    fontSize: 11, fontWeight: 800, minHeight: 38,
                    background: latestLimit.signal === 'SELL' ? 'rgba(255,51,85,0.12)' : 'transparent',
                    border: '1px solid var(--gold)',
                    color: 'var(--gold)',
                    opacity: latestLimit.signal === 'SELL' ? 1 : 0.4,
                  }}
                  onClick={() => placeOrder('SELL', false, latestLimit.symbol, 'LIMIT', latestLimit.entry, latestLimit.stopLoss, latestLimit.takeProfit)}
                  disabled={loading || !connected || latestLimit.signal !== 'SELL'}
                >
                  🎯 SELL LIMIT @ {latestLimit.entry}
                </button>
              </div>
            )}
          </div>
        )}

        {botMode === 'semi' && (
          <div style={{ padding: '10px 12px', background: 'var(--gold-soft)', borderRadius: 8, border: '1px solid var(--border-gold)', fontSize: 10, color: 'var(--gold)', textAlign: 'center', marginBottom: 10 }}>
            ⚡ En attente du prochain signal qualifié…<br />
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>Conf≥{filter.minConfidence}% · Score≥{filter.minScore} · RR≥{filter.minRR} · {filter.allowLimitOrders ? 'LIMIT ✓' : 'LIMIT ✗'}</span>
          </div>
        )}
        {botMode === 'auto' && (
          <div style={{ padding: '10px 12px', background: 'var(--buy-dim)', borderRadius: 8, border: '1px solid var(--border-buy)', fontSize: 10, color: 'var(--buy)', textAlign: 'center', marginBottom: 10 }}>
            🤖 Placement automatique actif — Market + Limit<br />
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{autoCount} placés · {skippedCount} ignorés</span>
          </div>
        )}

        {/* Close all */}
        {connected && openPos > 0 && (
          <button className="btn" onClick={closeAll} disabled={loading} style={{ fontSize: 10, fontWeight: 700, padding: '7px', background: 'var(--sell-dim)', border: '1px solid var(--border-sell)', color: 'var(--sell)', borderRadius: 8, marginBottom: 10, width: '100%' }}>
            ⚠️ CLOSE ALL ({openPos} position{openPos > 1 ? 's' : ''})
          </button>
        )}

        {/* Feedback */}
        {feedback && (
          <div style={{
            fontSize: 9, padding: '6px 10px', borderRadius: 6, marginBottom: 8,
            background: feedback.startsWith('✅') ? 'rgba(0,230,118,0.1)' : 'rgba(255,51,85,0.1)',
            border: `1px solid ${feedback.startsWith('✅') ? 'rgba(0,230,118,0.3)' : 'rgba(255,51,85,0.3)'}`,
            color: feedback.startsWith('✅') ? 'var(--buy)' : 'var(--sell)',
            fontFamily: 'Space Mono, monospace',
          }}>
            {feedback}
          </div>
        )}

        {/* Filtre & Log toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['history', 'filter'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className="btn btn-ghost"
              style={{
                flex: 1, fontSize: 8, padding: '4px 0',
                borderColor: filterTab === tab ? 'var(--gold)' : 'var(--border)',
                color: filterTab === tab ? 'var(--gold)' : 'var(--text-muted)',
                background: filterTab === tab ? 'var(--gold-soft)' : 'transparent',
              }}
            >
              {tab === 'history' ? `📋 LOG (${botLog.length})` : '⚙️ FILTRES'}
            </button>
          ))}
        </div>

        {/* Log */}
        {filterTab === 'history' && (
          <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {botLog.length === 0 && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Aucune action encore</div>
            )}
            {botLog.map((log, i) => (
              <div key={i} style={{ fontSize: 8, color: log.ok ? 'var(--buy)' : 'var(--sell)', fontFamily: 'Space Mono,monospace', padding: '2px 4px', background: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
                {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} {log.msg}
              </div>
            ))}
          </div>
        )}

        {/* Filtres */}
        {filterTab === 'filter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Conf min %',   key: 'minConfidence', min: 30, max: 95, step: 5  },
              { label: 'Score min',    key: 'minScore',      min: 10, max: 60, step: 5  },
              { label: 'RR min',       key: 'minRR',         min: 1,  max: 4,  step: 0.5 },
              { label: 'Max trades',   key: 'maxSimultaneous', min: 1, max: 10, step: 1 },
            ].map(({ label, key, min, max, step }) => (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'Space Mono,monospace' }}>{(filter as any)[key]}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={(filter as any)[key]}
                  onChange={(e) => setFilter(f => ({ ...f, [key]: parseFloat(e.target.value) }))}
                  style={{ width: '100%' }} />
              </div>
            ))}

            {/* Toggle limit orders */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--glass-card)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>🎯 Limit orders auto</span>
              <input type="checkbox" checked={filter.allowLimitOrders}
                onChange={(e) => setFilter(f => ({ ...f, allowLimitOrders: e.target.checked }))} />
            </div>

            <button onClick={() => setFilter(DEFAULT_FILTER)} style={{ fontSize: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
              Réinitialiser filtres
            </button>
          </div>
        )}

        {/* Modal de confirmation SEMI mode */}
        {confirm && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, width: '85%', maxWidth: 280 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: confirm.side === 'BUY' ? 'var(--buy)' : 'var(--sell)', marginBottom: 8, textAlign: 'center' }}>
                {confirm.orderType === 'LIMIT' ? '🎯 LIMIT ' : ''}{confirm.side} {confirm.symbol}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                {[['ENTRÉE', confirm.entry], ['RR', confirm.rr + 'x'], ['SL', confirm.stopLoss], ['TP', confirm.takeProfit]].map(([l, v]) => (
                  <div key={l as string} style={{ textAlign: 'center', padding: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{l}</div>
                    <div style={{ fontSize: 10, fontFamily: 'Space Mono,monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 11 }}>
                  Annuler
                </button>
                <button
                  onClick={() => placeOrder(confirm.side, false, confirm.symbol, confirm.orderType || 'MARKET', confirm.entry, confirm.stopLoss, confirm.takeProfit)}
                  disabled={loading}
                  style={{ flex: 2, padding: '10px', borderRadius: 8, cursor: 'pointer', background: confirm.side === 'BUY' ? 'var(--buy-dim)' : 'var(--sell-dim)', border: `1px solid ${confirm.side === 'BUY' ? 'var(--border-buy)' : 'var(--border-sell)'}`, color: confirm.side === 'BUY' ? 'var(--buy)' : 'var(--sell)', fontSize: 13, fontWeight: 900 }}
                >
                  {loading ? <span className="spinner" /> : `✓ CONFIRMER ${confirm.orderType === 'LIMIT' ? 'LIMIT' : ''}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
