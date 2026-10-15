/**
 * CandleCountdown — time remaining until the current candle bucket boundary,
 * e.g. "00:47". At zero the old candle finalizes and a new one starts.
 *
 * Two behaviours beyond the legacy version:
 *  • The countdown runs on SERVER time (the feed's serverTime offset), so a
 *    skewed client clock never shows a wrong timer.
 *  • The pill's background is admin-controllable via the chart-config store
 *    (default '#FFFFFF'); the text switches between light and dark by the
 *    background's WCAG relative luminance so it stays readable on any color.
 */
import { useEffect, useState } from "react";
import { readableTextColor } from "../../chart/luminance";
import { useChartConfigStore } from "../../stores/chartConfigStore";

interface Props {
  /** Candle bucket size in milliseconds */
  bucketMs: number;
  /** Server clock minus the local clock (ms), from the OTC feed. */
  serverTimeOffset?: number;
}

export default function CandleCountdown({ bucketMs, serverTimeOffset }: Props) {
  const [remaining, setRemaining] = useState(0);
  const timerBgColor = useChartConfigStore((s) => s.timerBgColor);

  useEffect(() => {
    const tick = () => {
      // Server time = local time + the offset learned from the feed.
      const srvNow = Date.now() + (serverTimeOffset ?? 0);
      const ms = Number(bucketMs);
      if (!Number.isFinite(ms) || ms <= 0) {
        setRemaining(0);
        return;
      }
      const next = Math.ceil(srvNow / ms) * ms;
      setRemaining(Math.max(0, next - srvNow));
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [bucketMs, serverTimeOffset]);

  const totalSec = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  const isUrgent = remaining <= 3000 && remaining > 0;

  // Text color follows the admin-chosen background's luminance; the urgent
  // state keeps its amber warning only where it stays readable.
  const textColor = isUrgent ? "#b26b00" : readableTextColor(timerBgColor);

  return (
    <span
      className={`candle-countdown ${isUrgent ? "urgent" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 6,
        background: timerBgColor,
        border: "1px solid #e3e7ee",
        color: textColor,
        fontSize: 12,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        fontFamily: "ui-monospace, Menlo, monospace",
        transition: "color 0.3s ease, background 0.3s ease",
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.7 }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 14 14" />
      </svg>
      {mm}:{ss}
    </span>
  );
}
