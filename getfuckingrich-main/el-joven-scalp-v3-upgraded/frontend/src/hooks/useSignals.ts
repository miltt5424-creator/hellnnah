import { useCallback, useState } from 'react';
import { useSignalStore } from '../store/signalStore';
import { useMarketStore } from '../store/marketStore';
import type { TradingSignal } from '../types/signal';

export function useSignalGenerator() {
  const [error, setError]   = useState<string | null>(null);
  const addSignal           = useSignalStore((s) => s.addSignal);
  const setGenerating       = useSignalStore((s) => s.setGenerating);
  const isGenerating        = useSignalStore((s) => s.isGenerating);
  const selectedAI          = useSignalStore((s) => s.selectedAI);
  const symbol              = useMarketStore((s) => s.symbol);
  const timeframe           = useMarketStore((s) => s.timeframe);

  const generate = useCallback(async () => {
    if (isGenerating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol, timeframe, ai: selectedAI }),
      });
      if (!res.ok) throw new Error(`Signal API error ${res.status}`);
      const data = await res.json();
      if (data.success) {
        addSignal({ ...data, id: `${data.symbol}-${data.timestamp}` } as TradingSignal);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur signal');
    } finally {
      setGenerating(false);
    }
  }, [isGenerating, symbol, timeframe, selectedAI, addSignal, setGenerating]);

  return { generate, isGenerating, error };
}
