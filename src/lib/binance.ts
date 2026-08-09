import { Candle, FuturesContext } from "./types";

const FAPI_BASE = "https://fapi.binance.com";

// Binance kline array shape:
// [ openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore ]
type RawKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string
];

export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 300
): Promise<Candle[]> {
  const url = `${FAPI_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, {
    // Edge runtime: no caching so the dashboard is always live
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Binance klines error ${res.status}: ${text}`);
  }

  const raw: RawKline[] = await res.json();

  return raw.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export async function fetchFuturesContext(symbol: string): Promise<FuturesContext> {
  const [premiumRes, oiRes] = await Promise.all([
    fetch(`${FAPI_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`, { cache: "no-store" }),
    fetch(`${FAPI_BASE}/fapi/v1/openInterest?symbol=${symbol}`, { cache: "no-store" }),
  ]);

  if (!premiumRes.ok) {
    throw new Error(`Binance premiumIndex error ${premiumRes.status}`);
  }
  if (!oiRes.ok) {
    throw new Error(`Binance openInterest error ${oiRes.status}`);
  }

  const premium = await premiumRes.json();
  const oi = await oiRes.json();

  return {
    symbol,
    markPrice: parseFloat(premium.markPrice),
    fundingRate: parseFloat(premium.lastFundingRate),
    nextFundingTime: premium.nextFundingTime,
    openInterest: parseFloat(oi.openInterest),
  };
}
