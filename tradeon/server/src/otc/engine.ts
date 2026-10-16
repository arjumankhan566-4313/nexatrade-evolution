/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — SYNTHETIC PRICING ENGINE (pure functions)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/engine.js — the platform-owned stochastic
 * price model. The engine is a PURE FUNCTION: `nextTick(state, config, seed)`
 * returns the next authoritative state plus one tick. It reads nothing from
 * the database, the network, the clock or any user, trade, stake, direction,
 * balance or exposure. One stream per instrument is shared by every viewer.
 *
 * Model components (identical to legacy):
 *   • volatility clustering  • regimes (QUIET/NORMAL/ACTIVE) • mean reversion
 *   • gradual re-anchor toward a live reference price  • controlled shocks
 *   • hard safety clamps (per-tick min/max move, precision, validation)
 */
import { uniform, gaussian, type SeedReference } from "./prng";

export interface OtcRegimeConfig {
  volMul: number;
  drift: number;
}

export interface OtcConfig {
  starting_price: number;
  decimal_precision: number;
  tick_interval_ms: number;
  /** Per-tick standard deviation as a FRACTION of price (e.g. 5e-5 = 0.005%). */
  volatility: number;
  /** Spread as a FRACTION of price. */
  spread: number;
  /** Smallest allowed absolute price increment. */
  minimum_price_step: number;
  /** Smallest absolute movement applied when a change is due. */
  min_tick_move: number;
  /** Hard clamp on |Δp| per tick, as a FRACTION of price. */
  max_tick_move: number;
  /** Weak mean-reversion pull toward `starting_price`. 0 disables it. */
  mean_reversion: number;
  /** Gradual re-anchor rate toward a fresh real-market reference price. */
  reanchor_rate: number;
  regimes: Record<"quiet" | "normal" | "active", OtcRegimeConfig>;
  /** Per-instrument drift bias (fraction per tick). Signed. */
  drift_bias: number;
}

/** Canonical default configuration; every field is overridable per instrument. */
export const DEFAULT_OTC_CONFIG: OtcConfig = {
  starting_price: 1.1,
  decimal_precision: 5,
  tick_interval_ms: 500,
  volatility: 0.00005,
  spread: 0.00004,
  minimum_price_step: 0.00001,
  min_tick_move: 0.00001,
  max_tick_move: 0.004,
  mean_reversion: 0.015,
  reanchor_rate: 0.02,
  regimes: {
    quiet: { volMul: 0.4, drift: 0.0 },
    normal: { volMul: 1.0, drift: 0.0 },
    active: { volMul: 2.6, drift: 0.0 },
  },
  drift_bias: 0,
};

export type RegimeName = "quiet" | "normal" | "active";
const REGIME_NAMES: RegimeName[] = ["quiet", "normal", "active"];

export interface EngineState {
  price: number;
  sequence: number;
  regime: RegimeName;
  volatility: number;
  lastTickTime: number | null;
  /** The live real-market reference price; the engine gradually re-anchors. */
  referencePrice: number | null;
  /** The last price we were anchored to (for gradual convergence math). */
  anchorPrice: number;
}

export interface EngineEvent {
  kind: string;
  reason?: string | null;
  sequence?: number;
  attempted?: string;
}

export interface WireTick {
  price: number;
  bid: number;
  ask: number;
  sequence: number;
  timestamp: number | null;
  event: EngineEvent | null;
}

/** Round to a fixed number of decimals without float-noise. */
export function roundTo(value: number, precision: number): number {
  const p = Math.max(0, Math.min(12, Math.trunc(precision)));
  const factor = 10 ** p;
  return Math.round(value * factor) / factor;
}

/**
 * Validate a candidate price. Returns `{ ok, price, reason }`.
 * A rejected candidate is NEVER written to the stream — the caller falls back
 * to a safe held price and records an engine event.
 */
export function validatePrice(price: number, config: Partial<OtcConfig> = {}) {
  const cfg = { ...DEFAULT_OTC_CONFIG, ...config };
  const value = Number(price);
  if (!Number.isFinite(value)) return { ok: false, price: NaN, reason: "NON_FINITE" };
  if (value <= 0) return { ok: false, price: value, reason: "NON_POSITIVE" };
  const rounded = roundTo(value, cfg.decimal_precision);
  if (!Number.isFinite(rounded) || rounded <= 0)
    return { ok: false, price: rounded, reason: "ROUND_INVALID" };
  if (
    cfg.minimum_price_step > 0 &&
    Math.abs(rounded - value) > cfg.minimum_price_step * 0.5 + 1e-12
  ) {
    // Rounding moved the price further than one minimum step — treat as a
    // precision violation rather than silently accepting a drifty value.
    return { ok: false, price: rounded, reason: "PRECISION_VIOLATION" };
  }
  return { ok: true, price: rounded, reason: null };
}

/** The initial engine state for a fresh instrument. */
export function initialState(config: Partial<OtcConfig> = {}): EngineState {
  const cfg = { ...DEFAULT_OTC_CONFIG, ...config };
  const price = roundTo(cfg.starting_price, cfg.decimal_precision);
  return {
    price,
    sequence: 0,
    regime: "normal",
    volatility: cfg.volatility,
    lastTickTime: null,
    referencePrice: null,
    anchorPrice: price,
  };
}

/** Roll the next regime label deterministically from the sequence number. */
function nextRegime(seed: SeedReference, sequence: number, current: RegimeName): RegimeName {
  const roll = uniform(seed, sequence, 7);
  if (current === "normal") return roll < 0.12 ? "quiet" : roll > 0.94 ? "active" : "normal";
  if (current === "quiet") return roll < 0.1 ? "normal" : "quiet";
  return roll < 0.25 ? "normal" : "active"; // active regimes decay quickly
}

/**
 * Advance exactly ONE tick.
 *
 * @returns `{ tick, state, event }` — `tick` is the authoritative price for
 *   this sequence number; `event` is a non-null audit record when something
 *   was clamped or rejected.
 */
export function nextTick(
  state: EngineState | null | undefined,
  config: Partial<OtcConfig> | null,
  seed: SeedReference,
): { tick: WireTick; state: EngineState; event: EngineEvent | null } {
  const cfg = { ...DEFAULT_OTC_CONFIG, ...(config || {}) };
  const previous = Number(state?.price);
  const seq = Number(state?.sequence || 0) + 1;

  // A broken incoming state must never poison the stream.
  if (!Number.isFinite(previous) || previous <= 0) {
    const safe = initialState(cfg);
    return {
      tick: buildTick(safe.price, cfg, seq, state?.lastTickTime ?? null),
      state: { ...safe, sequence: seq },
      event: { kind: "STATE_RESET", reason: "INVALID_PREVIOUS_PRICE", sequence: seq },
    };
  }

  const regime = nextRegime(seed, seq, state?.regime || "normal");
  const regimeCfg = cfg.regimes?.[regime] || cfg.regimes?.normal || { volMul: 1, drift: 0 };

  // ── volatility clustering ────────────────────────────────────────────────
  // Mean-revert toward the regime's target vol, then take a small deterministic
  // jump so long quiet stretches build into brief active bursts.
  const targetVol = cfg.volatility * regimeCfg.volMul;
  const prevVol =
    Number.isFinite(state?.volatility) && (state as EngineState).volatility > 0
      ? (state as EngineState).volatility
      : cfg.volatility;
  const jump = uniform(seed, seq, 11) > 0.97 ? 1.8 : 1;
  let volatility = prevVol + (targetVol - prevVol) * 0.2;
  volatility *= jump;
  if (!Number.isFinite(volatility) || volatility <= 0) volatility = targetVol;

  // ── drift + weak mean reversion + gradual re-anchor ───────────────────────
  // The anchor is the live real-market reference price when available, falling
  // back to the configured starting_price. A gradual re-anchor rate closes a
  // fraction of the gap per tick so price converges without teleporting.
  const reference = state?.referencePrice;
  const hasRef = reference != null && Number.isFinite(reference) && reference > 0;
  const anchor = hasRef
    ? (reference as number)
    : cfg.starting_price > 0
      ? cfg.starting_price
      : previous;
  const reversion = cfg.mean_reversion * ((anchor - previous) / anchor);
  // Gradual re-anchor: close reanchor_rate of the remaining gap per tick.
  const reanchor = hasRef ? cfg.reanchor_rate * ((reference - previous) / anchor) : 0;
  const drift = (cfg.drift_bias || 0) + (regimeCfg.drift || 0) + reversion + reanchor;

  // ── controlled shock ──────────────────────────────────────────────────────
  const shock = gaussian(seed, seq, 1) * volatility;
  const candidate = previous * (1 + drift + shock);

  // ── integer-domain clamp ───────────────────────────────────────────────────
  // Clamping AFTER rounding in the price's own precision units guarantees the
  // maximum-move invariant holds EXACTLY (a float clamp can round past the
  // bound by one ulp). All OTC prices are decimals with a configured scale.
  const factor = 10 ** cfg.decimal_precision;
  const prevUnits = Math.round(previous * factor);
  const maxUnits = Math.max(0, Math.floor(Math.abs(prevUnits) * cfg.max_tick_move));
  let units = Math.round(candidate * factor);
  let clamped = false;
  if (units > prevUnits + maxUnits) {
    units = prevUnits + maxUnits;
    clamped = true;
  } else if (units < prevUnits - maxUnits) {
    units = prevUnits - maxUnits;
    clamped = true;
  }
  // A tick that would not visibly move is nudged by the configured minimum step
  // (never beyond the movement envelope) so a quiet stream never looks frozen.
  const stepUnits = Math.max(1, Math.round((cfg.minimum_price_step || 0) * factor));
  if (units === prevUnits && maxUnits >= 1) {
    const dir = uniform(seed, seq, 13) < 0.5 ? -1 : 1;
    units = prevUnits + dir * Math.min(stepUnits, maxUnits);
  }
  const checked = validatePrice(units / factor, cfg);
  let price: number;
  let event: EngineEvent | null = null;
  if (!checked.ok) {
    // Safety net — should be unreachable after the integer clamp, but a broken
    // state must never poison the stream.
    const dir = uniform(seed, seq, 17) < 0.5 ? -1 : 1;
    const fallbackUnits = prevUnits + dir * Math.max(1, Math.min(stepUnits, Math.max(1, maxUnits)));
    const fallback = fallbackUnits / factor;
    price =
      Number.isFinite(fallback) && fallback > 0
        ? fallback
        : roundTo(previous, cfg.decimal_precision);
    event = {
      kind: "PRICE_REJECTED",
      reason: checked.reason ?? undefined,
      sequence: seq,
      attempted: String(candidate),
    };
  } else {
    price = checked.price;
  }

  if (clamped && !event) {
    event = { kind: "PRICE_CLAMPED", reason: "MAX_TICK_MOVE", sequence: seq };
  }

  const nextState: EngineState = {
    price,
    sequence: seq,
    regime,
    volatility,
    lastTickTime: state?.lastTickTime ?? null,
    referencePrice: state?.referencePrice ?? null,
    anchorPrice: state?.anchorPrice ?? price,
  };
  return { tick: buildTick(price, cfg, seq, null, event), state: nextState, event };
}

/** Compose the wire tick: price + validated bid/ask around the spread. */
export function buildTick(
  price: number,
  config: Partial<OtcConfig> = {},
  sequence: number,
  timestamp: number | null = null,
  event: EngineEvent | null = null,
): WireTick {
  const cfg = { ...DEFAULT_OTC_CONFIG, ...config };
  const half = (cfg.spread || 0) / 2;
  let bid = roundTo(price * (1 - half), cfg.decimal_precision);
  let ask = roundTo(price * (1 + half), cfg.decimal_precision);
  if (!Number.isFinite(bid) || bid <= 0) bid = price;
  if (!Number.isFinite(ask) || ask <= 0) ask = price;
  if (bid > ask) [bid, ask] = [ask, bid];
  return { price, bid, ask, sequence, timestamp, event };
}

/**
 * Fast-forward the engine `steps` ticks (downtime recovery). Purely
 * deterministic — no timestamps, no wall clock.
 */
export function advance(
  state: EngineState,
  config: Partial<OtcConfig> = {},
  seed: SeedReference,
  steps = 0,
): { state: EngineState; events: EngineEvent[] } {
  let current = state;
  const events: EngineEvent[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(steps)); i += 1) {
    const out = nextTick(current, config, seed);
    current = out.state;
    if (out.event) events.push(out.event);
  }
  return { state: current, events };
}

/**
 * Set or clear a real-market reference price on an engine state. When set,
 * the engine gradually re-anchors toward this price over subsequent ticks.
 * When null, it continues from its last anchored state — OTC runs 24/7.
 */
export function setReferencePrice(state: EngineState, refPrice: number | null): EngineState {
  const ref = Number(refPrice);
  if (!Number.isFinite(ref) || ref <= 0) {
    return { ...state, referencePrice: null };
  }
  return { ...state, referencePrice: ref };
}

/** Human-readable regime label list (used by the admin monitor). */
export const OTC_REGIME_NAMES = REGIME_NAMES;
