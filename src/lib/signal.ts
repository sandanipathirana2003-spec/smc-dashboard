import {
  Candle,
  ChecklistStep,
  EntryZone,
  TradeSignal,
} from "./types";
import {
  findSwingPoints,
  detectTrend,
  findKeyLevels,
  detectStructureEvents,
  detectOrderBlocks,
  detectFVGs,
} from "./smc";

interface BuildSignalParams {
  symbol: string;
  htfCandles: Candle[]; // 4H
  ltfCandles: Candle[]; // 15m
}

export function buildTradeSignal({ symbol, htfCandles, ltfCandles }: BuildSignalParams): TradeSignal {
  const checklist: ChecklistStep[] = [];
  const now = Date.now();

  // Step 1: Identify trend on 4H
  const htfSwings = findSwingPoints(htfCandles, 2);
  const trend = detectTrend(htfSwings);
  const wantSide = trend === "UPTREND" ? "LONG" : trend === "DOWNTREND" ? "SHORT" : "NONE";

  checklist.push({
    step: 1,
    label: "Identify Trend (4H)",
    status: trend === "RANGING" ? "FAIL" : "PASS",
    detail:
      trend === "UPTREND"
        ? "Higher Highs & Higher Lows -> only look for LONGS"
        : trend === "DOWNTREND"
        ? "Lower Highs & Lower Lows -> only look for SHORTS"
        : "No clean HH/HL or LH/LL sequence -> no trade zone",
  });

  // Step 2: Key levels on 4H
  const keyLevels = findKeyLevels(htfSwings);
  const liquidityAbove = keyLevels.find((l) => l.type === "LIQUIDITY_BUY_SIDE");
  const liquidityBelow = keyLevels.find((l) => l.type === "LIQUIDITY_SELL_SIDE");

  checklist.push({
    step: 2,
    label: "Mark Key Levels (4H)",
    status: keyLevels.length > 0 ? "PASS" : "FAIL",
    detail: `${keyLevels.length} levels mapped. BSL ${liquidityAbove ? liquidityAbove.price.toFixed(2) : "-"} / SSL ${liquidityBelow ? liquidityBelow.price.toFixed(2) : "-"}`,
  });

  // Step 3: Lower timeframe (15m) in play
  checklist.push({
    step: 3,
    label: "Lower Timeframe (15m)",
    status: ltfCandles.length > 20 ? "PASS" : "FAIL",
    detail: `${ltfCandles.length} candles loaded for confirmation`,
  });

  // Step 4: Wait for confirmation (CHoCH / BOS) on 15m, aligned with HTF trend
  const ltfSwings = findSwingPoints(ltfCandles, 2);
  const structureEvents = detectStructureEvents(ltfCandles, ltfSwings);
  const lastEvent = structureEvents.length > 0 ? structureEvents[structureEvents.length - 1] : null;

  const eventAligned =
    lastEvent !== null &&
    ((wantSide === "LONG" && lastEvent.direction === "BULLISH") ||
      (wantSide === "SHORT" && lastEvent.direction === "BEARISH"));

  checklist.push({
    step: 4,
    label: "Wait for Confirmation (CHoCH/BOS)",
    status: eventAligned ? "PASS" : lastEvent ? "FAIL" : "PENDING",
    detail: lastEvent
      ? `Last event: ${lastEvent.type} ${lastEvent.direction} @ ${lastEvent.price.toFixed(2)}${eventAligned ? " (aligned with 4H trend)" : " (against 4H trend - skip)"}`
      : "No structure break yet on 15m",
  });

  // Step 5: Find entry (Order Block or FVG) in trend direction, unmitigated/unfilled
  const orderBlocks = detectOrderBlocks(ltfCandles, structureEvents);
  const fvgs = detectFVGs(ltfCandles);

  const wantDirection = wantSide === "LONG" ? "BULLISH" : wantSide === "SHORT" ? "BEARISH" : null;

  let entryZone: EntryZone | null = null;

  if (wantDirection) {
    const candidateOB = [...orderBlocks]
      .filter((ob) => ob.type === wantDirection && !ob.mitigated)
      .sort((a, b) => b.index - a.index)[0];

    const candidateFVG = [...fvgs]
      .filter((g) => g.type === wantDirection && !g.filled)
      .sort((a, b) => b.index - a.index)[0];

    if (candidateOB && (!candidateFVG || candidateOB.index >= candidateFVG.index)) {
      entryZone = {
        type: "ORDER_BLOCK",
        top: candidateOB.high,
        bottom: candidateOB.low,
        direction: candidateOB.type,
        time: candidateOB.endTime,
      };
    } else if (candidateFVG) {
      entryZone = {
        type: "FVG",
        top: candidateFVG.top,
        bottom: candidateFVG.bottom,
        direction: candidateFVG.type,
        time: candidateFVG.endTime,
      };
    }
  }

  checklist.push({
    step: 5,
    label: "Find Entry (Order Block / FVG)",
    status: entryZone ? "PASS" : "PENDING",
    detail: entryZone
      ? `${entryZone.type.replace("_", " ")} zone ${entryZone.bottom.toFixed(2)} - ${entryZone.top.toFixed(2)}`
      : "No unmitigated OB/FVG in trend direction yet",
  });

  // Step 6: Set SL / TP
  let entry: number | null = null;
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;
  let rr: number | null = null;

  if (entryZone && wantSide !== "NONE") {
    const buffer = (entryZone.top - entryZone.bottom) * 0.15 || entryZone.top * 0.0005;

    if (wantSide === "LONG") {
      entry = entryZone.top;
      stopLoss = entryZone.bottom - buffer;
      takeProfit = liquidityAbove ? liquidityAbove.price : entry + (entry - stopLoss) * 2;
    } else {
      entry = entryZone.bottom;
      stopLoss = entryZone.top + buffer;
      takeProfit = liquidityBelow ? liquidityBelow.price : entry - (stopLoss - entry) * 2;
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    rr = risk > 0 ? reward / risk : null;
  }

  checklist.push({
    step: 6,
    label: "Set Stop Loss & Take Profit",
    status: entry && stopLoss && takeProfit ? "PASS" : "PENDING",
    detail:
      entry && stopLoss && takeProfit
        ? `Entry ${entry.toFixed(2)} | SL ${stopLoss.toFixed(2)} | TP ${takeProfit.toFixed(2)} | R:R ${rr ? rr.toFixed(2) : "-"}`
        : "Waiting on entry zone before SL/TP can be set",
  });

  // Step 7: Risk management reminder (enforced in the position size calculator, not auto-computed here)
  checklist.push({
    step: 7,
    label: "Risk Management",
    status: "PENDING",
    detail: "Risk only 1-2% per trade. Size the position with the calculator below.",
  });

  const allCorePassed = checklist.slice(0, 6).every((c) => c.status === "PASS");
  const anyFailed = checklist.slice(0, 4).some((c) => c.status === "FAIL");

  const readiness: TradeSignal["readiness"] = allCorePassed
    ? "READY"
    : anyFailed
    ? "NO_SETUP"
    : "WAITING";

  return {
    symbol,
    side: readiness === "READY" ? wantSide : "NONE",
    trend4h: trend,
    structureConfirmed: eventAligned,
    lastStructureEvent: lastEvent,
    entryZone,
    entry,
    stopLoss,
    takeProfit,
    riskRewardRatio: rr,
    checklist,
    readiness,
    generatedAt: now,
  };
}
