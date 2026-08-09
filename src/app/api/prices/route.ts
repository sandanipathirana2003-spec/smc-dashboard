import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

// Binance returns mark price for EVERY symbol when called with no `symbol` param -
// one call covers the whole tracker instead of one request per row.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols");
  const wanted = symbolsParam ? new Set(symbolsParam.split(",").map((s) => s.trim().toUpperCase())) : null;

  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex", { cache: "no-store" });
    if (!res.ok) throw new Error(`Binance premiumIndex error ${res.status}`);

    const all: { symbol: string; markPrice: string }[] = await res.json();
    const prices: Record<string, number> = {};

    for (const entry of all) {
      if (!wanted || wanted.has(entry.symbol)) {
        prices[entry.symbol] = parseFloat(entry.markPrice);
      }
    }

    return NextResponse.json({ prices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error fetching prices" },
      { status: 500 }
    );
  }
}
