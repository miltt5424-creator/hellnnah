import React from 'react';
import { useUIStore } from '../../store/uiStore';

export default function AlertToast() {
  const toasts     = useUIStore((s) => s.activeToasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 40,
      right: 16,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 8,
      zIndex: 9999,
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 'var(--r-lg)',
            background: t.type === 'buy' ? '#0a1f14' : t.type === 'sell' ? '#1f0a0e' : '#0d0d1f',
            border: `1px solid ${t.type === 'buy' ? 'rgba(0,255,136,0.4)' : t.type === 'sell' ? 'rgba(255,51,85,0.4)' : 'var(--gold-border)'}`,
            boxShadow: `0 4px 24px ${t.type === 'buy' ? 'rgba(0,255,136,0.15)' : t.type === 'sell' ? 'rgba(255,51,85,0.15)' : 'rgba(255,215,0,0.1)'}`,
            animation: 'slideInRight 0.2s ease',
            minWidth: 240,
            maxWidth: 320,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {t.message}
          </span>
          <button
            onClick={() => removeToast(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 14, padding: 2, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
