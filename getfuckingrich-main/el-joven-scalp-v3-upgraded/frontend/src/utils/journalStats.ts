import type { Trade, JournalStats } from '../types/journal';

export function computeStats(trades: Trade[]): JournalStats {
  const closed = trades.filter((t) => t.status === 'closed');
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const totalPnl = closed.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
  const avgWin   = wins.length   ? wins.reduce((a, t) => a + (t.pnl ?? 0), 0) / wins.length : 0;
  const avgLoss  = losses.length ? losses.reduce((a, t) => a + (t.pnl ?? 0), 0) / losses.length : 0;
  const grossWin  = wins.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;

  return {
    total: closed.length,
    wins:  wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    totalPnl,
    avgWin,
    avgLoss,
    profitFactor,
    openTrades: trades.filter((t) => t.status === 'open').length,
  };
}
