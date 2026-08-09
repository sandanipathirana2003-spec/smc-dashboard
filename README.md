# SMC Terminal

Implements the exact 7-step flow from your strategy sheet, live on Binance USDT-M Futures.

| Strategy step | Where it lives |
|---|---|
| 1. Identify Trend (4H) | `src/lib/smc.ts` -> `detectTrend()` - HH/HL vs LH/LL from fractal swing points |
| 2. Mark Key Levels (4H) | `findKeyLevels()` - clusters swing highs/lows into support/resistance, tags most recent unbroken swing as BSL/SSL liquidity |
| 3. Lower Timeframe (15m) | 15m klines pulled alongside 4H |
| 4. Wait for Confirmation (CHoCH/BOS) | `detectStructureEvents()` - break of last swing point; BOS if aligned with running trend, CHoCH if against it |
| 5. Find Entry (OB/FVG) | `detectOrderBlocks()` + `detectFVGs()` - most recent unmitigated zone in trend direction |
| 6. Set SL/TP | `src/lib/signal.ts` - SL beyond the zone, TP at the opposite liquidity pool |
| 7. Risk Management | `RiskCalculator` component - 1-2% sizing, auto-fills from the active signal |

Only takes LONG signals in an uptrend and SHORT signals in a downtrend - matches the "Short Rule (very important)" box on your sheet.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- `lightweight-charts` v5 for the candlestick chart
- Binance Futures public REST API (`fapi.binance.com`) - klines, mark price, funding rate, open interest
- `/api/signal` runs on the Edge runtime (same geo-block bypass you've used before)
- Auto-refreshes every 30s, no API key needed

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy (your usual flow)

```bash
git init
git add .
git commit -m "SMC terminal: trend + CHoCH/BOS + OB/FVG signal + risk calculator"
git branch -M main
git remote add origin https://github.com/sandanipathirana2003-spec/smc-dashboard.git
git push -u origin main --force
```

Then import the repo in Vercel - zero env vars required, it builds and deploys as-is.

## What's simplified (be aware before trusting it live)

- Swing detection uses a 2-candle fractal lookback - tune `lookback` in `findSwingPoints()` for fewer/more swing points.
- Order block/FVG zones are drawn as price lines (top+bottom), not shaded boxes - lightweight-charts v5 needs a custom primitive plugin for true rectangles, kept out of scope for v1.
- TP defaults to the nearest liquidity pool; it doesn't yet account for intermediate resistance/support in the path.
- No backtesting or alerting yet - this is the live/manual-execution version of the spec.

## Symbols

BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT via the dropdown - add more in `ContextBar.tsx`.

## Strategy 2: Wide-Stop Scalp

For when you can't watch the screen all day. Switch strategies from the dropdown next to Terminal/Positions. Long-only, 15m timeframe, lives in `src/lib/wideStopScalp.ts`:

| Rule | Implementation |
|---|---|
| 1. Stop Loss | Low of the previous 3 *closed* 15m candles, minus a 0.2% buffer |
| 2. Take Profit | TP2 (final) = entry + 1.5x the SL distance - guarantees R:R >= 1:1.5 exactly |
| 3. Breakeven | Once price reaches entry + 1x ATR(14), move SL to entry + 0.1% |
| 4. Partial Close | Sell 50% at TP1 = entry + 1x ATR (same level as the breakeven trigger - one action does both), remaining 50% rides to TP2 |
| 5. Entry Filter | Only signals LONG when price is within 0.5% of the 20 EMA, the EMA is sloping up, and the candle isn't a breakout impulse (no new local high on an oversized range) - buys pullbacks, not breakouts |

**Note on rules 2 vs 4:** your spec defines TP two ways - "1.5x the SL distance" (rule 2) and "TP2 = 1.5x ATR" (rule 4). Those only match if SL distance happens to equal ATR, which won't generally be true since the SL comes from candle lows, not ATR. I went with rule 2's definition (1.5x SL distance) for the official TP2/R:R target, and used ATR purely for TP1 and the breakeven trigger as rule 3 states. If you'd rather TP2 be a strict 1.5x ATR instead, it's one line to change - `TP_RR_MULTIPLE` calculation in `wideStopScalp.ts`.

The signal panel and chart show entry, SL, TP1 (blue), TP2 (green), and the breakeven SL level (dashed amber) so you can place all your orders in one look before work, then just check the Positions tab in the evening.

### Managing an open Wide-Stop Scalp position

In the Positions tab, set a row's Strategy to "Wide-Stop Scalp" and fill in **ATR @ Entry** (shown on the signal panel when the signal fires). Once the live price crosses the breakeven/TP1 level, a **"Lock BE + take 50%"** button appears - one click moves the stop to breakeven and halves the tracked position size, so the remaining runner's PnL reflects the smaller size riding to TP2. This is a manual action (the dashboard doesn't have exchange API keys or place real orders) - it's a reminder + calculator, not an auto-executing bot.


Second tab ("Positions" in the top bar) - matches your spreadsheet tracker exactly:

- Editable: Coin, Side, Leverage, Entry, SL, TP, Margin, Exit Price, Status
- Auto-calculated: Position Size, Quantity, Risk ($), Reward ($), Risk:Reward, Liquidation Price (est.), PnL ($), PnL (%)
- Open positions pull a live mark price from `/api/prices` every 30s, so PnL updates in real time instead of needing an exit price
- Liquidation price is a simplified isolated-margin estimate (`entry * (1 ± 1/leverage ∓ 0.5% maintenance margin)`) - treat it as a rough warning line, not exact
- Rows persist to `localStorage` in your browser - not synced across devices. If you want it synced (e.g. phone + laptop), the second terminal project already has Supabase wired up and would be a natural home for this table with a `positions` table instead of localStorage.

