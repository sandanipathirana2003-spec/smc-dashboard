import { Candle } from "./types";

export function ema(candles: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev: number | null = null;

  candles.forEach((c, i) => {
    if (i < period - 1) {
      out.push(NaN);
      return;
    }
    if (prev === null) {
      // seed with SMA of the first `period` closes
      const seed = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period;
      prev = seed;
      out.push(seed);
      return;
    }
    const value = c.close * k + prev * (1 - k);
    prev = value;
    out.push(value);
  });

  return out;
}

/** Wilder's ATR */
export function atr(candles: Candle[], period = 14): number[] {
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
      continue;
    }
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    );
    trueRanges.push(tr);
  }

  const out: number[] = [];
  let prevATR: number | null = null;

  trueRanges.forEach((tr, i) => {
    if (i < period - 1) {
      out.push(NaN);
      return;
    }
    if (prevATR === null) {
      const seed = trueRanges.slice(i - period + 1, i + 1).reduce((s, x) => s + x, 0) / period;
      prevATR = seed;
      out.push(seed);
      return;
    }
    const value = (prevATR * (period - 1) + tr) / period;
    prevATR = value;
    out.push(value);
  });

  return out;
}

/** Lowest low of the previous N *closed* candles, not counting the current (possibly forming) one. */
export function rollingPrevLow(candles: Candle[], n: number, atIndex: number): number | null {
  if (atIndex - n < 0) return null;
  const slice = candles.slice(atIndex - n, atIndex);
  if (slice.length < n) return null;
  return Math.min(...slice.map((c) => c.low));
}
