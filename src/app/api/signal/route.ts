import { NextRequest, NextResponse } from "next/server";
import { fetchKlines, fetchFuturesContext } from "@/lib/binance";
import { buildTradeSignal } from "@/lib/signal";
import { buildWideStopScalpSignal } from "@/lib/wideStopScalp";
import { findSwingPoints, detectStructureEvents, detectOrderBlocks, detectFVGs, findKeyLevels } from "@/lib/smc";
import { ema } from "@/lib/indicators";

// Edge runtime bypasses regional blocks that sometimes hit Binance from Node's default runtime.
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const strategy = (searchParams.get("strategy") || "SMC").toUpperCase();

  try {
    if (strategy === "WIDE_STOP_SCALP") {
      const [ltfCandles, context] = await Promise.all([
        fetchKlines(symbol, "15m", 200),
        fetchFuturesContext(symbol).catch(() => null),
      ]);

      const signal = buildWideStopScalpSignal({ symbol, candles: ltfCandles });
      const ema20 = ema(ltfCandles, 20).map((v, i) => ({ time: ltfCandles[i].time, value: v }));

      return NextResponse.json({
        signal,
        context,
        chart: {
          ltfCandles,
          ema20,
        },
      });
    }

    const [htfCandles, ltfCandles, context] = await Promise.all([
      fetchKlines(symbol, "4h", 200),
      fetchKlines(symbol, "15m", 200),
      fetchFuturesContext(symbol).catch(() => null),
    ]);

    const signal = buildTradeSignal({ symbol, htfCandles, ltfCandles });

    // Send back the raw structure too, so the chart can draw it without recomputing.
    const htfSwings = findSwingPoints(htfCandles, 2);
    const ltfSwings = findSwingPoints(ltfCandles, 2);
    const structureEvents = detectStructureEvents(ltfCandles, ltfSwings);
    const orderBlocks = detectOrderBlocks(ltfCandles, structureEvents);
    const fvgs = detectFVGs(ltfCandles);
    const keyLevels = findKeyLevels(htfSwings);

    return NextResponse.json({
      signal,
      context,
      chart: {
        htfCandles,
        ltfCandles,
        ltfSwings,
        structureEvents,
        orderBlocks,
        fvgs,
        keyLevels,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error fetching signal" },
      { status: 500 }
    );
  }
}
