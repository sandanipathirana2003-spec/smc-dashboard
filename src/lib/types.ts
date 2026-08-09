export interface Candle {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TrendDirection = "UPTREND" | "DOWNTREND" | "RANGING";

export interface SwingPoint {
  time: number;
  price: number;
  type: "HIGH" | "LOW";
  index: number;
}

export interface KeyLevel {
  price: number;
  type: "SUPPORT" | "RESISTANCE" | "LIQUIDITY_BUY_SIDE" | "LIQUIDITY_SELL_SIDE";
  time: number;
  touches: number;
}

export interface StructureEvent {
  time: number;
  price: number;
  type: "BOS" | "CHOCH";
  direction: "BULLISH" | "BEARISH";
  index: number;
}

export interface OrderBlock {
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  type: "BULLISH" | "BEARISH";
  mitigated: boolean;
  index: number;
}

export interface FairValueGap {
  startTime: number;
  endTime: number;
  top: number;
  bottom: number;
  type: "BULLISH" | "BEARISH";
  filled: boolean;
  index: number;
}

export interface EntryZone {
  type: "ORDER_BLOCK" | "FVG";
  top: number;
  bottom: number;
  direction: "BULLISH" | "BEARISH";
  time: number;
}

export type ChecklistStepStatus = "PASS" | "FAIL" | "PENDING";

export interface ChecklistStep {
  step: number;
  label: string;
  status: ChecklistStepStatus;
  detail: string;
}

export interface TradeSignal {
  symbol: string;
  side: "LONG" | "SHORT" | "NONE";
  trend4h: TrendDirection;
  structureConfirmed: boolean;
  lastStructureEvent: StructureEvent | null;
  entryZone: EntryZone | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  checklist: ChecklistStep[];
  readiness: "READY" | "WAITING" | "NO_SETUP";
  generatedAt: number;
}

export interface FuturesContext {
  symbol: string;
  markPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  openInterest: number;
}

export type PositionSide = "LONG" | "SHORT";
export type PositionStatus = "OPEN" | "CLOSED";

export interface Position {
  id: string;
  coin: string; // e.g. BTCUSDT
  side: PositionSide;
  leverage: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  margin: number;
  exitPrice: number | null;
  status: PositionStatus;
  createdAt: number;
  // Wide-Stop Scalp management (optional - only used when strategy is WIDE_STOP_SCALP)
  strategy?: StrategyType;
  atrAtEntry?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  breakevenMoved?: boolean;
  partialClosed?: boolean;
}

export interface PositionMetrics {
  positionSize: number;
  quantity: number;
  risk: number;
  reward: number;
  riskReward: number | null;
  liquidationPrice: number;
  pnl: number;
  pnlPct: number;
}

export type StrategyType = "SMC" | "WIDE_STOP_SCALP";

export interface WideStopScalpSignal extends TradeSignal {
  strategy: "WIDE_STOP_SCALP";
  atr: number | null;
  ema20: number | null;
  tp1: number | null; // partial close target, entry + 1x ATR
  tp2: number | null; // final target, entry + 1.5x SL distance
  breakevenTrigger: number | null; // same level as tp1
  breakevenStopLoss: number | null; // entry + 0.1%
}

