import { create } from 'zustand';
import type { SignalState, TradingSignal, AIEngine } from '../types/signal';

export const useSignalStore = create<SignalState>((set) => ({
  signals:      [],
  selectedAI:   'auto',
  isGenerating: false,

  addSignal: (signal: TradingSignal) =>
    set((state) => {
      const last = state.signals[0];
      if (last && last.symbol === signal.symbol && last.signal === signal.signal &&
          signal.timestamp - last.timestamp < 30000) return state;
      return { signals: [signal, ...state.signals].slice(0, 100) };
    }),

  setSelectedAI:  (selectedAI: AIEngine) => set({ selectedAI }),
  setGenerating:  (isGenerating: boolean) => set({ isGenerating }),
}));
