import React, { useEffect, useRef } from 'react';
import { useMarketStore } from '../../store/marketStore';

const TV_SYMBOLS: Record<string, string> = {
  'BTC/USD':    'BINANCE:BTCUSDT',
  'ETH/USD':    'BINANCE:ETHUSDT',
  'SOL/USD':    'BINANCE:SOLUSDT',
  'BNB/USD':    'BINANCE:BNBUSDT',
  'XAU/USD':    'OANDA:XAUUSD',
  'XAG/USD':    'OANDA:XAGUSD',
  'EUR/USD':    'OANDA:EURUSD',
  'GBP/USD':    'OANDA:GBPUSD',
  'USD/JPY':    'OANDA:USDJPY',
  'CHF/JPY':    'OANDA:CHFJPY',
  'AUD/USD':    'OANDA:AUDUSD',
  'NAS100/USD': 'NASDAQ:NDX',
  'SPX500/USD': 'SP:SPX',
  'US30/USD':   'DJ:DJI',
  'AAPL/USD':   'NASDAQ:AAPL',
  'TSLA/USD':   'NASDAQ:TSLA',
  'NVDA/USD':   'NASDAQ:NVDA',
};

export default function TradingViewWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const symbol = useMarketStore((s) => s.symbol);
  const tvSym  = TV_SYMBOLS[symbol] || 'BINANCE:BTCUSDT';

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSym,
      interval: '5',
      timezone: 'UTC',
      theme: 'dark',
      style: '1',
      locale: 'fr',
      toolbar_bg: '#1a1a2e',
      enable_publishing: false,
      allow_symbol_change: true,
      container_id: 'tradingview_widget',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_top_toolbar: false,
      hide_side_toolbar: true,
      withdateranges: false,
      save_image: false,
      studies: [],
    });
    containerRef.current.appendChild(script);
  }, [tvSym]);

  return (
    <div
      className="tradingview-widget-container" id="tradingview_widget"
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
