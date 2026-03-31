export type TradeSignal = 'BUY' | 'SELL' | 'HOLD';
export type Verdict = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export interface TradeVerdict {
    signal: TradeSignal;
    verdict: Verdict;
    confidence: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    rr: number;
    horizon: string;
    invalidation: string;
    reasons: string[];
}

function clamp(v: number, min: number, max: number) {
    return Math.min(max, Math.max(min, v));
}

export function buildTradeVerdict(params: {
    currentPrice: number; signalHint?: string | null;
    confidenceHint?: number | null; atr?: number | null;
    trendBias?: number; reasons?: string[];
}): TradeVerdict {
    const { currentPrice, signalHint, confidenceHint, atr, trendBias = 0, reasons = [] } = params;
    const atrValue = atr && atr > 0 ? atr : currentPrice * 0.002;
    const h = signalHint?.toUpperCase();
    let signal: TradeSignal = 'HOLD';
    if (h === 'BUY' || trendBias > 15) signal = 'BUY';
    else if (h === 'SELL' || trendBias < -15) signal = 'SELL';
    const confidence = clamp(Math.round(confidenceHint ?? 50 + Math.abs(trendBias) * 0.5), 0, 100);
    const rr = clamp(1.5 + (confidence / 100) * 1.5, 1.2, 3.0);
    let stopLoss = signal === 'BUY' ? currentPrice - atrValue * 1.5 : currentPrice + atrValue * 1.5;
    let takeProfit = signal === 'BUY' ? currentPrice + atrValue * 1.5 * rr : currentPrice - atrValue * 1.5 * rr;
    if (signal === 'HOLD') { stopLoss = currentPrice - atrValue * 2; takeProfit = currentPrice + atrValue * 2; }
    const risk = Math.abs(currentPrice - stopLoss);
    const reward = Math.abs(takeProfit - currentPrice);
    const verdict: Verdict = signal === 'BUY' && confidence >= 70 ? 'STRONG_BUY' : signal === 'BUY' ? 'BUY' : signal === 'SELL' && confidence >= 70 ? 'STRONG_SELL' : signal === 'SELL' ? 'SELL' : 'HOLD';
    return {
        signal, verdict, confidence,
        entry: parseFloat(currentPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        takeProfit: parseFloat(takeProfit.toFixed(2)),
        rr: risk > 0 ? parseFloat((reward / risk).toFixed(2)) : rr,
        horizon: confidence > 70 ? '15–30 min' : '5–15 min',
        invalidation: signal === 'BUY' ? `Close below ${stopLoss.toFixed(2)}` : signal === 'SELL' ? `Close above ${stopLoss.toFixed(2)}` : 'No active trade',
        reasons,
    };
}

export function scoreToVerdict(score: number): Verdict {
    if (score >= 70) return 'STRONG_BUY'; if (score >= 40) return 'BUY';
    if (score <= -70) return 'STRONG_SELL'; if (score <= -40) return 'SELL';
    return 'HOLD';
}
export function verdictColor(v: Verdict): string {
    return v === 'STRONG_BUY' ? '#00ff88' : v === 'BUY' ? '#4ade80' : v === 'STRONG_SELL' ? '#ff3355' : v === 'SELL' ? '#f87171' : '#94a3b8';
}
export function verdictLabel(v: Verdict): string { return v.replace('_', ' '); }
export function signalColor(s: TradeSignal): string {
    return s === 'BUY' ? 'var(--buy)' : s === 'SELL' ? 'var(--sell)' : 'var(--hold)';
}
