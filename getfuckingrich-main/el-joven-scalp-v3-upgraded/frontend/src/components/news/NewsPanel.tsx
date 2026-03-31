import React from 'react';
import { useNews } from '../../hooks/useMarketData';

interface NewsItem {
  id: number;
  title: string;
  source: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  ts: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

export default function NewsPanel() {
  const { data, isLoading } = useNews();
  const news = (data?.news || []) as NewsItem[];

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-title">📰 MARKET NEWS</span>
        {isLoading && <div className="spinner" style={{ width: 12, height: 12 }} />}
      </div>
      <div style={{ overflow: 'auto', flex: 1 }}>
        {news.map((item) => (
          <div key={item.id} style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            transition: 'var(--t-fast)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
                {item.source} • {timeAgo(item.ts)}
              </span>
              <span className={`tag tag-${item.impact}`} style={{ fontSize: 8 }}>
                {item.impact}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {item.title}
            </div>
            <div style={{ marginTop: 3 }}>
              <span className={`tag tag-${item.sentiment === 'bullish' ? 'buy' : item.sentiment === 'bearish' ? 'sell' : 'hold'}`} style={{ fontSize: 8 }}>
                {item.sentiment}
              </span>
            </div>
          </div>
        ))}
        {!isLoading && news.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            No news available
          </div>
        )}
      </div>
    </div>
  );
}
