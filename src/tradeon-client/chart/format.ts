/**
 * format — price / time formatting shared by the canvas chart axis, the
 * crosshair tags and the floating readouts.
 *
 * Price precision follows the magnitude of the instrument (an OTC price of
 * 86 000 needs 2 decimals, EUR/USD needs 4-5, a micro-cap needs more), so the
 * Y axis, the crosshair price tag and the live price always print the same
 * number of decimals for the same instrument.
 */

/** Decimal places that keep an OTC price readable at its own magnitude. */
export function pricePrecision(price: number): number {
  const abs = Math.abs(Number(price));
  if (!Number.isFinite(abs) || abs === 0) return 2;
  if (abs >= 1000) return 2;
  if (abs >= 100) return 3;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 5;
  if (abs >= 0.0001) return 6;
  return 8;
}

/** Format a price with an explicit precision, else the asset's own. */
export function formatPrice(price: number, precision?: number): string {
  if (!Number.isFinite(price)) return "—";
  return price.toFixed(precision ?? pricePrecision(price));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** HH:MM — the compact clock used for grid labels and the time tag. */
export function formatClock(time: number): string {
  const d = new Date(time);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** MM/DD HH:MM — the full date + time a crosshair tag shows. */
export function formatDateTime(time: number): string {
  const d = new Date(time);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Grid label: a clock for intraday steps, a date once a step spans a day. */
export function formatAxisTime(time: number, stepMs: number): string {
  if (stepMs >= 86_400_000) {
    const d = new Date(time);
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  }
  return formatClock(time);
}
