import { Position, PositionMetrics } from "./types";

const MAINTENANCE_MARGIN_RATE = 0.005; // 0.5% simplified estimate, varies by exchange bracket

export function computePositionMetrics(position: Position, livePrice: number | null): PositionMetrics {
  const { side, leverage, entryPrice, stopLoss, takeProfit, margin, exitPrice, status, partialClosed } = position;

  // After a 50% partial close, the remaining runner is half the original size -
  // everything downstream (size, qty, risk, reward, pnl) scales off the half that's left.
  const effectiveMargin = partialClosed ? margin / 2 : margin;

  const positionSize = effectiveMargin * leverage;
  const quantity = entryPrice > 0 ? positionSize / entryPrice : 0;

  const risk = Math.abs(entryPrice - stopLoss) * quantity;
  const reward = Math.abs(takeProfit - entryPrice) * quantity;
  const riskReward = risk > 0 ? reward / risk : null;

  const liquidationPrice =
    side === "LONG"
      ? entryPrice * (1 - 1 / leverage + MAINTENANCE_MARGIN_RATE)
      : entryPrice * (1 + 1 / leverage - MAINTENANCE_MARGIN_RATE);

  const markForPnl = status === "CLOSED" ? exitPrice ?? entryPrice : livePrice ?? entryPrice;

  const pnl = side === "LONG" ? (markForPnl - entryPrice) * quantity : (entryPrice - markForPnl) * quantity;
  const pnlPct = effectiveMargin > 0 ? (pnl / effectiveMargin) * 100 : 0;

  return { positionSize, quantity, risk, reward, riskReward, liquidationPrice, pnl, pnlPct };
}

export function emptyPosition(): Position {
  return {
    id: crypto.randomUUID(),
    coin: "BTCUSDT",
    side: "LONG",
    leverage: 10,
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    margin: 0,
    exitPrice: null,
    status: "OPEN",
    createdAt: Date.now(),
    strategy: "SMC",
    atrAtEntry: null,
    tp1: null,
    tp2: null,
    breakevenMoved: false,
    partialClosed: false,
  };
}

const STORAGE_KEY = "smc-terminal-positions";

export function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Position[]) : [];
  } catch {
    return [];
  }
}

export function savePositions(positions: Position[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}
