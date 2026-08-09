import {
  Candle,
  SwingPoint,
  TrendDirection,
  KeyLevel,
  StructureEvent,
  OrderBlock,
  FairValueGap,
} from "./types";

/**
 * Fractal swing point detection.
 * A candle at index i is a swing HIGH if its high is the max within [i-lookback, i+lookback].
 * Symmetric for swing LOW.
 */
export function findSwingPoints(candles: Candle[], lookback = 2): SwingPoint[] {
  const points: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const current = candles[i];

    const isHigh = window.every((c) => current.high >= c.high);
    const isLow = window.every((c) => current.low <= c.low);

    if (isHigh) {
      points.push({ time: current.time, price: current.high, type: "HIGH", index: i });
    } else if (isLow) {
      points.push({ time: current.time, price: current.low, type: "LOW", index: i });
    }
  }

  // Collapse consecutive same-type points, keeping the more extreme one
  const collapsed: SwingPoint[] = [];
  for (const p of points) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.type === p.type) {
      if (p.type === "HIGH" && p.price > last.price) collapsed[collapsed.length - 1] = p;
      if (p.type === "LOW" && p.price < last.price) collapsed[collapsed.length - 1] = p;
    } else {
      collapsed.push(p);
    }
  }

  return collapsed;
}

/**
 * Trend from the last 4 alternating swing points.
 * Higher-Highs + Higher-Lows -> UPTREND. Lower-Highs + Lower-Lows -> DOWNTREND. Else RANGING.
 */
export function detectTrend(swingPoints: SwingPoint[]): TrendDirection {
  const highs = swingPoints.filter((p) => p.type === "HIGH").slice(-2);
  const lows = swingPoints.filter((p) => p.type === "LOW").slice(-2);

  if (highs.length < 2 || lows.length < 2) return "RANGING";

  const higherHigh = highs[1].price > highs[0].price;
  const higherLow = lows[1].price > lows[0].price;
  const lowerHigh = highs[1].price < highs[0].price;
  const lowerLow = lows[1].price < lows[0].price;

  if (higherHigh && higherLow) return "UPTREND";
  if (lowerHigh && lowerLow) return "DOWNTREND";
  return "RANGING";
}

/**
 * Key levels: clusters recent swing highs/lows into support/resistance,
 * and tags the most recent unbroken swing high/low as a liquidity pool.
 */
export function findKeyLevels(swingPoints: SwingPoint[], tolerancePct = 0.15): KeyLevel[] {
  const levels: KeyLevel[] = [];
  const recent = swingPoints.slice(-20);

  for (const p of recent) {
    const existing = levels.find(
      (l) => Math.abs(l.price - p.price) / p.price * 100 < tolerancePct
    );
    if (existing) {
      existing.touches += 1;
      existing.time = p.time;
    } else {
      levels.push({
        price: p.price,
        type: p.type === "HIGH" ? "RESISTANCE" : "SUPPORT",
        time: p.time,
        touches: 1,
      });
    }
  }

  // Tag the most recent swing high/low as liquidity (stop-hunt targets)
  const lastHigh = [...recent].reverse().find((p) => p.type === "HIGH");
  const lastLow = [...recent].reverse().find((p) => p.type === "LOW");

  if (lastHigh) {
    levels.push({
      price: lastHigh.price,
      type: "LIQUIDITY_BUY_SIDE",
      time: lastHigh.time,
      touches: 1,
    });
  }
  if (lastLow) {
    levels.push({
      price: lastLow.price,
      type: "LIQUIDITY_SELL_SIDE",
      time: lastLow.time,
      touches: 1,
    });
  }

  return levels.sort((a, b) => b.price - a.price);
}

/**
 * BOS / CHoCH detection by walking candles against the running swing structure.
 * BOS  = close breaks the last swing point in the direction of the prevailing trend (continuation).
 * CHoCH = close breaks the last swing point against the prevailing trend (possible reversal).
 */
export function detectStructureEvents(
  candles: Candle[],
  swingPoints: SwingPoint[]
): StructureEvent[] {
  const events: StructureEvent[] = [];
  let trend: TrendDirection = "RANGING";

  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;

  const swingByIndex = new Map<number, SwingPoint>();
  swingPoints.forEach((p) => swingByIndex.set(p.index, p));

  for (let i = 0; i < candles.length; i++) {
    const sp = swingByIndex.get(i);
    if (sp) {
      if (sp.type === "HIGH") lastHigh = sp;
      else lastLow = sp;
    }

    const candle = candles[i];

    if (lastHigh && candle.close > lastHigh.price && i > lastHigh.index) {
      const direction = "BULLISH";
      const type = trend === "DOWNTREND" || trend === "RANGING" ? "CHOCH" : "BOS";
      events.push({ time: candle.time, price: candle.close, type, direction, index: i });
      trend = "UPTREND";
      lastHigh = null; // consumed
    } else if (lastLow && candle.close < lastLow.price && i > lastLow.index) {
      const direction = "BEARISH";
      const type = trend === "UPTREND" || trend === "RANGING" ? "CHOCH" : "BOS";
      events.push({ time: candle.time, price: candle.close, type, direction, index: i });
      trend = "DOWNTREND";
      lastLow = null; // consumed
    }
  }

  return events;
}

/**
 * Order blocks: the last opposite-colour candle before an impulsive move
 * that produced a structure break (BOS/CHoCH).
 */
export function detectOrderBlocks(
  candles: Candle[],
  events: StructureEvent[]
): OrderBlock[] {
  const blocks: OrderBlock[] = [];

  for (const event of events) {
    const wantBearishCandle = event.direction === "BULLISH"; // bullish move needs down-candle OB
    let obIndex = -1;

    for (let j = event.index - 1; j >= Math.max(0, event.index - 8); j--) {
      const c = candles[j];
      const isBearish = c.close < c.open;
      const isBullish = c.close > c.open;
      if (wantBearishCandle && isBearish) {
        obIndex = j;
        break;
      }
      if (!wantBearishCandle && isBullish) {
        obIndex = j;
        break;
      }
    }

    if (obIndex >= 0) {
      const c = candles[obIndex];
      blocks.push({
        startTime: c.time,
        endTime: c.time,
        high: c.high,
        low: c.low,
        type: event.direction,
        mitigated: false,
        index: obIndex,
      });
    }
  }

  // Mark mitigation: price has traded back through the block since it formed
  for (const ob of blocks) {
    for (let k = ob.index + 1; k < candles.length; k++) {
      const c = candles[k];
      if (ob.type === "BULLISH" && c.low <= ob.high && c.low >= ob.low) {
        ob.mitigated = true;
        break;
      }
      if (ob.type === "BEARISH" && c.high >= ob.low && c.high <= ob.high) {
        ob.mitigated = true;
        break;
      }
    }
  }

  return blocks;
}

/**
 * Fair Value Gap: 3-candle imbalance.
 * Bullish FVG: candle[i-1].high < candle[i+1].low (gap up, price likely to return).
 * Bearish FVG: candle[i-1].low > candle[i+1].high (gap down).
 */
export function detectFVGs(candles: Candle[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];

    if (prev.high < next.low) {
      gaps.push({
        startTime: prev.time,
        endTime: next.time,
        top: next.low,
        bottom: prev.high,
        type: "BULLISH",
        filled: false,
        index: i,
      });
    } else if (prev.low > next.high) {
      gaps.push({
        startTime: prev.time,
        endTime: next.time,
        top: prev.low,
        bottom: next.high,
        type: "BEARISH",
        filled: false,
        index: i,
      });
    }
  }

  // Mark filled: price has fully traded through the gap since it formed
  for (const gap of gaps) {
    for (let k = gap.index + 2; k < candles.length; k++) {
      const c = candles[k];
      if (c.low <= gap.bottom && c.high >= gap.top) {
        gap.filled = true;
        break;
      }
    }
  }

  return gaps;
}
