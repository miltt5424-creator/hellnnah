import { create } from 'zustand';
import type { MarketState, PriceData, Orderbook, Timeframe } from '../types/market';

export const useMarketStore = create<MarketState>((set) => ({
  symbol:    'XAU/USD',
  timeframe: '1min',
  prices:    {},
  orderbook: null,

  setSymbol:    (symbol)    => set({ symbol }),
  setTimeframe: (timeframe: Timeframe) => set({ timeframe }),

  updatePrice: (symbol, data: PriceData) =>
    set((state) => ({ prices: { ...state.prices, [symbol]: data } })),

  updateOrderbook: (ob: Orderbook) => set({ orderbook: ob }),
}));
