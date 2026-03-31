export interface RiskParams {
  accountBalance: number;
  riskPercent: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  pipValue?: number;
}

export interface RiskResult {
  riskAmount: number;
  lotSize: number;
  slDistance: number;
  tpDistance: number | null;
  rrRatio: number | null;
  potentialLoss: number;
  potentialGain: number | null;
}

export function calculateRisk(params: RiskParams): RiskResult {
  const {
    accountBalance,
    riskPercent,
    entryPrice,
    stopLoss,
    takeProfit,
    pipValue = 1,
  } = params;

  const riskAmount  = accountBalance * (riskPercent / 100);
  const slDistance  = Math.abs(entryPrice - stopLoss);
  const tpDistance  = takeProfit ? Math.abs(takeProfit - entryPrice) : null;
  const rrRatio     = tpDistance && slDistance > 0 ? tpDistance / slDistance : null;
  const lotSize     = slDistance > 0 ? riskAmount / (slDistance * pipValue * 100) : 0;

  return {
    riskAmount,
    lotSize:       Math.round(lotSize * 100) / 100,
    slDistance,
    tpDistance,
    rrRatio:       rrRatio ? Math.round(rrRatio * 100) / 100 : null,
    potentialLoss: -riskAmount,
    potentialGain: rrRatio ? riskAmount * rrRatio : null,
  };
}
