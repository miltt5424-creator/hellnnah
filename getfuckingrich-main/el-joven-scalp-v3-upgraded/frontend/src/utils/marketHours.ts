export interface TradingSession {
  name: string;
  open: number;
  close: number;
  color: string;
}

export const SESSIONS: TradingSession[] = [
  { name: 'Sydney',   open: 21, close: 6,  color: '#4ade80' },
  { name: 'Tokyo',    open: 0,  close: 9,  color: '#60a5fa' },
  { name: 'London',   open: 7,  close: 16, color: '#f59e0b' },
  { name: 'New York', open: 12, close: 21, color: '#f87171' },
];

export function getActiveSessions(): TradingSession[] {
  const now    = new Date();
  const utcDay  = now.getUTCDay();
  const utcHour = now.getUTCHours();
  // Weekend: no forex sessions (Saturday 0-20h UTC, Sunday 0-20h UTC)
  if (utcDay === 0) return [];
  if (utcDay === 6 && utcHour < 21) return [];
  return SESSIONS.filter((s) => {
    if (s.open < s.close) return utcHour >= s.open && utcHour < s.close;
    return utcHour >= s.open || utcHour < s.close;
  });
}

export function isMarketOpen(symbol: string): boolean {
  const crypto = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'BTCUSD', 'ETHUSD', 'SOLUSD'];
  if (crypto.includes(symbol)) return true; // crypto = 24/7

  const now     = new Date();
  const utcDay  = now.getUTCDay();
  const utcHour = now.getUTCHours();

  // Forex/commodities/indices: closed on weekends
  if (utcDay === 0) return false;                        // Sunday always closed
  if (utcDay === 6 && utcHour < 21) return false;       // Saturday until 21h UTC closed
  // Friday close at 21h UTC
  if (utcDay === 5 && utcHour >= 21) return false;

  return true;
}

export function getMarketStatus(symbol: string): { open: boolean; label: string; reason: string } {
  const crypto = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
  if (crypto.includes(symbol)) return { open: true, label: 'OPEN', reason: '24/7' };

  const now     = new Date();
  const utcDay  = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const days    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  if (utcDay === 0) return { open: false, label: 'CLOSED', reason: 'Weekend — opens Sun 21:00 UTC' };
  if (utcDay === 6 && utcHour < 21) return { open: false, label: 'CLOSED', reason: `Weekend — opens in ${21-utcHour}h` };
  if (utcDay === 5 && utcHour >= 21) return { open: false, label: 'CLOSED', reason: 'Weekend — opens Sun 21:00 UTC' };

  return { open: true, label: 'OPEN', reason: days[utcDay] };
}

export function timeUntilEvent(eventTs: number): string {
  const diff = eventTs - Date.now();
  if (diff <= 0) return 'NOW';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
