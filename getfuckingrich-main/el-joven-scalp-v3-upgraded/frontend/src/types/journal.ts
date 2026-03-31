export interface Trade {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  entryPrice?: number;
  exit?: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  size?: number;
  lotSize?: number;
  pnl?: number;
  status: 'open' | 'closed';
  openedAt: number;
  closedAt?: number;
  notes?: string;
  tags?: string[];
}

export interface JournalStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  openTrades: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
}

export interface JournalState {
  trades: Trade[];
  stats: JournalStats | null;
  addTrade: (trade: Trade) => void;
  updateTrade: (id: string, updates: Partial<Trade>) => void;
  removeTrade: (id: string) => void;
  setTrades: (trades: Trade[]) => void;
  setStats: (stats: JournalStats) => void;
}
