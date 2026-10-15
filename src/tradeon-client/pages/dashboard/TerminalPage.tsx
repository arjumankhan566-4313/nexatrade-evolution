/**
 * TerminalPage — the trading terminal (User Dashboard index).
 * Ported 1:1 from legacy src/app/dashboard/page.jsx.
 *
 * Layout: left rail (60px) | center chart | right trade ticket panel.
 * The market list is a POP-UP: the rail's Markets button toggles it over the
 * chart, and picking an instrument closes it (same MarketSelector the /chart
 * page uses — category tabs, favorites star and official asset artwork).
 * OTC-only: all instruments come from the shared OTC catalogue.
 * Trades: POST /api/trades with { symbol, direction, amount, duration_seconds, account_type }.
 * Live trades: GET /api/trades/active + /api/trades/history polled every 8s.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/tradeon-client/compat/react-router-dom";
import CanvasChart from "../../components/Chart/CanvasChart";
import ChartControls from "../../components/Chart/ChartControls";
import type { ChartType } from "../../components/Chart/ChartTools";
import MarketSelector from "../../components/Market/MarketSelector";
import { useOtcAssets } from "../../hooks/useOtcAssets";
import { useAuthStore } from "../../stores/authStore";
import { useAccountModeStore } from "../../stores/accountModeStore";
import { useLivePayouts } from "../../stores/payoutStore";
import { api } from "../../lib/api";
import { fetchAllTrades, money, type UiTrade } from "../../lib/trades";
import "../../styles/terminal.css";

/* ── Trade expiry (ported from legacy TradeExpiry.jsx) ── */
const TIMER_OPTIONS = [
  { value: 5, label: "5s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 300, label: "5m" },
];
const TIME_OPTIONS = [
  { value: 3600, label: "1h" },
  { value: 7200, label: "2h" },
  { value: 10800, label: "3h" },
  { value: 14400, label: "4h" },
  { value: 21600, label: "6h" },
  { value: 28800, label: "8h" },
];
const ALL_EXPIRY_OPTIONS = [...TIMER_OPTIONS, ...TIME_OPTIONS];
const labelForExpiry = (val: number) =>
  ALL_EXPIRY_OPTIONS.find((o) => o.value === val)?.label ?? `${val}s`;

const QUICK_STAKES = [10, 25, 50, 100, 250];
const DEFAULT_SYMBOL = "BTCUSD-OTC";
const DEFAULT_TIMEFRAME = "1m";

/* The market the trader was last on. The terminal unmounts on every navigation
   (My Account, Wallet & payments), and snapping back to BTCUSD-OTC on return is
   part of the "the market keeps resetting" complaint. Module scope survives the
   remount; a full page reload starts fresh. */
let lastSymbol = DEFAULT_SYMBOL;
let lastTimeframe = DEFAULT_TIMEFRAME;

/* ── TradeExpiry dropdown (1:1 port from legacy component) ── */
function TradeExpiry({ duration, onChange }: { duration: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [expiryMode, setExpiryMode] = useState<"timer" | "time">("timer");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (TIME_OPTIONS.some((o) => o.value === duration)) setExpiryMode("time");
    else setExpiryMode("timer");
  }, [duration]);

  const display = labelForExpiry(duration);
  const options = expiryMode === "time" ? TIME_OPTIONS : TIMER_OPTIONS;
  const select = (value: number) => {
    onChange(value);
    setOpen(false);
  };

  return (
    <div className="ticket-field">
      <label>Expiry</label>
      <div ref={ref} className="expiry-ctrl">
        <button
          type="button"
          className="expiry-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="mono">{display}</span>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open && (
          <div className="expiry-popup" role="dialog" aria-label="Trade expiry">
            <div className="expiry-tabs">
              <button
                type="button"
                className={expiryMode === "timer" ? "active" : ""}
                onClick={() => setExpiryMode("timer")}
              >
                TIMER
              </button>
              <button
                type="button"
                className={expiryMode === "time" ? "active" : ""}
                onClick={() => setExpiryMode("time")}
              >
                TIME
              </button>
            </div>
            <div className="expiry-grid">
              {options.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`expiry-opt ${duration === d.value ? "active" : ""}`}
                  onClick={() => select(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── TradeActionButton (1:1 port from legacy — flat colors, ArrowUp/Down) ── */
function TradeActionButton({
  direction,
  disabled,
  onPlace,
}: {
  direction: "CALL" | "PUT";
  disabled: boolean;
  onPlace: (d: "CALL" | "PUT") => void;
}) {
  const [feedback, setFeedback] = useState(0);
  const buy = direction === "CALL";
  return (
    <button
      type="button"
      className={buy ? "ticket-buy-btn" : "ticket-sell-btn"}
      disabled={disabled}
      onClick={() => {
        setFeedback((v) => v + 1);
        onPlace(direction);
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {buy ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
      </svg>
      {buy ? "BUY" : "SELL"}
      {feedback > 0 && (
        <span
          key={feedback}
          className="ticket-click-feedback"
          aria-hidden="true"
          onAnimationEnd={() => setFeedback(0)}
        />
      )}
    </button>
  );
}

/* ── Active trade countdown item ── */
function ActiveTradeItem({ trade }: { trade: UiTrade }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((new Date(trade.expiresAt).getTime() - now) / 1000));
  return (
    <div className={`ticket-trade-row ${trade.direction === "CALL" ? "call" : "put"}`}>
      <div>
        <strong>{trade.symbol}</strong>
        <span className="dim">
          {trade.direction} · {money(trade.stake)}
          {trade.pending ? " · Confirming…" : ""}
        </span>
      </div>
      <span className={`mono countdown ${left <= 5 ? "urgent" : ""}`}>
        {left > 0 ? `${left}s` : "settling…"}
      </span>
    </div>
  );
}

export default function TerminalPage() {
  const { user, refresh, logout } = useAuthStore();
  const { mode } = useAccountModeStore();
  const navigate = useNavigate();

  /* ── State ── */
  // Shared, cached catalogue (hooks/useOtcAssets): ONE request per page load,
  // retried if it fails. Re-fetching on every mount is what left the market list
  // empty after coming back from My Account / Payment Methods.
  const { assets, loading: assetsLoading } = useOtcAssets();
  const [symbol, setSymbolState] = useState(lastSymbol);
  const [timeframe, setTimeframeState] = useState(lastTimeframe);
  const setSymbol = useCallback((s: string) => {
    lastSymbol = s;
    setSymbolState(s);
  }, []);
  const setTimeframe = useCallback((t: string) => {
    lastTimeframe = t;
    setTimeframeState(t);
  }, []);
  /** Painted series — chosen from the rail's chart-type window. */
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [stake, setStake] = useState(25);
  const [duration, setDuration] = useState(60);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [trades, setTrades] = useState<UiTrade[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "closed">("active");
  const [marketsOpen, setMarketsOpen] = useState(false);
  const lastPlacementRef = useRef(0);
  const account = mode === "real" ? "REAL" : "DEMO";

  /* ── Fetch trades (active + history) ── */
  const loadTrades = useCallback(async () => {
    try {
      const { trades: t } = await fetchAllTrades(200);
      setTrades(t);
    } catch {
      /* keep existing trades on transient failure */
    }
  }, []);

  useEffect(() => {
    loadTrades();
    const t = setInterval(loadTrades, 8000);
    return () => clearInterval(t);
  }, [loadTrades]);

  /* ── Derived values ── */
  const asset = useMemo(() => assets.find((a) => a.symbol === symbol) || null, [assets, symbol]);
  // The LIVE payout the desk is offering right now — the same shared feed the
  // market list and the /chart ticket read (`stores/payoutStore`), which is
  // also the rate the server records on the trade. Falls back to the
  // catalogue's base rate only until the first poll lands.
  const payouts = useLivePayouts();
  const payout = payouts[symbol] ?? asset?.payoutRate ?? 85;
  const potential = (Number(stake) * payout) / 100;
  const balance = account === "REAL" ? (user?.balanceReal ?? 0) : (user?.balanceDemo ?? 0);

  const accountTrades = useMemo(
    () => trades.filter((t) => t.accountType === account),
    [trades, account],
  );
  const openTrades = useMemo(
    () => accountTrades.filter((t) => t.status === "OPEN" || t.status === "SETTLING"),
    [accountTrades],
  );
  const closedTrades = useMemo(
    () => accountTrades.filter((t) => ["WON", "LOST", "VOID"].includes(t.status)).slice(0, 8),
    [accountTrades],
  );

  /* ── Trade placement ── */
  const place = useCallback(
    async (direction: "CALL" | "PUT") => {
      const investment = Number(stake);
      if (!Number.isFinite(investment) || investment <= 0) {
        setTradeError("Enter an investment amount first.");
        return;
      }
      if (investment > balance) {
        setTradeError(
          `Insufficient ${account.toLowerCase()} balance (${money(balance)}). ${account === "REAL" ? "Deposit to continue trading." : "Lower the investment or switch accounts."}`,
        );
        return;
      }
      const clickTs = Date.now();
      if (clickTs - lastPlacementRef.current < 450) {
        setTradeError("Please wait a moment before placing another trade.");
        return;
      }
      lastPlacementRef.current = clickTs;
      setTradeError(null);
      setActiveTab("active");

      const idempotencyKey = crypto.randomUUID();
      const optimisticId = `opt-${idempotencyKey}`;
      const entryTs = Date.now();
      const optimistic: UiTrade = {
        id: optimisticId,
        symbol,
        direction,
        stake: investment,
        entryPrice: 0,
        exitPrice: null,
        payoutRate: payout,
        duration,
        status: "OPEN",
        accountType: account,
        profit: null,
        createdAt: new Date(entryTs).toISOString(),
        expiresAt: new Date(entryTs + duration * 1000).toISOString(),
        pending: true,
        idempotencyKey,
      };
      setTrades((prev) => [optimistic, ...prev]);

      try {
        const res = await api<{ trade: Record<string, unknown> }>("/trades", {
          method: "POST",
          body: {
            symbol,
            direction,
            amount: investment,
            duration_seconds: duration,
            account_type: account,
          },
        });
        if (res.status >= 400) {
          const err = (res.data as { error?: string })?.error || "Trade failed";
          setTrades((prev) => prev.filter((t) => t.id !== optimisticId));
          setTradeError(err);
          if (/insufficient/i.test(err)) refresh();
          return;
        }
        setTrades((prev) => {
          const without = prev.filter((t) => t.id !== optimisticId);
          const t = res.data?.trade;
          if (t) {
            const mapped: UiTrade = {
              id: String(t.id),
              symbol: String(t.asset_pair),
              direction: t.direction as "CALL" | "PUT",
              stake: Number(t.amount),
              entryPrice: Number(t.entry_price),
              exitPrice: t.exit_price != null ? Number(t.exit_price) : null,
              payoutRate: Number(t.payout_rate),
              duration: Number(t.duration_seconds),
              status: "OPEN",
              accountType: String(t.account_type),
              profit: null,
              createdAt: String(t.created_at),
              expiresAt: String(t.expired_at),
            };
            return [mapped, ...without];
          }
          return without;
        });
        refresh();
        loadTrades();
      } catch {
        setTrades((prev) => prev.filter((t) => t.id !== optimisticId));
        setTradeError("The trade could not be confirmed. Please try again.");
      }
    },
    [stake, balance, account, symbol, duration, payout, refresh, loadTrades],
  );

  const handleSelect = useCallback(
    (s: string) => {
      setSymbol(s);
      setMarketsOpen(false);
    },
    [setSymbol],
  );

  /* The market list is a pop-up on every breakpoint: the rail's Markets button
     (or the asset trigger in the compact top bar) opens and closes it. */
  const toggleMarkets = useCallback(() => setMarketsOpen((v) => !v), []);

  const toggleFullscreen = useCallback(() => {
    const el = document.querySelector(".chart-canvas-area");
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  return (
    <div className="terminal">
      {/* ── Terminal main: left rail | chart | ticket ── */}
      <div className="terminal-main">
        {/* Left rail (60px, legacy layout) */}
        <div className="terminal-left-rail">
          <nav className="rail-nav">
            <button className="rail-nav-item active" title="Terminal">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              className={`rail-nav-item ${marketsOpen ? "active" : ""}`}
              title="Markets"
              aria-expanded={marketsOpen}
              onClick={toggleMarkets}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M7 16l4-8 4 4 4-6" />
              </svg>
            </button>
            <button className="rail-nav-item" title="History">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2" />
              </svg>
            </button>
            <button className="rail-nav-item" title="Wallet">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z" />
              </svg>
            </button>
          </nav>

          {/* ── Rail bottom: the four chart controls, then log out ── */}
          <div className="rail-bottom">
            <ChartControls
              variant="rail"
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              onToggleFullscreen={toggleFullscreen}
              chartType={chartType}
              onChartTypeChange={setChartType}
            />
            <div className="rail-divider" />
            <button
              className="rail-nav-item rail-logout"
              title="Log out"
              aria-label="Log out"
              onClick={handleLogout}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Center: chart */}
        <section className="chart-center">
          {/* Compact top bar with asset selector */}
          <div className="compact-top">
            <button
              type="button"
              className="active-market-trigger"
              aria-expanded={marketsOpen}
              onClick={toggleMarkets}
            >
              <span>
                <strong>{asset?.name || symbol}</strong>
                <small>Payout {payout}%</small>
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* Chart canvas */}
          <div className="chart-canvas-area">
            <CanvasChart symbol={symbol} timeframe={timeframe} chartType={chartType} />

            {/* Phones hide the rail, so the four controls stay reachable there as
                the legacy floating bar (same ChartControls component). */}
            <div className="terminal-mobile-tools">
              <ChartControls
                variant="floating"
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                onToggleFullscreen={toggleFullscreen}
                chartType={chartType}
                onChartTypeChange={setChartType}
              />
            </div>

            {/* Market pop-up — toggled from the rail's Markets button (or the
                asset trigger above); picking an instrument closes it. */}
            {marketsOpen && (
              <MarketSelector
                assets={assets}
                loading={assetsLoading}
                symbol={symbol}
                onSelect={handleSelect}
                onClose={() => setMarketsOpen(false)}
              />
            )}
          </div>
        </section>

        {/* Right: trade ticket panel (legacy reference layout) */}
        <aside className="glass ticket terminal-ticket">
          {/* Asset header with payout badge */}
          <div className="ticket-asset-header">
            <div className="ticket-asset-info">
              <strong>{asset?.name || symbol}</strong>
            </div>
            <span className="ticket-payout-badge">{payout}%</span>
          </div>

          {/* Trade expiry — TIMER / TIME dropdown (legacy component) */}
          <TradeExpiry duration={duration} onChange={setDuration} />

          {/* Investment input with - / + buttons */}
          <div className="ticket-field">
            <label>Investment</label>
            <div className="ticket-amount-control">
              <button
                type="button"
                onClick={() => setStake((s) => Math.max(1, Number(s) - 1))}
                aria-label="Decrease"
              >
                -
              </button>
              <input
                className="mono"
                type="number"
                min={1}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
              />
              <button
                type="button"
                onClick={() => setStake((s) => Number(s) + 1)}
                aria-label="Increase"
              >
                +
              </button>
            </div>
            {/* Quick stakes */}
            <div className="ticket-quick-stakes">
              {QUICK_STAKES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`ticket-quick-btn ${stake === s ? "active" : ""}`}
                  onClick={() => setStake(s)}
                >
                  ${s}
                </button>
              ))}
            </div>
          </div>

          {/* BUY / SELL (legacy flat buttons with ArrowUp/Down) */}
          <div className="ticket-trade-actions">
            <TradeActionButton direction="CALL" disabled={false} onPlace={place} />
            <TradeActionButton direction="PUT" disabled={false} onPlace={place} />
          </div>
          {tradeError && (
            <p className="ticket-trade-error" role="alert">
              {tradeError}
            </p>
          )}

          {/* Payout */}
          <div className="ticket-payout-row">
            <span className="dim">Payout:</span>
            <strong className="mono">{money(potential)}</strong>
          </div>

          {/* Active / Closed tabs (legacy border-bottom style) */}
          <div className="ticket-tabs">
            <button
              type="button"
              className={`ticket-tab ${activeTab === "active" ? "active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active {openTrades.length}
            </button>
            <button
              type="button"
              className={`ticket-tab ${activeTab === "closed" ? "active" : ""}`}
              onClick={() => setActiveTab("closed")}
            >
              Closed {closedTrades.length}
            </button>
          </div>

          {/* Trade list */}
          <div className="ticket-trade-list">
            {activeTab === "active" ? (
              openTrades.length === 0 ? (
                <div className="ticket-empty-state">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span>NO ACTIVE TRADES</span>
                </div>
              ) : (
                openTrades.map((t) => <ActiveTradeItem key={t.idempotencyKey || t.id} trade={t} />)
              )
            ) : closedTrades.length === 0 ? (
              <div className="ticket-empty-state">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>NO CLOSED TRADES</span>
              </div>
            ) : (
              closedTrades.map((t) => (
                <div
                  key={t.id}
                  className={`ticket-trade-row ${t.status === "WON" ? "won" : "lost"}`}
                >
                  <div>
                    <strong>{t.symbol}</strong>
                    <span className="dim">
                      {t.direction} · {money(t.stake)}
                    </span>
                  </div>
                  <span
                    className={
                      t.status === "WON"
                        ? "up mono"
                        : t.status === "VOID"
                          ? "muted mono"
                          : "down mono"
                    }
                  >
                    {t.status === "WON"
                      ? `+${money(t.profit)}`
                      : t.status === "VOID"
                        ? "void"
                        : money(t.profit)}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
