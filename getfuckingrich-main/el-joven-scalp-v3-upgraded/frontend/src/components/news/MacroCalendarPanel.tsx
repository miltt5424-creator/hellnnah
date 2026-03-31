import React from 'react';
import { useCalendar } from '../../hooks/useMarketData';
import { timeUntilEvent } from '../../utils/marketHours';

interface CalEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  ts: number;
}

export default function MacroCalendarPanel() {
  const { data, isLoading } = useCalendar();
  const events = (data?.events || []) as CalEvent[];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-title">📅 MACRO CALENDAR</span>
        {isLoading && <div className="spinner" style={{ width: 12, height: 12 }} />}
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {sorted.map((ev) => {
          const until = timeUntilEvent(ev.ts);
          const isPast = ev.ts < Date.now();
          return (
            <div key={ev.id} style={{
              padding: '7px 14px',
              borderBottom: '1px solid var(--border)',
              opacity: isPast ? 0.5 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px',
                    borderRadius: 3, fontFamily: 'Space Mono, monospace',
                    background: ev.currency === 'USD' ? 'rgba(0,120,255,0.15)' : ev.currency === 'EUR' ? 'rgba(0,200,100,0.15)' : 'rgba(255,200,0,0.1)',
                    color: ev.currency === 'USD' ? '#60a5fa' : ev.currency === 'EUR' ? '#4ade80' : 'var(--gold)',
                  }}>
                    {ev.currency}
                  </span>
                  <span className={`tag tag-${ev.impact}`} style={{ fontSize: 8 }}>{ev.impact}</span>
                </div>
                <span style={{
                  fontFamily: 'Space Mono, monospace', fontSize: 10,
                  color: until === 'NOW' ? 'var(--sell)' : 'var(--gold)',
                  fontWeight: 700,
                }}>
                  {until}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 3 }}>{ev.title}</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {ev.forecast && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    F: <span style={{ color: 'var(--gold)' }}>{ev.forecast}</span>
                  </span>
                )}
                {ev.previous && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    P: <span style={{ color: 'var(--text-dim)' }}>{ev.previous}</span>
                  </span>
                )}
                {ev.actual && (
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                    A: <span style={{ color: 'var(--buy)' }}>{ev.actual}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
