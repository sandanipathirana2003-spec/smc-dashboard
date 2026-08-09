"use client";

import { useCallback, useEffect, useState } from "react";
import ContextBar from "@/components/ContextBar";
import Chart, { ExtraPriceLine } from "@/components/Chart";
import SignalPanel from "@/components/SignalPanel";
import RiskCalculator from "@/components/RiskCalculator";
import PositionTracker from "@/components/PositionTracker";
import {
  Candle,
  FuturesContext,
  KeyLevel,
  OrderBlock,
  FairValueGap,
  StructureEvent,
  TradeSignal,
  WideStopScalpSignal,
  StrategyType,
} from "@/lib/types";

interface SignalResponse {
  signal: TradeSignal | WideStopScalpSignal;
  context: FuturesContext | null;
  chart: {
    htfCandles?: Candle[];
    ltfCandles: Candle[];
    structureEvents?: StructureEvent[];
    orderBlocks?: OrderBlock[];
    fvgs?: FairValueGap[];
    keyLevels?: KeyLevel[];
    ema20?: { time: number; value: number }[];
  };
  error?: string;
}

const REFRESH_MS = 30_000;

function isWideStopScalp(s: TradeSignal | WideStopScalpSignal | null | undefined): s is WideStopScalpSignal {
  return !!s && (s as WideStopScalpSignal).strategy === "WIDE_STOP_SCALP";
}

export default function Home() {
  const [view, setView] = useState<"terminal" | "positions">("terminal");
  const [strategy, setStrategy] = useState<StrategyType>("SMC");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [data, setData] = useState<SignalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (sym: string, strat: StrategyType) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/signal?symbol=${sym}&strategy=${strat}`, { cache: "no-store" });
      const json: SignalResponse = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load signal");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(symbol, strategy);
    const interval = setInterval(() => load(symbol, strategy), REFRESH_MS);
    return () => clearInterval(interval);
  }, [symbol, strategy, load]);

  const wideSignal = isWideStopScalp(data?.signal) ? data!.signal : null;

  const extraLines: ExtraPriceLine[] = [];
  if (wideSignal) {
    if (wideSignal.stopLoss) extraLines.push({ price: wideSignal.stopLoss, color: "#ef4444", title: "SL" });
    if (wideSignal.tp1) extraLines.push({ price: wideSignal.tp1, color: "#38bdf8", title: "TP1 (50%)" });
    if (wideSignal.tp2) extraLines.push({ price: wideSignal.tp2, color: "#22c55e", title: "TP2" });
    if (wideSignal.breakevenStopLoss)
      extraLines.push({ price: wideSignal.breakevenStopLoss, color: "#f59e0b", title: "BE SL", dashed: true });
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <ContextBar
        symbol={symbol}
        context={data?.context ?? null}
        onSymbolChange={setSymbol}
        onRefresh={() => load(symbol, strategy)}
        loading={loading}
        view={view}
        onViewChange={setView}
        strategy={strategy}
        onStrategyChange={setStrategy}
      />

      {error && (
        <div className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-400">
          {error}
        </div>
      )}

      {view === "positions" ? (
        <div className="flex-1 overflow-hidden">
          <PositionTracker />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 border-r border-zinc-800 p-2">
            {data ? (
              <Chart
                candles={data.chart.ltfCandles}
                structureEvents={data.chart.structureEvents}
                orderBlocks={data.chart.orderBlocks}
                fvgs={data.chart.fvgs}
                keyLevels={data.chart.keyLevels}
                emaSeries={data.chart.ema20}
                extraLines={extraLines}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Loading chart...
              </div>
            )}
          </div>

          <div className="flex w-[380px] flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto border-b border-zinc-800">
              <SignalPanel signal={data?.signal ?? null} />
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <RiskCalculator signal={data?.signal ?? null} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
