import { useEffect } from 'react';
import { useAlertStore } from '../store/alertStore';
import { useMarketStore } from '../store/marketStore';
import { useSignalStore } from '../store/signalStore';
import { useSounds } from './useSounds';
import { useUIStore } from '../store/uiStore';

export function useAlerts() {
  const alerts      = useAlertStore((s) => s.alerts);
  const triggerAlert = useAlertStore((s) => s.triggerAlert);
  const prices      = useMarketStore((s) => s.prices);
  const signals     = useSignalStore((s) => s.signals);
  const addToast    = useUIStore((s) => s.addToast);
  const { playBuy, playSell } = useSounds();

  useEffect(() => {
    for (const alert of alerts) {
      if (!alert.active || alert.triggered) continue;
      const price = prices[alert.symbol]?.price;

      if (alert.type === 'price_above' && price && alert.threshold && price >= alert.threshold) {
        triggerAlert(alert.id);
        addToast(`🔔 ${alert.symbol} above ${alert.threshold}`, 'info');
        playBuy();
      }
      if (alert.type === 'price_below' && price && alert.threshold && price <= alert.threshold) {
        triggerAlert(alert.id);
        addToast(`🔔 ${alert.symbol} below ${alert.threshold}`, 'info');
        playSell();
      }
    }
  }, [prices, alerts, triggerAlert, addToast, playBuy, playSell]);

  // Watch for signal alerts
  useEffect(() => {
    const latest = signals[0];
    if (!latest) return;
    for (const alert of alerts) {
      if (!alert.active || alert.triggered) continue;
      if (alert.symbol !== latest.symbol) continue;
      if (alert.type === 'signal_buy' && latest.signal === 'BUY') {
        triggerAlert(alert.id);
        addToast(`⚡ BUY signal on ${latest.symbol}`, 'buy');
        playBuy();
      }
      if (alert.type === 'signal_sell' && latest.signal === 'SELL') {
        triggerAlert(alert.id);
        addToast(`⚡ SELL signal on ${latest.symbol}`, 'sell');
        playSell();
      }
    }
  }, [signals, alerts, triggerAlert, addToast, playBuy, playSell]);
}
