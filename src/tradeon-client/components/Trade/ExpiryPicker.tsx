/**
 * ExpiryPicker — the sleek expiry popup (TIMER / TIME).
 *
 * Replaces the grid of buttons that used to sit permanently in the ticket:
 * clicking the expiry field opens this box, and picking an option selects it
 * and closes the popup.
 *
 *   TIMER — intervals (5s … 15m), a 3×3 grid.
 *   TIME  — the next nine clock times (e.g. 12:51 … 12:59).
 */
import { useMemo } from "react";

export interface ExpiryValue {
  kind: "TIMER" | "TIME";
  /** Trade duration handed to the API. */
  seconds: number;
  /** Chip label, e.g. "5s", "2m" or "12:51". */
  label: string;
}

const TIMER_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 5, label: "5s" },
  { seconds: 10, label: "10s" },
  { seconds: 15, label: "15s" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 120, label: "2m" },
  { seconds: 300, label: "5m" },
  { seconds: 600, label: "10m" },
  { seconds: 900, label: "15m" },
];

function clockLabel(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The next nine full minutes, as selectable clock times. */
function timeOptions(now: number): { seconds: number; label: string }[] {
  const base = new Date(now);
  base.setSeconds(0, 0);
  return Array.from({ length: 9 }, (_, i) => {
    const at = new Date(base.getTime() + (i + 1) * 60_000);
    return { seconds: Math.max(5, Math.round((at.getTime() - now) / 1000)), label: clockLabel(at) };
  });
}

interface Props {
  value: ExpiryValue;
  kind: "TIMER" | "TIME";
  name: string;
  payoutRate: number;
  activeCount: number;
  closedCount: number;
  onKindChange: (kind: "TIMER" | "TIME") => void;
  onSelect: (value: ExpiryValue) => void;
  onClose: () => void;
}

export default function ExpiryPicker({
  value,
  kind,
  name,
  payoutRate,
  activeCount,
  closedCount,
  onKindChange,
  onSelect,
  onClose,
}: Props) {
  const options = useMemo(
    () => (kind === "TIMER" ? TIMER_OPTIONS : timeOptions(Date.now())),
    [kind],
  );

  return (
    <div className="nxt-exp" role="dialog" aria-label="Select expiry">
      <header className="nxt-exp__head">
        <div className="nxt-exp__asset">
          <strong>{name}</strong>
          <span className="nxt-exp__pct">{payoutRate}%</span>
        </div>
        <button
          type="button"
          className="nxt-exp__close"
          onClick={onClose}
          aria-label="Close expiry"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="nxt-exp__tabs" role="tablist">
        {(["TIMER", "TIME"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`nxt-exp__tab ${kind === k ? "is-active" : ""}`}
            onClick={() => onKindChange(k)}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="nxt-exp__grid">
        {options.map((o) => {
          const active = value.seconds === o.seconds && value.kind === kind;
          return (
            <button
              key={`${kind}-${o.seconds}-${o.label}`}
              type="button"
              className={`nxt-exp__cell ${active ? "is-active" : ""}`}
              onClick={() => onSelect({ kind, seconds: o.seconds, label: o.label })}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <footer className="nxt-exp__foot">
        <span>Active [{activeCount}]</span>
        <span>Closed [{closedCount}]</span>
      </footer>
    </div>
  );
}
