/**
 * ticks — axis tick selection for the canvas chart.
 *
 * Both axes pick "nice" round steps that re-derive from the live viewport on
 * every frame, so the grid never crowds or vanishes while zooming and panning:
 *   • price uses a 1-2-5 progression,
 *   • time uses round calendar boundaries (1s … 30d) whose spacing is at
 *     least `minLabelPx` apart at the current bar width.
 */

/** Smallest "nice" 1-2-5 step at or above `raw`. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const frac = raw / base;
  const mult = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return mult * base;
}

/**
 * Round price levels inside [lo, hi] on a 1-2-5 progression, aiming for
 * roughly `target` lines. Returns the step so callers can format labels.
 */
export function priceTicks(lo: number, hi: number, target = 6): { step: number; ticks: number[] } {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return { step: 0, ticks: [] };
  const step = niceStep(span / Math.max(1, target));
  if (!(step > 0)) return { step: 0, ticks: [] };
  const first = Math.ceil(lo / step) * step;
  const count = Math.floor((hi - first) / step + 1e-9);
  const ticks: number[] = [];
  for (let k = 0; k <= count; k++) ticks.push(first + k * step);
  return { step, ticks };
}

/** Round time steps, from one second to thirty days (all epoch aligned). */
const TIME_STEPS_MS = [
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000,
  1_800_000, 3_600_000, 7_200_000, 14_400_000, 21_600_000, 43_200_000, 86_400_000, 172_800_000,
  604_800_000, 1_209_600_000, 2_592_000_000,
];

/**
 * Round time step for the X axis: at least one candle wide (so labels never
 * crowd), large enough to keep consecutive labels `minLabelPx` apart, and
 * small enough that a handful of boundaries fall inside the visible span
 * (`spanMs`) — otherwise a wide step would leave the axis with no labels.
 */
export function timeStepMs(
  bucketMs: number,
  barWidth: number,
  minLabelPx: number,
  spanMs: number,
): number {
  const last = TIME_STEPS_MS[TIME_STEPS_MS.length - 1];
  const bw = Math.max(1, barWidth);
  const barsPerLabel = Math.max(1, Math.ceil(minLabelPx / bw));
  const minStep = Math.max(bucketMs, barsPerLabel * bucketMs);
  const maxStep = Math.max(minStep, spanMs / 3);
  let fallback = last;
  for (const step of TIME_STEPS_MS) {
    if (step >= minStep) {
      if (step <= maxStep) return step;
      if (fallback === last) fallback = step;
    }
  }
  return fallback;
}
