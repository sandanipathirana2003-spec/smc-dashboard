"use client";

import { FuturesContext } from "@/lib/types";

export default function ContextBar({
  symbol,
  context,
  onSymbolChange,
  onRefresh,
  loading,
  view,
  onViewChange,
  strategy,
  onStrategyChange,
}: {
  symbol: string;
  context: FuturesContext | null;
  onSymbolChange: (s: string) => void;
  onRefresh: () => void;
  loading: boolean;
  view: "terminal" | "positions";
  onViewChange: (v: "terminal" | "positions") => void;
  strategy: "SMC" | "WIDE_STOP_SCALP";
  onStrategyChange: (s: "SMC" | "WIDE_STOP_SCALP") => void;
}) {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

  return (
    <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold tracking-widest text-zinc-100">SMC TERMINAL</span>

        <div className="flex rounded border border-zinc-700 text-xs">
          <button
            onClick={() => onViewChange("terminal")}
            className={`px-3 py-1.5 ${view === "terminal" ? "bg-blue-500/20 text-blue-400" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            Terminal
          </button>
          <button
            onClick={() => onViewChange("positions")}
            className={`border-l border-zinc-700 px-3 py-1.5 ${view === "positions" ? "bg-blue-500/20 text-blue-400" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            Positions
          </button>
        </div>

        {view === "terminal" && (
          <>
            <select
              value={strategy}
              onChange={(e) => onStrategyChange(e.target.value as "SMC" | "WIDE_STOP_SCALP")}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100 outline-none"
            >
              <option value="SMC">SMC (BOS/CHoCH)</option>
              <option value="WIDE_STOP_SCALP">Wide-Stop Scalp</option>
            </select>

            <select
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100 outline-none"
            >
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {view === "terminal" && (
        <div className="flex items-center gap-6 text-xs">
          {context && (
            <>
              <Metric label="Mark" value={context.markPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
              <Metric
                label="Funding"
                value={`${(context.fundingRate * 100).toFixed(4)}%`}
                tone={context.fundingRate >= 0 ? "text-emerald-400" : "text-rose-400"}
              />
              <Metric label="OI" value={context.openInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })} />
            </>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="rounded border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-blue-500 hover:text-blue-400 disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono ${tone || "text-zinc-100"}`}>{value}</span>
    </div>
  );
}
