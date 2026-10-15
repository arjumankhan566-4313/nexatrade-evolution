/**
 * tradeOverlays — map the signed-in user's trades onto the native canvas
 * overlay primitives drawn by ChartEngine.drawOverlays.
 *
 * Every mark is expressed in DATA coordinates (candle index + price), never in
 * pixels, so the engine re-projects it on each frame and the entry/exit marks
 * stay glued to their candles through zoom, pan and reload.
 *
 * Open trades  → dashed entry line + filled entry dot + hollow expiry
 *                projection dot (at the entry price, like the legacy chart).
 * Closed trades → exit line at the recorded exit price + entry/exit dots.
 */
import type { Candle, ChartOverlays, OverlayDot, OverlayLine } from "./types";
import type { UiTrade } from "../lib/trades";

const CALL_ENTRY = "#26a69a";
const PUT_ENTRY = "#ef5350";
const PROJECTION = "#f5c542";
const WIN_EXIT = "#26a69a";
const LOSS_EXIT = "#ef5350";
const PAST_ENTRY_DOT = "#8b95a7";
/** The legacy chart shows the running positions plus the eight most recent. */
const MAX_CLOSED = 8;

/**
 * Index of the candle bucket containing `timeMs`.
 * - before the loaded window → -1 (dot is skipped, the engine draws nothing)
 * - inside the forming candle's bucket → the last index
 * - later than that → `candles.length` (off-screen: drawn only once it exists)
 */
export function indexForTime(candles: Candle[], timeMs: number, bucketMs: number): number {
  if (!candles.length) return -1;
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  if (timeMs < first) return -1;
  if (timeMs >= last) {
    const ahead = Math.floor((timeMs - last) / (bucketMs || 1));
    return ahead === 0 ? candles.length - 1 : candles.length + ahead - 1;
  }
  let lo = 0;
  let hi = candles.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= timeMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** A usable positive price, else the fallback (pending rows carry price 0). */
function usablePrice(v: number | null | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Build the anchored overlay set for the chart's current candle window.
 *
 * ONLY the charted symbol's trades become marks. A position on another market
 * (e.g. a low-priced instrument at ~780) would otherwise be drawn on this
 * chart AND pulled into `ChartEngine.fitPriceRange`, stretching the price axis
 * to 0…90000 and squeezing the candles into an invisible sliver at the top —
 * the "candles are gone" regression. Never mix symbols here.
 */
export function buildTradeOverlays(
  trades: UiTrade[],
  candles: Candle[],
  bucketMs: number,
  symbol?: string,
): ChartOverlays {
  const lines: OverlayLine[] = [];
  const dots: OverlayDot[] = [];
  if (!candles.length || !trades.length) return { lines, dots };

  const scoped = trades.filter(
    (t) => (!symbol || t.symbol === symbol) && Number.isFinite(t.entryPrice) && t.entryPrice > 0,
  );
  if (!scoped.length) return { lines, dots };

  const seenLineKeys = new Set<string>();
  const pushLine = (line: OverlayLine) => {
    const key = `${line.label}:${line.price}`;
    if (seenLineKeys.has(key)) return;
    seenLineKeys.add(key);
    lines.push(line);
  };

  const open = scoped.filter((t) => t.status === "OPEN");
  const closed = scoped.filter((t) => t.status !== "OPEN").slice(0, MAX_CLOSED);

  for (const t of open) {
    const entryIdx = indexForTime(candles, new Date(t.createdAt).getTime(), bucketMs);
    const expiryIdx = indexForTime(candles, new Date(t.expiresAt).getTime(), bucketMs);
    const entryColor = t.direction === "CALL" ? CALL_ENTRY : PUT_ENTRY;
    pushLine({
      id: `${t.id}:entry`,
      price: t.entryPrice,
      color: entryColor,
      label: `${t.direction} ENTRY`,
      dashed: true,
      index: entryIdx,
    });
    dots.push({
      id: `${t.id}:entry-dot`,
      index: entryIdx,
      price: t.entryPrice,
      color: entryColor,
      label: "E",
    });
    dots.push({
      id: `${t.id}:expiry-dot`,
      index: expiryIdx,
      price: t.entryPrice,
      color: PROJECTION,
      hollow: true,
      label: "X",
    });
  }

  for (const t of closed) {
    const entryIdx = indexForTime(candles, new Date(t.createdAt).getTime(), bucketMs);
    const exitIdx = indexForTime(candles, new Date(t.expiresAt).getTime(), bucketMs);
    const exitPrice = usablePrice(t.exitPrice, t.entryPrice);
    const exitColor = t.status === "WON" ? WIN_EXIT : LOSS_EXIT;
    pushLine({
      id: `${t.id}:exit`,
      price: exitPrice,
      color: exitColor,
      label: `${t.status} EXIT`,
      dashed: true,
      index: exitIdx,
    });
    dots.push({
      id: `${t.id}:entry-dot`,
      index: entryIdx,
      price: t.entryPrice,
      color: PAST_ENTRY_DOT,
      label: "E",
    });
    dots.push({
      id: `${t.id}:exit-dot`,
      index: exitIdx,
      price: exitPrice,
      color: exitColor,
      hollow: true,
      label: "X",
    });
  }

  return { lines, dots };
}
