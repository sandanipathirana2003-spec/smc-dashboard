"use client";

import { useMemo, useState, useEffect } from "react";
import { calculateRisk } from "@/lib/risk";
import { TradeSignal } from "@/lib/types";

export default function RiskCalculator({ signal }: { signal: TradeSignal | null }) {
  const [accountBalance, setAccountBalance] = useState(1000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [leverage, setLeverage] = useState(10);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [stopLossPrice, setStopLossPrice] = useState<number>(0);
  const [takeProfitPrice, setTakeProfitPrice] = useState<number>(0);

  // Auto-fill from the active signal when it changes
  useEffect(() => {
    if (signal?.entry && signal?.stopLoss) {
      setEntryPrice(signal.entry);
      setStopLossPrice(signal.stopLoss);
      if (signal.takeProfit) setTakeProfitPrice(signal.takeProfit);
    }
  }, [signal?.entry, signal?.stopLoss, signal?.takeProfit]);

  const result = useMemo(() => {
    if (!entryPrice || !stopLossPrice) return null;
    return calculateRisk({
      accountBalance,
      riskPercent,
      entryPrice,
      stopLossPrice,
      leverage,
      takeProfitPrice: takeProfitPrice || undefined,
    });
  }, [accountBalance, riskPercent, leverage, entryPrice, stopLossPrice, takeProfitPrice]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-xs uppercase tracking-widest text-zinc-500">Position Size Calculator</div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Account Balance (USDT)" value={accountBalance} onChange={setAccountBalance} />
        <Field label="Risk % per Trade" value={riskPercent} onChange={setRiskPercent} step={0.1} />
        <Field label="Leverage" value={leverage} onChange={setLeverage} />
        <Field label="Entry Price" value={entryPrice} onChange={setEntryPrice} step={0.01} />
        <Field label="Stop Loss Price" value={stopLossPrice} onChange={setStopLossPrice} step={0.01} />
        <Field label="Take Profit Price" value={takeProfitPrice} onChange={setTakeProfitPrice} step={0.01} />
      </div>

      {result && (
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-900/60 p-3 text-sm">
          <Row label="Risk Amount" value={`$${result.riskAmount.toFixed(2)}`} />
          <Row label="Stop Distance" value={`${result.priceDistancePct.toFixed(2)}%`} />
          <Row label="Position Size" value={`${result.positionSizeCoin.toFixed(6)} coins`} />
          <Row label="Position Value" value={`$${result.positionSizeUSD.toFixed(2)}`} />
          <Row label="Margin Required" value={`$${result.marginRequired.toFixed(2)}`} />
          {result.riskRewardRatio !== null && (
            <Row label="R:R" value={result.riskRewardRatio.toFixed(2)} />
          )}
          {result.warnings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 border-t border-zinc-700 pt-2">
              {result.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-400">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      {label}
      <input
        type="number"
        step={step}
        value={value || ""}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-blue-500"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono text-zinc-100">{value}</span>
    </div>
  );
}
