import React, { useState } from 'react';
import { useAlertStore } from '../../store/alertStore';
import { useMarketStore } from '../../store/marketStore';
import type { AlertType } from '../../types/alert';

const ALERT_TYPES: { key: AlertType; label: string; icon: string }[] = [
  { key: 'price_above', label: 'Prix >', icon: '📈' },
  { key: 'price_below', label: 'Prix <', icon: '📉' },
  { key: 'signal_buy',  label: 'Signal BUY',  icon: '🟢' },
  { key: 'signal_sell', label: 'Signal SELL', icon: '🔴' },
];

const ALL_SYMBOLS = [
  'XAU/USD','XAG/USD','WTI/USD',
  'EUR/USD','GBP/USD','USD/JPY','CHF/JPY','AUD/USD',
  'BTC/USD','ETH/USD','SOL/USD',
  'AAPL/USD','TSLA/USD','NVDA/USD',
  'SPX500/USD','NAS100/USD','US30/USD',
];

export default function AlertsPanel() {
  const alerts      = useAlertStore((s) => s.alerts);
  const addAlert    = useAlertStore((s) => s.addAlert);
  const removeAlert = useAlertStore((s) => s.removeAlert);
  const toggleAlert = useAlertStore((s) => s.toggleAlert);
  const currentSym  = useMarketStore((s) => s.symbol);
  const prices      = useMarketStore((s) => s.prices);

  const [form, setForm] = useState({
    symbol:    currentSym,
    type:      'price_above' as AlertType,
    threshold: '',
  });
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!form.symbol) return;
    const needsThreshold = form.type === 'price_above' || form.type === 'price_below';
    if (needsThreshold && !form.threshold) return;
    addAlert({
      id:        `alert-${Date.now()}`,
      symbol:    form.symbol,
      type:      form.type,
      threshold: needsThreshold ? parseFloat(form.threshold) : undefined,
      active:    true,
      triggered: false,
      createdAt: Date.now(),
    });
    setForm({ symbol: currentSym, type: 'price_above', threshold: '' });
    setAdding(false);
  };

  const currentPrice = prices[form.symbol]?.price;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">🔔 ALERTES</span>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setAdding((v) => !v)}
          style={{ fontSize: 14, padding: '3px 8px' }}
        >
          {adding ? '✕' : '＋'}
        </button>
      </div>

      <div className="panel-body" style={{ padding: '10px 12px' }}>
        {/* Formulaire ajout */}
        {adding && (
          <div style={{
            background: 'var(--glass-card)',
            border: '1px solid var(--border-gold)',
            borderRadius: 'var(--r-md)',
            padding: '10px 12px',
            marginBottom: 10,
            animation: 'fadeIn 0.2s ease',
            backdropFilter: 'var(--blur-sm)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              {/* Symbole */}
              <select
                className="select"
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              >
                {ALL_SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              {/* Type */}
              <select
                className="select"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AlertType }))}
              >
                {ALERT_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>

            {/* Threshold (seulement pour price_above/below) */}
            {(form.type === 'price_above' || form.type === 'price_below') && (
              <div style={{ marginBottom: 8, position: 'relative' }}>
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder={currentPrice ? `Prix actuel: ${currentPrice.toFixed(2)}` : 'Prix cible...'}
                  value={form.threshold}
                  onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                />
                {currentPrice && (
                  <button
                    onClick={() => setForm((f) => ({ ...f, threshold: currentPrice.toFixed(2) }))}
                    style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 9, color: 'var(--gold)', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '2px 4px',
                    }}
                  >
                    ACTUEL
                  </button>
                )}
              </div>
            )}

            <button className="btn btn-gold" style={{ width: '100%', fontSize: 11 }} onClick={handleAdd}>
              + CRÉER ALERTE
            </button>
          </div>
        )}

        {/* Liste des alertes */}
        {alerts.length === 0 && !adding && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, padding: '20px 0' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🔔</div>
            Aucune alerte — clique sur ＋
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
          {alerts.map((alert) => {
            const typeInfo = ALERT_TYPES.find((t) => t.key === alert.type);
            return (
              <div
                key={alert.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px',
                  background: alert.triggered ? 'rgba(255,215,0,0.06)' : 'var(--glass-card)',
                  border: `1px solid ${alert.triggered ? 'var(--border-gold)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-sm)',
                  opacity: alert.active ? 1 : 0.45,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 14 }}>{typeInfo?.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text-primary)',
                    fontFamily: 'Space Mono, monospace',
                  }}>
                    {alert.symbol}
                    {alert.threshold !== undefined && (
                      <span style={{ color: 'var(--gold)', marginLeft: 4 }}>
                        {alert.type === 'price_above' ? '>' : '<'} {alert.threshold}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    {typeInfo?.label}
                    {alert.triggered && <span style={{ color: 'var(--buy)', marginLeft: 4 }}>✅ Déclenchée</span>}
                  </div>
                </div>

                {/* Toggle actif/inactif */}
                <button
                  onClick={() => toggleAlert(alert.id)}
                  style={{
                    width: 28, height: 16, borderRadius: 8,
                    background: alert.active ? 'var(--buy)' : 'var(--border)',
                    border: 'none', cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, width: 12, height: 12,
                    left: alert.active ? 14 : 2,
                    background: 'white', borderRadius: '50%',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </button>

                {/* Supprimer */}
                <button
                  onClick={() => removeAlert(alert.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px' }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
