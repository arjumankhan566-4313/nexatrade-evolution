/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — SYNTHETIC HISTORY GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported from legacy src/lib/otc/synthHistory.js — deterministic synthetic
 * candle history when the database has no more persisted candles (INFINITE
 * left-scroll). Pure function of (symbol, timeframe, period) using the same
 * deterministic PRNG as the engine.
 *
 * The walk is anchored to `anchorPrice` — the price the newest synthetic candle
 * has to continue from (the oldest stored candle's open, i.e. the LIVE market
 * price) — NOT to the instrument's stale `starting_price`. Anchoring to the
 * registry value used to bend the whole history into a long ramp toward a price
 * the market left behind years ago: the candles looked fake and the live price
 * line sat at the very edge of the window. A stationary walk around the anchor
 * keeps the history continuous with the live price, so the chart reads like a
 * real market. A soft ±25% band around the anchor still prevents drift.
 */
import { roundTo } from './engine';
import { configFor, otcInstrument } from './instruments';
import { deriveSeedReference, gaussian } from './prng';
import { timeframeMs, type Candle } from './candles';

const PRNG_SECRET = () => process.env.OTC_PRNG_SECRET || 'nexatrade-otc-engine';

/**
 * Generate `limit` synthetic candles ending just before `before`.
 *
 * @param anchorPrice  The open price of the newest synthetic candle's
 *                     successor (oldest DB candle open or starting_price)
 */
export function generateSyntheticCandles(
  symbol: string,
  timeframe: string,
  before: number,
  limit: number,
  anchorPrice: number
): Candle[] {
  const instrument = otcInstrument(symbol);
  if (!instrument) return [];
  const config = configFor(symbol);
  if (!config) return [];
  const frameMs = timeframeMs(timeframe);
  if (!frameMs || !Number.isFinite(before) || before <= 0) return [];

  const seed = deriveSeedReference(PRNG_SECRET(), symbol);
  const precision = config.decimal_precision;
  // The level the history has to merge into: the live price, never the
  // registry's cold-start value.
  const anchor = Number(anchorPrice) > 0 ? Number(anchorPrice) : config.starting_price;
  const vol = config.volatility;
  // Stronger mean reversion for backward generation to prevent drift
  const reversion = Math.max(0.05, (config.mean_reversion || 0.015) * 4);
  // Safety bounds: ±25% of the anchor, so the history stays a plausible market
  // around the price the user is actually looking at.
  const lo = anchor * 0.75;
  const hi = anchor * 1.25;

  // How many candle periods fit before `before`?
  const totalPeriods = Math.floor(before / frameMs);
  const candleCount = Math.min(Math.max(0, limit), totalPeriods);
  if (candleCount <= 0) return [];

  // Generate backward from the anchor price.
  // Each candle's close = next (newer) candle's open, ensuring continuity.
  let price = anchor;
  const candles: Candle[] = [];

  for (let i = 0; i < candleCount; i += 1) {
    const period = totalPeriods - i - 1;
    const time = period * frameMs;
    if (time < 0) break;

    // This candle's close = current price (successor's open)
    const close = price;

    // Deterministic shock for this period
    const shock = gaussian(seed, period, 1) * vol * price;
    // FLIPPED reversion: going backward, pull back TOWARD the anchor (the live
    // price), so the walk stays stationary instead of running off to a level
    // the market no longer trades at.
    const rev = reversion * ((price - anchor) / Math.max(anchor, 1e-12)) * price;
    // This candle's open = close - (shock + rev)
    let open = close - (shock + rev);

    // Soft clamp to prevent extreme drift
    if (open < lo) open = lo + (lo - open) * 0.3; // bounce back
    if (open > hi) open = hi - (open - hi) * 0.3;
    open = roundTo(open, precision);

    // Realistic high/low with wicks
    const wickUp = Math.abs(gaussian(seed, period, 2)) * price * vol * 2.5;
    const wickDn = Math.abs(gaussian(seed, period, 3)) * price * vol * 2.5;
    const high = roundTo(Math.max(open, close) + wickUp, precision);
    const low = roundTo(Math.min(open, close) - wickDn, precision);

    candles.push({
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: null,
      tickCount: 1,
      finalized: true,
    });

    price = open; // Move backward in time
  }

  return candles.reverse(); // Oldest first
}
