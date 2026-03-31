import React, { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getActiveSessions } from '../../utils/marketHours';

interface StatusBarProps {
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  latency?: number;
}

export default function StatusBar({ wsStatus, latency }: StatusBarProps) {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  const [time, setTime] = useState(new Date());
  const [sessions, setSessions] = useState(getActiveSessions());

  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date());
      setSessions(getActiveSessions());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const utcStr = time.toUTCString().replace('GMT', 'UTC').split(' ').slice(1).join(' ');

  return (
    <footer style={{
      height: 28,
      background: '#080810',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16,
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'var(--text-muted)' }}>
        {utcStr}
      </span>

      <div style={{ display: 'flex', gap: 8 }}>
        {sessions.map((s) => (
          <span key={s.name} style={{
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'Space Mono, monospace',
            color: s.color,
            letterSpacing: '0.05em',
          }}>
            ● {s?.name?.toUpperCase() ?? ""}
          </span>
        ))}
        {sessions.length === 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
            MARKET CLOSED
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {latency !== undefined && (
        <span style={{
          fontFamily: 'Space Mono, monospace',
          fontSize: 9,
          color: latency < 100 ? 'var(--buy)' : latency < 300 ? '#f59e0b' : 'var(--sell)',
        }}>
          {latency}ms
        </span>
      )}

      <span style={{
        fontSize: 9,
        fontFamily: 'Space Mono, monospace',
        color: wsStatus === 'connected' ? 'var(--buy)' : 'var(--sell)',
        letterSpacing: '0.1em',
      }}>
        WS: {wsStatus?.toUpperCase() ?? "CONNECTING"}
      </span>

      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
        EL JOVEN SCALP v1.0
      </span>
    </footer>
  );
}
