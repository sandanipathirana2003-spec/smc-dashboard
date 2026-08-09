"use client";

import { TradeSignal, WideStopScalpSignal } from "@/lib/types";

function statusColor(status: string) {
  if (status === "PASS") return "text-emerald-400 border-emerald-400/30 bg-emerald-400/5";
  if (status === "FAIL") return "text-rose-400 border-rose-400/30 bg-rose-400/5";
  return "text-amber-400 border-amber-400/30 bg-amber-400/5";
}

function statusMark(status: string) {
  if (status === "PASS") return "✓";
  if (status === "FAIL") return "✕";
  return "…";
}

function isWideStopScalp(s: TradeSignal | WideStopScalpSignal): s is WideStopScalpSignal {
  return (s as WideStopScalpSignal).strategy === "WIDE_STOP_SCALP";
}

export default function SignalPanel({ signal }: { signal: TradeSignal | WideStopScalpSignal | null }) {
  if (!signal) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Loading signal...
      </div>
    );
  }

  const readinessStyle =
    signal.readiness === "READY"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/40"
      : signal.readiness === "WAITING"
      ? "bg-amber-500/10 text-amber-400 border-amber-500/40"
      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/40";

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">{signal.symbol}</div>
          <div className="text-lg font-semibold text-zinc-100">
            {signal.side === "LONG" ? "LONG SETUP" : signal.side === "SHORT" ? "SHORT SETUP" : "NO TRADE"}
          </div>
        </div>
        <span className={`rounded border px-2 py-1 text-xs font-medium ${readinessStyle}`}>
          {signal.readiness}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {signal.checklist.map((step) => (
          <div key={step.step} className={`rounded border px-3 py-2 ${statusColor(step.status)}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>
                {step.step}. {step.label}
              </span>
              <span>{statusMark(step.status)}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">{step.detail}</div>
          </div>
        ))}
      </div>

      {signal.entry && signal.stopLoss && signal.takeProfit && (
        <div className="rounded border border-zinc-700 bg-zinc-900/60 p-3">
          <div className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Trade Plan</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-zinc-500">Entry</div>
              <div className="font-mono text-zinc-100">{signal.entry.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-zinc-500">Stop Loss</div>
              <div className="font-mono text-rose-400">{signal.stopLoss.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-zinc-500">{isWideStopScalp(signal) ? "TP2 (final)" : "Take Profit"}</div>
              <div className="font-mono text-emerald-400">{signal.takeProfit.toFixed(2)}</div>
            </div>
          </div>
          {signal.riskRewardRatio && (
            <div className="mt-2 text-xs text-zinc-400">
              R:R <span className="font-mono text-zinc-200">{signal.riskRewardRatio.toFixed(2)}</span>
            </div>
          )}

          {isWideStopScalp(signal) && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-700 pt-3 text-sm">
              <div>
                <div className="text-zinc-500">TP1 (sell 50%)</div>
                <div className="font-mono text-sky-400">{signal.tp1 ? signal.tp1.toFixed(2) : "-"}</div>
              </div>
              <div>
                <div className="text-zinc-500">Breakeven SL</div>
                <div className="font-mono text-amber-400">
                  {signal.breakevenStopLoss ? signal.breakevenStopLoss.toFixed(2) : "-"}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">ATR (14)</div>
                <div className="font-mono text-zinc-300">{signal.atr ? signal.atr.toFixed(2) : "-"}</div>
              </div>
              <div>
                <div className="text-zinc-500">20 EMA</div>
                <div className="font-mono text-violet-400">{signal.ema20 ? signal.ema20.toFixed(2) : "-"}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
