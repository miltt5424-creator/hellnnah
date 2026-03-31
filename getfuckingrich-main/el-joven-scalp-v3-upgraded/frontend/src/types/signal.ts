export type SignalDirection = 'BUY' | 'SELL' | 'HOLD';
export type AIEngine = 'gemini' | 'grok' | 'mistral' | 'openrouter' | 'auto';
export type TFBias = 'bull' | 'bear' | 'neutral';

export interface TradingSignal {
  id: string;
  symbol: string;
  timeframe: string;
  signal: SignalDirection;
  confidence: number;
  compositeScore: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  keyLevels?: number[];
  timeframesBias?: { '1min': TFBias; '5min': TFBias; '15min': TFBias };
  indicators?: Record<string, number>;
  timestamp: number;
  aiEngine: string;
  strategy?: any;
  price?: number;
  rr?: number;
  locked?: boolean;
  newsBlocked?: boolean;
  spreadBlocked?: boolean;
  source?: string;
}

export interface SignalState {
  signals: TradingSignal[];
  selectedAI: AIEngine;
  isGenerating: boolean;
  addSignal: (s: TradingSignal) => void;
  setSelectedAI: (ai: AIEngine) => void;
  setGenerating: (v: boolean) => void;
}
