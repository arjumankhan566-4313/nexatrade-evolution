/**
 * ChartPage — the trading screen: icon rail, top bar (favorite quick-access
 * tabs + account switcher), the canvas chart with its floating tool column,
 * and the premium trade panel (desktop right sidebar / mobile bottom sheet).
 *
 * Real data end to end: the market selector lists the full public OTC
 * catalogue (`GET /api/market/otc/assets` — the same 361 instruments the admin
 * OTC console manages, with their six categories and official artwork), prices
 * stream from the live OTC feed, and orders are posted to the real trade API
 * (`POST /api/trades`) with open positions polled from the trades endpoints.
 * Nothing is mocked and no candle is generated in the browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/tradeon-client/compat/react-router-dom";
import CanvasChart from "../components/Chart/CanvasChart";
import ChartHeader from "../components/Chart/ChartHeader";
import ChartRail from "../components/Chart/ChartRail";
import type { ChartType } from "../components/Chart/ChartTools";
import TradePanel, { type TradeDirection } from "../components/Trade/TradePanel";
import ActiveTrades from "../components/Trade/ActiveTrades";
import MarketSelector from "../components/Market/MarketSelector";
import { useOtcAssets } from "../hooks/useOtcAssets";
import { useAuthStore } from "../stores/authStore";
import { useAccountModeStore } from "../stores/accountModeStore";
import { useLivePayouts } from "../stores/payoutStore";
import { api } from "../lib/api";
import { fetchAllTrades, type UiTrade } from "../lib/trades";
import { useSheetDrag, type SheetSnap } from "../hooks/useSheetDrag";
import "../styles/chart.css";
import "../styles/chart-shell.css";
import "../styles/trade-panel.css";

const DEFAULT_SYMBOL = "BTCUSD-OTC";
const TRADES_POLL_MS = 8000;
/** Matches the server's double-click guard so a double tap never double-books. */
const PLACEMENT_GAP_MS = 450;

export default function ChartPage() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [timeframe, setTimeframe] = useState("1m");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  /** Mobile bottom-sheet stop — the ticket never covers the chart at 'peek'. */
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const panelRef = useRef<HTMLElement>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [trades, setTrades] = useState<UiTrade[]>([]);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const lastPlacement = useRef(0);

  const { user, refresh } = useAuthStore();
  const { mode } = useAccountModeStore();
  const account = mode === "real" ? "REAL" : "DEMO";
  const { assets, loading } = useOtcAssets();

  const asset = useMemo(() => assets.find((a) => a.symbol === symbol) ?? null, [assets, symbol]);
  // The ticket, the header tab and the market list all show the SAME rate: the
  // live payout the server is offering right now (`stores/payoutStore`), which
  // is also the rate the server records on the trade it places.
  const payouts = useLivePayouts();
  const payoutRate = payouts[symbol] ?? asset?.payoutRate ?? 85;
  const balance = account === "REAL" ? (user?.balanceReal ?? 0) : (user?.balanceDemo ?? 0);

  const handleLivePrice = useCallback((price: number | null) => setLivePrice(price), []);

  /* ── Live positions (real orders) ── */
  const loadTrades = useCallback(async () => {
    try {
      const { trades: rows } = await fetchAllTrades(200);
      setTrades(rows);
    } catch {
      /* keep the last known set — a transient failure must not empty the list */
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setTrades([]);
      return undefined;
    }
    loadTrades();
    const timer = setInterval(loadTrades, TRADES_POLL_MS);
    return () => clearInterval(timer);
  }, [user, loadTrades]);

  const accountTrades = useMemo(
    () => trades.filter((t) => t.accountType === account),
    [trades, account],
  );
  const activeCount = useMemo(
    () => accountTrades.filter((t) => t.status === "OPEN").length,
    [accountTrades],
  );
  const closedCount = accountTrades.length - activeCount;

  /* ── Place a real order ── */
  const place = useCallback(
    async (direction: TradeDirection, stake: number, durationSec: number) => {
      if (!user) {
        setTradeError("Sign in to place a trade.");
        return;
      }
      const investment = Number(stake);
      if (!Number.isFinite(investment) || investment < 1) {
        setTradeError("Enter an amount of at least $1.");
        return;
      }
      if (investment > balance) {
        setTradeError(
          `Insufficient ${account.toLowerCase()} balance ($${balance.toFixed(2)}). ` +
            (account === "REAL"
              ? "Deposit to continue trading."
              : "Lower the amount or switch accounts."),
        );
        return;
      }
      const now = Date.now();
      if (now - lastPlacement.current < PLACEMENT_GAP_MS) {
        setTradeError("Please wait a moment before placing another trade.");
        return;
      }
      lastPlacement.current = now;
      setTradeError(null);

      const idempotencyKey = crypto.randomUUID();
      const optimisticId = `opt-${idempotencyKey}`;
      const optimistic: UiTrade = {
        id: optimisticId,
        symbol,
        direction,
        stake: investment,
        entryPrice: livePrice ?? 0,
        exitPrice: null,
        payoutRate,
        duration: durationSec,
        status: "OPEN",
        accountType: account,
        profit: null,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + durationSec * 1000).toISOString(),
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
            duration_seconds: durationSec,
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
        setTrades((prev) => prev.filter((t) => t.id !== optimisticId));
        refresh();
        loadTrades();
      } catch {
        setTrades((prev) => prev.filter((t) => t.id !== optimisticId));
        setTradeError("The trade could not be confirmed. Please try again.");
      }
    },
    [user, balance, account, symbol, livePrice, payoutRate, refresh, loadTrades],
  );

  const handleSelect = useCallback((next: string) => {
    setSymbol(next);
    setMarketOpen(false);
    setTradeError(null);
  }, []);

  /* ── Mobile trade panel: swipe between stops, tap to cycle ── */
  const sheet = useSheetDrag(panelRef, sheetSnap, setSheetSnap);

  const cycleSheet = useCallback(() => {
    // A swipe that ends on the handle must not also count as a tap.
    if (sheet.isDragging()) return;
    setSheetSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"));
  }, [sheet]);

  return (
    <div className="nxw">
      <ChartRail />

      <div className="nxw__shell">
        <ChartHeader assets={assets} symbol={symbol} onSelect={handleSelect} />

        <div className="nxw__body">
          <div className="nxw__main">
            <CanvasChart
              symbol={symbol}
              timeframe={timeframe}
              assetName={asset?.name}
              chartType={chartType}
              onChartTypeChange={setChartType}
              onOpenMarket={() => setMarketOpen(true)}
              onTimeframeChange={setTimeframe}
              onLivePrice={handleLivePrice}
            />

            {/* Anchored market list — flush with the left edge, directly below
                the asset indicator (never a centred modal on desktop). */}
            {marketOpen && (
              <MarketSelector
                assets={assets}
                loading={loading}
                symbol={symbol}
                onSelect={handleSelect}
                onClose={() => setMarketOpen(false)}
              />
            )}
          </div>

          {/* Mobile-only scrim — only while the ticket covers the screen, so
              the chart stays directly tappable at the peek/half stops. */}
          <button
            type="button"
            className={`nxt-scrim ${sheetSnap === "full" ? "is-open" : ""}`}
            aria-label="Close trade panel"
            onClick={() => setSheetSnap("peek")}
          />

          <aside ref={panelRef} className={`nxw__panel is-${sheetSnap}`}>
            {/* Mobile-only sheet handle: drag it between peek / half / full
                (see useSheetDrag), or tap to cycle the same three stops. */}
            <button
              type="button"
              className="nxt-sheet-head"
              aria-expanded={sheetSnap !== "peek"}
              aria-label="Trade panel — drag or tap to resize"
              onPointerDown={sheet.handleProps.onPointerDown}
              onPointerMove={sheet.handleProps.onPointerMove}
              onPointerUp={sheet.handleProps.onPointerUp}
              onPointerCancel={sheet.handleProps.onPointerCancel}
              onClick={cycleSheet}
            >
              <span className="nxt-sheet-head__grip" />
              <span className="nxt-sheet-head__title">Trade Panel</span>
              <span className="nxt-sheet-head__payout">{payoutRate}% payout</span>
              <svg
                className="nxt-sheet-head__chev"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>

            <TradePanel
              name={asset?.name || symbol}
              payoutRate={payoutRate}
              price={livePrice}
              balance={balance}
              account={account}
              signedIn={Boolean(user)}
              error={tradeError}
              activeCount={activeCount}
              closedCount={closedCount}
              onPlace={place}
            />

            <ActiveTrades trades={accountTrades} symbol={symbol} markPrice={livePrice} />

            <div className="nxt-panel__foot">
              <span>{assets.length || 361} OTC markets</span>
              <Link to="/">Markets «</Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
