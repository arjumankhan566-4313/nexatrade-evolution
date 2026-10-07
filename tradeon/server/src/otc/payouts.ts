/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — LIVE PAYOUT RATES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A market's payout is not a frozen badge: an OTC desk moves it continuously
 * around the instrument's base rate, one point at a time, and it tightens when
 * the market is busy and loosens when it is calm. That is what this module
 * models — the base rate stays the admin-controlled `payout_percentage`, and
 * the OFFERED rate is derived from it.
 *
 * The rate is a PURE function of (symbol, base rate, regime, time bucket), so
 * every reader derives the SAME number for the same instant:
 *   • the public catalogue      (`GET /api/market/otc/assets`)
 *   • the live payout feed      (`GET /api/market/otc/payouts`)
 *   • trade placement           (the rate recorded on `trades.payout_rate`)
 * Nothing is random and nothing is persisted: the same request a millisecond
 * later returns the same value, and a restart cannot change history.
 *
 * The step is deliberately slow (PAYOUT_STEP_MS) — a payout that flickered
 * every tick would be unreadable, and a rate that never moved is what the
 * fixed DB column looked like. Each instrument is phase-offset by its symbol,
 * so the whole board does not change at the same instant.
 */
import { getEngine } from './runner';
import { OTC_INSTRUMENTS, type InstrumentSeed } from './instruments';

/** One payout step — how long a derived rate stays put before it may move. */
export const PAYOUT_STEP_MS = 15_000;
/** How far the offered rate may travel from the instrument's base rate. */
export const PAYOUT_BAND = 3;
/** Hard bounds — the same clamp the admin payout editor applies. */
export const PAYOUT_MIN = 10;
export const PAYOUT_MAX = 99;

/** Regime bias: a busy market pays a little less, a calm one a little more. */
const REGIME_BIAS: Record<string, number> = { quiet: 1, normal: 0, active: -1 };

interface RuntimeLike {
  row?: { payout_percentage?: string | number };
  state?: { regime?: string };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Stable 0..1 phase for a symbol — the same instrument always moves alike. */
function symbolPhase(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i += 1) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * The payout this market is offering right now, in whole percent.
 *
 * `baseRate` is the instrument's configured payout. The result stays within
 * `PAYOUT_BAND` of it, plus at most one point of regime bias — so a market can
 * never offer more than `PAYOUT_BAND + 1` points away from the rate the admin
 * configured (before the hard clamp).
 */
export function livePayoutRate(
  symbol: string,
  baseRate: number,
  options: { regime?: string | null; now?: number } = {}
): number {
  const base = clamp(Math.round(Number(baseRate) || 0), PAYOUT_MIN, PAYOUT_MAX);
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const step = Math.floor(now / PAYOUT_STEP_MS);
  const phase = symbolPhase(symbol) * Math.PI * 2;
  // Two incommensurate waves: the walk never repeats on a short cycle, so a
  // market does not visibly pulse back and forth between two numbers.
  const wave = Math.sin(step * 0.73 + phase) * 0.62 + Math.sin(step * 0.19 + phase * 1.7) * 0.38;
  const bias = REGIME_BIAS[String(options.regime || '').toLowerCase()] ?? 0;
  return clamp(Math.round(base + wave * PAYOUT_BAND + bias), PAYOUT_MIN, PAYOUT_MAX);
}

/** Engine runtime for a symbol, typed loosely (the runner's Runtime is private). */
function runtimeFor(symbol: string): RuntimeLike | undefined {
  const engine = getEngine();
  return engine?.runtimes.get(symbol) as RuntimeLike | undefined;
}

/**
 * The live rate for every OTC instrument, in one in-memory pass — the feed the
 * header and the market list read. It never touches the database: the base rate
 * comes from the engine runtime (which was loaded from the instrument row), and
 * falls back to the curated registry seed for any symbol the engine has not
 * started yet.
 */
export function livePayoutMap(options: { now?: number } = {}): Record<string, number> {
  const now = options.now ?? Date.now();
  const out: Record<string, number> = {};
  for (const seed of OTC_INSTRUMENTS as InstrumentSeed[]) {
    const runtime = runtimeFor(seed.symbol);
    const base = runtime?.row?.payout_percentage ?? seed.payout;
    out[seed.symbol] = livePayoutRate(seed.symbol, Number(base), { regime: runtime?.state?.regime, now });
  }
  return out;
}
