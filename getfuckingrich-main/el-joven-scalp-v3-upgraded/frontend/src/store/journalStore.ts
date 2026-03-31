import { create } from 'zustand';
import type { JournalState, Trade, JournalStats } from '../types/journal';

export const useJournalStore = create<JournalState>((set) => ({
  trades: [],
  stats: null,
  addTrade: (trade: Trade) =>
    set((state: JournalState) => ({ trades: [trade, ...state.trades] })),
  updateTrade: (id: string, updates: Partial<Trade>) =>
    set((state: JournalState) => ({
      trades: state.trades.map((t: Trade) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTrade: (id: string) =>
    set((state: JournalState) => ({ trades: state.trades.filter((t: Trade) => t.id !== id) })),
  setTrades: (trades: Trade[]) => set({ trades }),
  setStats: (stats: JournalStats) => set({ stats }),
}));
