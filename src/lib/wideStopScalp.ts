import { Candle, ChecklistStep, WideStopScalpSignal } from "./types";
import { ema, atr, rollingPrevLow } from "./indicators";

// Tunable constants — the 5 rules, in one place
const EMA_PERIOD = 20;
const EMA_TOLERANCE_PCT = 0.5; // entry filter: price must be within this % of the 20 EMA
const SL_LOOKBACK_CANDLES = 3; // SL = low of previous 3 closed 15m candles
const SL_BUFFER_PCT = 0.2; // minus 0.2% buffer below that low
const TP_RR_MULTIPLE = 1.5; // final TP = 1.5x the SL distance (guarantees R:R >= 1:1.5)
const ATR_PERIOD = 14;
const TP1_ATR_MULTIPLE = 1; // partial close (50%) at 1x ATR - also the breakeven trigger level (rules 3 & 4 share this level)
const BREAKEVEN_BUFFER_PCT = 0.1; // once triggered, new SL = entry + 0.1%
const EMA_SLOPE_LOOKBACK = 5; // candles back to check EMA is trending up (pullback, not counter-trend buy)

interface BuildWideStopScalpParams {
  symbol: string;
  candles: Candle[]; // 15m, most recent candle last
}

/**
 * Long-only wide-stop scalp for someone who can't watch the screen all day:
 * wait for a pullback to the 20 EMA in an uptrend, use a structural (not ATR) stop
 * so normal noise doesn't shake you out, then manage the trade mechanically -
 * partial off at 1x ATR + move to breakeven, let the rest run to a 1.5R target.
 */
export function buildWideStopScalpSignal({ symbol, candles }: BuildWideStopScalpParams): WideStopScalpSignal {
  const checklist: ChecklistStep[] = [];
  const now = Date.now();

  const emaSeries = ema(candles, EMA_PERIOD);
  const atrSeries = atr(candles, ATR_PERIOD);

  const lastIndex = candles.length - 1;
  const lastCandle = candles[lastIndex];
  const currentEma = emaSeries[lastIndex];
  const currentAtr = atrSeries[lastIndex];

  const hasIndicators = !isNaN(currentEma) && !isNaN(currentAtr);

  // --- Rule 5: Entry filter — within 0.5% of 20 EMA, and it's a pullback (EMA rising), not a breakout chase
  const distancePct = hasIndicators ? (Math.abs(lastCandle.close - currentEma) / currentEma) * 100 : Infinity;
  const withinBand = distancePct <= EMA_TOLERANCE_PCT;

  const emaPast = hasIndicators ? emaSeries[Math.max(0, lastIndex - EMA_SLOPE_LOOKBACK)] : NaN;
  const emaRising = hasIndicators && !isNaN(emaPast) && currentEma > emaPast;

  // A breakout candle punches to a new local high with an outsized range; a pullback candle doesn't.
  const recentHigh = Math.max(...candles.slice(Math.max(0, lastIndex - 10), lastIndex).map((c) => c.high));
  const isBreakoutCandle = hasIndicators && lastCandle.close > recentHigh && lastCandle.high - lastCandle.low > currentAtr * 1.5;

  const entryFilterPass = hasIndicators && withinBand && emaRising && !isBreakoutCandle;

  checklist.push({
    step: 1,
    label: "Entry Filter (near 20 EMA, pullback only)",
    status: !hasIndicators ? "PENDING" : entryFilterPass ? "PASS" : "FAIL",
    detail: !hasIndicators
      ? "Not enough candles to compute EMA/ATR yet"
      : `Price ${distancePct.toFixed(2)}% from 20 EMA (need <= ${EMA_TOLERANCE_PCT}%) | EMA ${emaRising ? "rising" : "flat/falling"} | ${isBreakoutCandle ? "breakout candle - skip" : "no breakout"}`,
  });

  // --- Rule 1: Stop loss — low of previous 3 closed 15m candles, minus 0.2% buffer
  const prevLow = rollingPrevLow(candles, SL_LOOKBACK_CANDLES, lastIndex);
  const stopLoss = prevLow !== null ? prevLow * (1 - SL_BUFFER_PCT / 100) : null;

  checklist.push({
    step: 2,
    label: "Stop Loss (prev 3x15m low - 0.2%)",
    status: stopLoss !== null ? "PASS" : "PENDING",
    detail: stopLoss !== null
      ? `Low of last ${SL_LOOKBACK_CANDLES} candles: ${prevLow!.toFixed(2)} -> SL ${stopLoss.toFixed(2)}`
      : "Not enough candle history for SL yet",
  });

  const entry = lastCandle.close;
  const slDistance = stopLoss !== null ? entry - stopLoss : null;

  // --- Rule 2: Take profit (final/TP2) = 1.5x the SL distance -> guarantees R:R >= 1:1.5
  const tp2 = slDistance !== null && slDistance > 0 ? entry + slDistance * TP_RR_MULTIPLE : null;
  const riskRewardRatio = slDistance !== null && slDistance > 0 && tp2 !== null ? (tp2 - entry) / slDistance : null;

  checklist.push({
    step: 3,
    label: "Take Profit (1.5x SL distance)",
    status: tp2 !== null ? "PASS" : "PENDING",
    detail: tp2 !== null
      ? `TP2 ${tp2.toFixed(2)} | R:R ${riskRewardRatio?.toFixed(2)}`
      : "Waiting on stop loss before TP can be set",
  });

  // --- Rule 4: Partial close - TP1 at 1x ATR
  const tp1 = hasIndicators ? entry + currentAtr * TP1_ATR_MULTIPLE : null;

  checklist.push({
    step: 4,
    label: "Partial Close (50% at TP1 = 1x ATR)",
    status: tp1 !== null ? "PASS" : "PENDING",
    detail: tp1 !== null
      ? `TP1 ${tp1.toFixed(2)} (sell 50%)${tp2 !== null && tp1 >= tp2 ? " - WARNING: TP1 is past TP2, structural SL is unusually tight" : ""}`
      : "Waiting on ATR",
  });

  // --- Rule 3: Breakeven trigger - same level as TP1 (1x ATR), moves SL to entry + 0.1%
  const breakevenTrigger = tp1;
  const breakevenStopLoss = entry * (1 + BREAKEVEN_BUFFER_PCT / 100);

  checklist.push({
    step: 5,
    label: "Breakeven (move SL to entry+0.1% at 1x ATR)",
    status: breakevenTrigger !== null ? "PASS" : "PENDING",
    detail: breakevenTrigger !== null
      ? `At ${breakevenTrigger.toFixed(2)}, move SL -> ${breakevenStopLoss.toFixed(2)}`
      : "Waiting on ATR",
  });

  const allReady = entryFilterPass && stopLoss !== null && tp2 !== null && tp1 !== null;

  return {
    symbol,
    strategy: "WIDE_STOP_SCALP",
    side: allReady ? "LONG" : "NONE",
    trend4h: "RANGING", // not used by this strategy - EMA pullback is the trend filter instead
    structureConfirmed: entryFilterPass,
    lastStructureEvent: null,
    entryZone: null,
    entry: allReady ? entry : null,
    stopLoss: allReady ? stopLoss : null,
    takeProfit: allReady ? tp2 : null,
    riskRewardRatio,
    checklist,
    readiness: allReady ? "READY" : hasIndicators ? "WAITING" : "NO_SETUP",
    generatedAt: now,
    atr: hasIndicators ? currentAtr : null,
    ema20: hasIndicators ? currentEma : null,
    tp1,
    tp2,
    breakevenTrigger,
    breakevenStopLoss,
  };
}
