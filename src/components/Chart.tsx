"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  SeriesMarker,
  Time,
  createSeriesMarkers,
  ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { Candle, StructureEvent, OrderBlock, FairValueGap, KeyLevel } from "@/lib/types";

export interface ExtraPriceLine {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
}

interface ChartProps {
  candles: Candle[];
  structureEvents?: StructureEvent[];
  orderBlocks?: OrderBlock[];
  fvgs?: FairValueGap[];
  keyLevels?: KeyLevel[];
  emaSeries?: { time: number; value: number }[];
  extraLines?: ExtraPriceLine[];
}

export default function Chart({
  candles,
  structureEvents = [],
  orderBlocks = [],
  fvgs = [],
  keyLevels = [],
  emaSeries = [],
  extraLines = [],
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const emaLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e14" },
        textColor: "#9ca3af",
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: "#1a1f2b" },
        horzLines: { color: "#1a1f2b" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1a1f2b",
      },
      rightPriceScale: {
        borderColor: "#1a1f2b",
      },
      crosshair: {
        vertLine: { color: "#3b82f6", labelBackgroundColor: "#3b82f6" },
        horzLine: { color: "#3b82f6", labelBackgroundColor: "#3b82f6" },
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const emaLine = chart.addSeries(LineSeries, {
      color: "#a78bfa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    emaLineRef.current = emaLine;
    markersPluginRef.current = createSeriesMarkers(series, []);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      emaLineRef.current = null;
      markersPluginRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;

    series.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    // EMA overlay
    if (emaLineRef.current) {
      emaLineRef.current.setData(
        emaSeries.filter((p) => !isNaN(p.value)).map((p) => ({ time: p.time as Time, value: p.value }))
      );
    }

    // BOS / CHoCH markers (SMC strategy only)
    const markers: SeriesMarker<Time>[] = structureEvents.map((e) => ({
      time: e.time as Time,
      position: e.direction === "BULLISH" ? "belowBar" : "aboveBar",
      color: e.type === "CHOCH" ? "#f59e0b" : e.direction === "BULLISH" ? "#22c55e" : "#ef4444",
      shape: e.direction === "BULLISH" ? "arrowUp" : "arrowDown",
      text: e.type,
    }));
    markersPluginRef.current?.setMarkers(markers);

    // Key levels as horizontal price lines
    const priceLineRefs: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];
    keyLevels.slice(0, 8).forEach((level) => {
      const color =
        level.type === "SUPPORT"
          ? "#22c55e"
          : level.type === "RESISTANCE"
          ? "#ef4444"
          : level.type === "LIQUIDITY_BUY_SIDE"
          ? "#38bdf8"
          : "#f472b6";

      const line = series.createPriceLine({
        price: level.price,
        color,
        lineWidth: 1,
        lineStyle: level.type.startsWith("LIQUIDITY") ? 2 : 0,
        axisLabelVisible: true,
        title:
          level.type === "LIQUIDITY_BUY_SIDE"
            ? "BSL"
            : level.type === "LIQUIDITY_SELL_SIDE"
            ? "SSL"
            : level.type.slice(0, 3),
      });
      priceLineRefs.push(line);
    });

    // Order block / FVG zones approximated as top+bottom price lines
    const zoneLineRefs: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];
    orderBlocks
      .filter((ob) => !ob.mitigated)
      .slice(-4)
      .forEach((ob) => {
        const color = ob.type === "BULLISH" ? "#16a34a" : "#dc2626";
        zoneLineRefs.push(
          series.createPriceLine({ price: ob.high, color, lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: "OB" }),
          series.createPriceLine({ price: ob.low, color, lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: "" })
        );
      });

    fvgs
      .filter((g) => !g.filled)
      .slice(-4)
      .forEach((g) => {
        const color = g.type === "BULLISH" ? "#65a30d" : "#b91c1c";
        zoneLineRefs.push(
          series.createPriceLine({ price: g.top, color, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: "FVG" }),
          series.createPriceLine({ price: g.bottom, color, lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: "" })
        );
      });

    // Generic extra lines (SL / TP1 / TP2 / breakeven for Wide-Stop Scalp)
    const extraLineRefs: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];
    extraLines.forEach((l) => {
      extraLineRefs.push(
        series.createPriceLine({
          price: l.price,
          color: l.color,
          lineWidth: 2,
          lineStyle: l.dashed ? 2 : 0,
          axisLabelVisible: true,
          title: l.title,
        })
      );
    });

    chartRef.current?.timeScale().fitContent();

    return () => {
      [...priceLineRefs, ...zoneLineRefs, ...extraLineRefs].forEach((line) => {
        try {
          series.removePriceLine(line);
        } catch {
          // series already torn down
        }
      });
    };
  }, [candles, structureEvents, orderBlocks, fvgs, keyLevels, emaSeries, extraLines]);

  return <div ref={containerRef} className="h-full w-full" />;
}
