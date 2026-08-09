export interface RiskCalcInput {
  accountBalance: number;
  riskPercent: number; // e.g. 1 or 2
  entryPrice: number;
  stopLossPrice: number;
  leverage: number;
  takeProfitPrice?: number;
}

export interface RiskCalcResult {
  riskAmount: number;
  priceDistance: number;
  priceDistancePct: number;
  positionSizeCoin: number;
  positionSizeUSD: number;
  marginRequired: number;
  effectiveLeverageNeeded: number;
  rewardAmount: number | null;
  riskRewardRatio: number | null;
  warnings: string[];
}

export function calculateRisk(input: RiskCalcInput): RiskCalcResult {
  const { accountBalance, riskPercent, entryPrice, stopLossPrice, leverage, takeProfitPrice } = input;
  const warnings: string[] = [];

  const priceDistance = Math.abs(entryPrice - stopLossPrice);
  const priceDistancePct = entryPrice > 0 ? (priceDistance / entryPrice) * 100 : 0;

  const riskAmount = accountBalance * (riskPercent / 100);

  const positionSizeCoin = priceDistance > 0 ? riskAmount / priceDistance : 0;
  const positionSizeUSD = positionSizeCoin * entryPrice;
  const marginRequired = leverage > 0 ? positionSizeUSD / leverage : positionSizeUSD;
  const effectiveLeverageNeeded = accountBalance > 0 ? positionSizeUSD / accountBalance : 0;

  let rewardAmount: number | null = null;
  let riskRewardRatio: number | null = null;

  if (takeProfitPrice !== undefined) {
    rewardAmount = Math.abs(takeProfitPrice - entryPrice) * positionSizeCoin;
    riskRewardRatio = riskAmount > 0 ? rewardAmount / riskAmount : null;
  }

  if (riskPercent > 2) {
    warnings.push("Risking more than 2% per trade goes against the plan's own rule.");
  }
  if (marginRequired > accountBalance) {
    warnings.push("Margin required exceeds account balance at this leverage — reduce size or raise leverage.");
  }
  if (priceDistancePct > 0 && priceDistancePct < 0.05) {
    warnings.push("Stop is extremely tight relative to price — check the entry zone width.");
  }
  if (riskRewardRatio !== null && riskRewardRatio < 1.5) {
    warnings.push("R:R below 1.5 — marginal setup even if the win rate is decent.");
  }

  return {
    riskAmount,
    priceDistance,
    priceDistancePct,
    positionSizeCoin,
    positionSizeUSD,
    marginRequired,
    effectiveLeverageNeeded,
    rewardAmount,
    riskRewardRatio,
    warnings,
  };
}
