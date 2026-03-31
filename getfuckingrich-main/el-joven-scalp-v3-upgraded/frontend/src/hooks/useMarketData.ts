import { useQuery } from '@tanstack/react-query';
import type { Candle } from '../types/market';

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export function usePrice(symbol: string) {
  return useQuery({
    queryKey: ['price', symbol],
    queryFn:  () => apiFetch<{ price: number; bid: number; ask: number; change: number; changePct: number }>(`/api/price?symbol=${encodeURIComponent(symbol)}`),
    refetchInterval: 2000,
    staleTime: 1000,
  });
}

export function useHistory(symbol: string, interval: string, outputsize = 200) {
  return useQuery({
    queryKey: ['history', symbol, interval],
    queryFn:  () => apiFetch<{ candles: Candle[] }>(`/api/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}`),
    staleTime: 30000,
    refetchInterval: 30000,
  });
}

export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn:  () => apiFetch<{ news: unknown[] }>('/api/news?limit=10'),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useCalendar() {
  return useQuery({
    queryKey: ['calendar'],
    queryFn:  () => apiFetch<{ events: unknown[] }>('/api/calendar'),
    refetchInterval: 300000,
    staleTime: 60000,
  });
}
