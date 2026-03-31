// priceFormat.ts
export function formatPrice(price: number, decimals = 2): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatChange(change: number, decimals = 2): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(decimals)}`;
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatPnl(pnl: number): string {
  return (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
}
