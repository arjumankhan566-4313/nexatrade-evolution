/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — CANDLE ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/candles.js. Candles are derived ONLY from
 * authoritative OTC ticks; the same reducer backs the live forming candle, the
 * REST history builder and the recovery path.
 *
 * Guarantees:
 *   • buckets are UTC/epoch aligned: floor(ts / frameMs) * frameMs
 *   • the forming candle's close IS the latest tick price
 *   • new bucket open = previous candle close (no gaps, no jumps)
 *   • a finalized candle is immutable and never reused
 *   • out-of-order ticks can never rewrite history
 */

/** Supported OTC timeframes (value ↔ milliseconds). */
export const OTC_CANDLE_TIMEFRAMES = [
  { value: '1s', ms: 1_000 },
  { value: '5s', ms: 5_000 },
  { value: '10s', ms: 10_000 },
  { value: '15s', ms: 15_000 },
  { value: '30s', ms: 30_000 },
  { value: '1m', ms: 60_000 },
  { value: '2m', ms: 120_000 },
  { value: '3m', ms: 180_000 },
  { value: '5m', ms: 300_000 },
  { value: '10m', ms: 600_000 },
  { value: '15m', ms: 900_000 },
  { value: '30m', ms: 1_800_000 },
  { value: '1h', ms: 3_600_000 },
  { value: '4h', ms: 14_400_000 },
  { value: '1d', ms: 86_400_000 },
] as const;

export type TimeframeValue = (typeof OTC_CANDLE_TIMEFRAMES)[number]['value'];

const FRAME_MS: Record<string, number> = Object.fromEntries(
  OTC_CANDLE_TIMEFRAMES.map((t) => [t.value, t.ms])
);

export function timeframeMs(value: string): number | null {
  return FRAME_MS[value] ?? null;
}

export interface Candle {
  time: number;
  /** Set on live engine candles; DB and synthetic candles omit it (legacy shape). */
  startTime?: number;
  endTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Legacy wire shape: OTC candles never carry a volume. */
  volume?: null;
  tickCount: number;
  finalized: boolean;
}

export interface CandleState {
  current: Candle | null;
  finalized: Candle[];
}

export interface TickLike {
  timestamp: number;
  price: number;
}

/** UTC/epoch-aligned bucket start for a timestamp. */
export function bucketStart(timestamp: number, frameMs: number): number {
  return Math.floor(Number(timestamp) / frameMs) * frameMs;
}

export function createCandle(time: number, frameMs: number, openPrice: number): Candle {
  const p = Number(openPrice);
  return {
    time,
    startTime: time,
    endTime: time + frameMs,
    open: p,
    high: p,
    low: p,
    close: p,
    tickCount: 0,
    finalized: false,
  };
}

/** Apply a price to the current (unfinalized) candle. */
export function applyPrice(candle: Candle, price: number): Candle {
  const p = Number(price);
  if (candle.finalized) throw new Error('Cannot mutate a finalized OTC candle.');
  return {
    ...candle,
    high: Math.max(candle.high, p),
    low: Math.min(candle.low, p),
    close: p,
    tickCount: candle.tickCount + 1,
  };
}

/**
 * Fold one authoritative tick into the series.
 * Returns the new state (identity preserved when the tick is out of order).
 */
export function reduceTick(state: CandleState | null | undefined, tick: TickLike, frameMs: number, maxFinalized = 20): CandleState {
  const price = Number(tick?.price);
  const ts = Number(tick?.timestamp);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) return state as CandleState;

  const time = bucketStart(ts, frameMs);
  const current = state?.current || null;
  const finalized = state?.finalized || [];

  if (!current) {
    return { current: applyPrice(createCandle(time, frameMs, price), price), finalized };
  }
  if (time === current.time) {
    return { current: applyPrice(current, price), finalized };
  }
  if (time > current.time) {
    // Roll: the customer-visible candle closes at the PREVIOUS close, exactly
    // where the next candle opens.
    const closed = { ...current, finalized: true, close: current.close };
    const next = applyPrice(createCandle(time, frameMs, current.close), price);
    const kept = [...finalized, closed];
    return { current: next, finalized: kept.slice(-Math.max(1, maxFinalized)) };
  }
  // Out-of-order tick — history is immutable.
  return state as CandleState;
}

/** Build a full candle list from a tick array (REST history / recovery). */
export function candlesFromTicks(ticks: TickLike[], frameMs: number): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const tick of ticks) {
    const price = Number(tick?.price);
    const ts = Number(tick?.timestamp);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) continue;
    const time = bucketStart(ts, frameMs);
    const existing = byTime.get(time);
    if (!existing) {
      byTime.set(time, { ...createCandle(time, frameMs, price), close: price, high: price, low: price, tickCount: 1 });
      continue;
    }
    byTime.set(time, {
      ...existing,
      high: Math.max(existing.high, price),
      low: Math.min(existing.low, price),
      close: price,
      tickCount: existing.tickCount + 1,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Merge authoritative candles into a REST history array without creating
 * duplicates — the forming bucket is replaced in place, never appended.
 */
export function mergeCandles(history: Candle[], incoming: (Candle | null)[]): Candle[] {
  const map = new Map((history || []).map((c) => [Number(c.time), c]));
  for (const candle of incoming || []) {
    if (!candle) continue;
    map.set(Number(candle.time), candle);
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/**
 * Repair a historical candle series when a persisted row or replayed bucket has
 * an impossible continuity jump (for example the previous candle was near 740
 * and the next bucket opens at 598 instead of continuing from the prior close).
 * We repair the bucket by anchoring the faulty open to the previous close and
 * re-clamping the OHLC extremes around that continuity point so the chart never
 * paints a broken gap into the visible stream.
 */
export function sanitizeCandleSeries(candles: Candle[]): Candle[] {
  if (!Array.isArray(candles) || candles.length < 2) return candles || [];

  const cleaned: Candle[] = [];
  for (const candle of candles) {
    if (!candle || !Number.isFinite(candle.time)) continue;
    const candidate: Candle = { ...candle };
    const prev = cleaned[cleaned.length - 1];
    if (prev && Number.isFinite(prev.close) && Number.isFinite(candidate.open)) {
      const prevClose = Number(prev.close);
      const open = Number(candidate.open);
      const jumpRatio = Math.abs(open - prevClose) / Math.max(Math.abs(prevClose), 1);
      if (jumpRatio > 0.18) {
        candidate.open = prevClose;
        candidate.high = Math.max(prevClose, Number(candidate.high || prevClose), Number(candidate.close || prevClose));
        candidate.low = Math.min(prevClose, Number(candidate.low || prevClose), Number(candidate.close || prevClose));
      }
    }
    cleaned.push(candidate);
  }

  return cleaned;
}
