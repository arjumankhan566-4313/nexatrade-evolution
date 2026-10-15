/**
 * TradePanel — the premium trade ticket (desktop right sidebar / mobile bottom
 * sheet): amount, expiry, a large crisp payout figure and the high-contrast
 * UP / DOWN actions.
 *
 * The expiry field is a trigger, not a grid: clicking it opens the sleek
 * ExpiryPicker popup (TIMER / TIME tabs), and picking an option selects it and
 * closes the popup.
 *
 * Orders are REAL: the panel validates locally and hands the order to the page,
 * which posts it to `/api/trades`. Nothing here is mocked.
 */
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "../../chart/format";
import ExpiryPicker, { type ExpiryValue } from "./ExpiryPicker";
import "../../styles/trade-panel.css";

export type TradeDirection = "CALL" | "PUT";

const QUICK_STAKES = [10, 25, 50, 100, 250];

const DEFAULT_EXPIRY: ExpiryValue = { kind: "TIMER", seconds: 60, label: "1m" };

interface Props {
  name: string;
  payoutRate: number;
  price: number | null;
  balance: number;
  account: "REAL" | "DEMO";
  signedIn: boolean;
  /** Server-side rejection (insufficient balance, rate limit, …). */
  error?: string | null;
  /** Open / settled counts for the expiry popup footer. */
  activeCount?: number;
  closedCount?: number;
  onPlace: (direction: TradeDirection, stake: number, durationSec: number) => void;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const Arrow = ({ up }: { up: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {up ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
  </svg>
);

export default function TradePanel({
  name,
  payoutRate,
  price,
  balance,
  account,
  signedIn,
  error,
  activeCount = 0,
  closedCount = 0,
  onPlace,
}: Props) {
  const [stake, setStake] = useState(25);
  const [expiry, setExpiry] = useState<ExpiryValue>(DEFAULT_EXPIRY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<"TIMER" | "TIME">("TIMER");
  const [localError, setLocalError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const amount = Number(stake);
  const payout = Number.isFinite(amount) && amount > 0 ? (amount * payoutRate) / 100 : 0;

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDocDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const step = (delta: number) =>
    setStake((s) => Math.max(1, Math.min(balance || Infinity, Math.round(Number(s) + delta))));

  const place = (direction: TradeDirection) => {
    if (!signedIn) {
      setLocalError("Sign in to trade.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 1) {
      setLocalError("Enter an amount of at least $1.");
      return;
    }
    if (amount > balance) {
      setLocalError(`Insufficient ${account.toLowerCase()} balance.`);
      return;
    }
    setLocalError(null);
    onPlace(direction, amount, expiry.seconds);
  };

  const message = localError ?? error;

  return (
    <section className="nxt-card nxt-panel">
      <header className="nxt-panel__head">
        <div className="nxt-asset">
          <span className="nxt-asset__name">{name}</span>
          <span className="nxt-asset__price">
            {price != null ? formatPrice(price) : "—"}
            <span className="nxt-live">
              <i />
              live
            </span>
          </span>
        </div>
        <span className="nxt-pill">{payoutRate}%</span>
      </header>

      <div className="nxt-field">
        <div className="nxt-field__label">
          <span>Expiry Time</span>
        </div>
        <div className="nxt-expiry-select" ref={pickerRef}>
          <button
            type="button"
            className={`nxt-expiry-trigger ${pickerOpen ? "is-open" : ""}`}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => {
              setPickerKind(expiry.kind);
              setPickerOpen((v) => !v);
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="nxt-expiry-trigger__value">{expiry.label}</span>
            <small>{expiry.kind === "TIMER" ? "Timer" : "Time"}</small>
            <svg
              className="nxt-expiry-trigger__chev"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {pickerOpen && (
            <ExpiryPicker
              value={expiry}
              kind={pickerKind}
              name={name}
              payoutRate={payoutRate}
              activeCount={activeCount}
              closedCount={closedCount}
              onKindChange={setPickerKind}
              onSelect={(next) => {
                setExpiry(next);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      <div className="nxt-field">
        <div className="nxt-field__label">
          <span>Amount</span>
          <span className="nxt-field__hint">{money(balance)}</span>
        </div>
        <div className="nxt-amount">
          <button
            type="button"
            className="nxt-amount__step"
            onClick={() => step(-5)}
            aria-label="Decrease amount"
          >
            −
          </button>
          <label className="nxt-amount__field">
            <span className="nxt-amount__currency">$</span>
            <input
              className="nxt-amount__input"
              style={{ width: `${Math.max(1, String(stake).length)}ch` }}
              type="number"
              min={1}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              aria-label="Trade amount"
            />
          </label>
          <button
            type="button"
            className="nxt-amount__step"
            onClick={() => step(5)}
            aria-label="Increase amount"
          >
            +
          </button>
        </div>
        <div className="nxt-chips">
          {QUICK_STAKES.map((s) => (
            <button
              key={s}
              type="button"
              className={`nxt-chip ${stake === s ? "is-active" : ""}`}
              onClick={() => setStake(s)}
            >
              ${s}
            </button>
          ))}
        </div>
      </div>

      <div className="nxt-actions">
        <button type="button" className="nxt-btn nxt-btn--up" onClick={() => place("CALL")}>
          <Arrow up />
          Up
        </button>
        <button type="button" className="nxt-btn nxt-btn--down" onClick={() => place("PUT")}>
          <Arrow up={false} />
          Down
        </button>
      </div>

      <div className="nxt-payout">
        <div>
          <div className="nxt-payout__label">Potential Payout</div>
          <div className="nxt-payout__value">{money(payout)}</div>
        </div>
        <span className="nxt-payout__pct">+{payoutRate}%</span>
      </div>

      {message && (
        <p className="nxt-error" role="alert">
          {message}
        </p>
      )}

      <div className="nxt-balance">
        <span>{account === "REAL" ? "Real balance" : "Demo balance"}</span>
        <strong>{signedIn ? money(balance) : "—"}</strong>
      </div>
    </section>
  );
}
