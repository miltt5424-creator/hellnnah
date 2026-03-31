export interface PriceData {
  price: number;
  bid: number;
  ask: number;
  change: number;
  changePct: number;
  volume: number;
  source: string;
  ts: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Orderbook {
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

export interface Instrument {
  symbol: string;
  name: string;
  icon: string;
  decimals: number;
  category: 'commodities' | 'forex' | 'crypto' | 'stocks' | 'indices';
}

export type Timeframe = '1min' | '5min' | '15min' | '1h' | '4h' | '1d';

export interface MarketState {
  symbol: string;
  timeframe: Timeframe;
  prices: Record<string, PriceData>;
  orderbook: Orderbook | null;
  setSymbol: (symbol: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  updatePrice: (symbol: string, data: PriceData) => void;
  updateOrderbook: (ob: Orderbook) => void;
}
