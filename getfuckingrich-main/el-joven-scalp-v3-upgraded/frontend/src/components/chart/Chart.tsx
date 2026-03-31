import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../../store/marketStore';
import { useHistory } from '../../hooks/useMarketData';
import { subscribeLiveTick } from '../../utils/liveTickBus';

export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef    = useRef<ISeriesApi<'Histogram'> | null>(null);

  const symbol    = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const { data }  = useHistory(symbol, timeframe, 200);

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        fontFamily: 'Space Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,215,0,0.4)', labelBackgroundColor: '#1a1a28' },
        horzLine: { color: 'rgba(255,215,0,0.4)', labelBackgroundColor: '#1a1a28' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
    });

    const candles = chart.addCandlestickSeries({
      upColor:         '#00ff88',
      downColor:       '#ff3355',
      borderUpColor:   '#00ff88',
      borderDownColor: '#ff3355',
      wickUpColor:     '#00ff88',
      wickDownColor:   '#ff3355',
    });

    const volume = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: '#26a69a',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current    = chart;
    candleRef.current   = candles;
    volumeRef.current   = volume;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, []);

  // Load history data
  useEffect(() => {
    if (!data?.candles || !candleRef.current || !volumeRef.current) return;
    const sorted = [...data.candles].sort((a, b) => a.time - b.time);
    candleRef.current.setData(sorted as any);
    volumeRef.current.setData((sorted as any[]).map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,85,0.2)',
    })));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Live tick updates
  useEffect(() => {
    const unsub = subscribeLiveTick((tick) => {
      if (tick.symbol !== symbol || !candleRef.current) return;
      const time = Math.floor((tick.timestamp||Date.now()) / 1000) as unknown as number;
      try {
        candleRef.current.update({
          time: time as unknown as import('lightweight-charts').UTCTimestamp,
          open: tick.price, high: tick.price, low: tick.price, close: tick.price,
        });
      } catch { /* ignore */ }
    });
    return unsub;
  }, [symbol]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg-panel)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
