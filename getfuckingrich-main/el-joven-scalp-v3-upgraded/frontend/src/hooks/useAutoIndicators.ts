import { useEffect, useRef } from 'react';
import { useSignalStore } from '../store/signalStore';
import { useMarketStore } from '../store/marketStore';
import type { TradingSignal } from '../types/signal';

/**
 * Auto-fetches a technical-only signal on mount and when symbol changes
 * so that IndicatorsPanel + CompositeScorePanel show data immediately
 * without the user having to manually click "Generate Signal"
 */
export function useAutoIndicators() {
  const addSignal    = useSignalStore((s) => s.addSignal);
  const signals      = useSignalStore((s) => s.signals);
  const symbol       = useMarketStore((s) => s.symbol);
  const timeframe    = useMarketStore((s) => s.timeframe);
  const lastSymbol   = useRef<string>('');
  const fetching     = useRef(false);

  useEffect(() => {
    // Only fetch if no signal exists for this symbol yet
    const hasSignal = signals.some((s) => s.symbol === symbol);
    if (hasSignal && lastSymbol.current === symbol) return;
    if (fetching.current) return;

    fetching.current = true;
    lastSymbol.current = symbol;

    fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ symbol, timeframe, ai: 'auto', mode: 'indicators_only' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          addSignal({ ...data, id: `${data.symbol}-${data.timestamp}` } as TradingSignal);
        }
      })
      .catch(() => {}) // silent — user can still generate manually
      .finally(() => { fetching.current = false; });

  }, [symbol, timeframe]);
}
