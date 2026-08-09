"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Position } from "@/lib/types";
import { computePositionMetrics, emptyPosition, loadPositions, savePositions } from "@/lib/positions";

const REFRESH_MS = 30_000;
const BREAKEVEN_BUFFER_PCT = 0.1; // must match src/lib/wideStopScalp.ts

export default function PositionTracker() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPositions(loadPositions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) savePositions(positions);
  }, [positions, hydrated]);

  const openCoins = useMemo(
    () => Array.from(new Set(positions.filter((p) => p.status === "OPEN").map((p) => p.coin))).filter(Boolean),
    [positions]
  );

  const fetchLivePrices = useCallback(async () => {
    if (openCoins.length === 0) return;
    try {
      const res = await fetch(`/api/prices?symbols=${openCoins.join(",")}`, { cache: "no-store" });
      const json = await res.json();
      if (json.prices) setLivePrices(json.prices);
    } catch {
      // silent - table still works off entry price if live fetch fails
    }
  }, [openCoins]);

  useEffect(() => {
    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchLivePrices]);

  function updatePosition(id: string, patch: Partial<Position>) {
    setPositions((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addRow() {
    setPositions((prev) => [...prev, emptyPosition()]);
  }

  function deleteRow(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  // Wide-Stop Scalp: rules 3+4 fire at the same trigger (1x ATR from entry) -
  // lock the stop at breakeven and bank half the position in one click.
  function lockBreakevenAndTakeHalf(p: Position) {
    updatePosition(p.id, {
      stopLoss: p.entryPrice * (1 + BREAKEVEN_BUFFER_PCT / 100),
      breakevenMoved: true,
      partialClosed: true,
    });
  }

  const totals = useMemo(() => {
    return positions.reduce(
      (acc, p) => {
        const m = computePositionMetrics(p, livePrices[p.coin] ?? null);
        acc.pnl += m.pnl;
        acc.risk += p.status === "OPEN" ? m.risk : 0;
        return acc;
      },
      { pnl: 0, risk: 0 }
    );
  }, [positions, livePrices]);

  if (!hydrated) {
    return <div className="p-4 text-sm text-zinc-500">Loading positions...</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Trading Position Tracker</div>
          <div className="text-xs text-zinc-500">
            Fill in the blue-text cells — everything else calculates automatically. For Wide-Stop Scalp rows, set
            &quot;ATR@Entry&quot; and the Manage button handles breakeven + 50% partial close for you. Saved to this
            browser only.
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="text-xs text-zinc-500">Open Risk</div>
            <div className="font-mono text-amber-400">${totals.risk.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500">Total PnL</div>
            <div className={`font-mono ${totals.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              ${totals.pnl.toFixed(2)}
            </div>
          </div>
          <button
            onClick={addRow}
            className="rounded border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-blue-500 hover:text-blue-400"
          >
            + Add Position
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1900px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-300">
            <tr>
              {[
                "Coin",
                "Side",
                "Strategy",
                "Leverage (x)",
                "Entry Price",
                "Stop Loss",
                "Take Profit",
                "ATR @ Entry",
                "TP1 (50%)",
                "Margin ($)",
                "Position Size ($)",
                "Quantity",
                "Exit Price",
                "Status",
                "Risk ($)",
                "Reward ($)",
                "Risk:Reward",
                "Liquidation (est.)",
                "PnL ($)",
                "PnL (%)",
                "Manage",
                "",
              ].map((h) => (
                <th key={h} className="border border-zinc-800 px-2 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const live = livePrices[p.coin] ?? null;
              const m = computePositionMetrics(p, live);
              const pnlPositive = m.pnl >= 0;

              const isScalp = p.strategy === "WIDE_STOP_SCALP";
              const breakevenTrigger = isScalp && p.atrAtEntry ? p.entryPrice + p.atrAtEntry : null;
              const canManage = isScalp && p.status === "OPEN" && breakevenTrigger !== null;
              const triggered = canManage && live !== null && live >= (breakevenTrigger as number);

              return (
                <tr key={p.id} className="odd:bg-zinc-950 even:bg-zinc-900/40">
                  <EditCell value={p.coin} onChange={(v) => updatePosition(p.id, { coin: v.toUpperCase() })} />
                  <SelectCell
                    value={p.side}
                    options={["LONG", "SHORT"]}
                    onChange={(v) => updatePosition(p.id, { side: v as Position["side"] })}
                  />
                  <SelectCell
                    value={p.strategy ?? "SMC"}
                    options={["SMC", "WIDE_STOP_SCALP"]}
                    onChange={(v) => updatePosition(p.id, { strategy: v as Position["strategy"] })}
                  />
                  <NumberCell value={p.leverage} onChange={(v) => updatePosition(p.id, { leverage: v })} />
                  <NumberCell value={p.entryPrice} onChange={(v) => updatePosition(p.id, { entryPrice: v })} step={0.01} />
                  <NumberCell value={p.stopLoss} onChange={(v) => updatePosition(p.id, { stopLoss: v })} step={0.01} />
                  <NumberCell value={p.takeProfit} onChange={(v) => updatePosition(p.id, { takeProfit: v })} step={0.01} />
                  <NumberCell
                    value={p.atrAtEntry ?? 0}
                    onChange={(v) => updatePosition(p.id, { atrAtEntry: v || null })}
                    step={0.01}
                  />
                  <ComputedCell>{breakevenTrigger ? breakevenTrigger.toFixed(2) : "-"}</ComputedCell>

                  <NumberCell value={p.margin} onChange={(v) => updatePosition(p.id, { margin: v })} step={0.01} />

                  <ComputedCell>{m.positionSize.toFixed(2)}</ComputedCell>
                  <ComputedCell>{m.quantity.toFixed(6)}</ComputedCell>

                  <NumberCell
                    value={p.exitPrice ?? 0}
                    onChange={(v) => updatePosition(p.id, { exitPrice: v || null })}
                    step={0.01}
                  />
                  <SelectCell
                    value={p.status}
                    options={["OPEN", "CLOSED"]}
                    onChange={(v) => updatePosition(p.id, { status: v as Position["status"] })}
                  />

                  <ComputedCell>{m.risk.toFixed(2)}</ComputedCell>
                  <ComputedCell>{m.reward.toFixed(2)}</ComputedCell>
                  <ComputedCell>{m.riskReward ? m.riskReward.toFixed(2) : "-"}</ComputedCell>
                  <ComputedCell>{m.liquidationPrice.toFixed(2)}</ComputedCell>
                  <ComputedCell className={pnlPositive ? "text-emerald-400" : "text-rose-400"}>
                    {m.pnl.toFixed(2)}
                  </ComputedCell>
                  <ComputedCell className={pnlPositive ? "text-emerald-400" : "text-rose-400"}>
                    {m.pnlPct.toFixed(2)}%
                  </ComputedCell>

                  <td className="border border-zinc-800 px-2 py-1">
                    {!isScalp ? (
                      <span className="text-zinc-700">-</span>
                    ) : p.partialClosed ? (
                      <span className="text-emerald-400">✓ BE + 50% taken</span>
                    ) : !canManage ? (
                      <span className="text-zinc-600">set ATR@Entry</span>
                    ) : triggered ? (
                      <button
                        onClick={() => lockBreakevenAndTakeHalf(p)}
                        className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-amber-400 hover:bg-amber-500/20"
                      >
                        Lock BE + take 50%
                      </button>
                    ) : (
                      <span className="text-zinc-600">
                        wait for {(breakevenTrigger as number).toFixed(2)}
                      </span>
                    )}
                  </td>

                  <td className="border border-zinc-800 px-2 py-1">
                    <button
                      onClick={() => deleteRow(p.id)}
                      className="text-zinc-600 hover:text-rose-400"
                      title="Delete row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}

            {positions.length === 0 && (
              <tr>
                <td colSpan={22} className="px-4 py-8 text-center text-zinc-500">
                  No positions yet. Click &quot;+ Add Position&quot; to start tracking.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <td className="border border-zinc-800 p-0">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-2 py-1.5 font-mono text-sky-300 outline-none focus:bg-zinc-800"
      />
    </td>
  );
}

function NumberCell({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <td className="border border-zinc-800 p-0">
      <input
        type="number"
        step={step}
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent px-2 py-1.5 font-mono text-sky-300 outline-none focus:bg-zinc-800"
      />
    </td>
  );
}

function SelectCell({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <td className="border border-zinc-800 p-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-2 py-1.5 font-mono text-sky-300 outline-none focus:bg-zinc-800"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-zinc-900">
            {o}
          </option>
        ))}
      </select>
    </td>
  );
}

function ComputedCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border border-zinc-800 px-2 py-1.5 font-mono text-zinc-300 ${className}`}>{children}</td>
  );
}
