import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/tradeon-client/lib/apiClient";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NexaTrade admin dashboard — REAL-TIME REAL-DATA layer.
 *
 * 100% of the numbers shown come from the live database via
 * `/api/admin/dashboard`. There is NO simulated / demo data anywhere.
 *
 * Real-time refresh strategy:
 *   • SSE  — subscribes to the platform bus (`admin`, `finance`, `payments`,
 *            `settings`, `assets` topics). Any consequential change (a trade
 *            opened/settled, a deposit entering the queue, a settings change)
 *            triggers an immediate refetch.
 *   • Poll — a conservative fallback refresh every 15s so slow/edge networks
 *            stay correct even if an SSE frame is missed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const REFRESH_MS = 15000;

/* Stable reference — must not be recreated per render (useLiveEvents
   resubscribes its SSE connection whenever `topics` changes identity). */
const ADMIN_TOPICS = ["admin", "finance", "payments", "settings", "assets", "maintenance"];

export function useLiveDashboard() {
  const [range, setRange] = useState("today");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [candles, setCandles] = useState({}); // symbol -> real OHLC candles
  const [feed, setFeed] = useState("loading"); // 'live' | 'offline' | 'loading'

  const rangeRef = useRef(range);
  rangeRef.current = range;

  const load = useCallback(async () => {
    try {
      const d = await api("/api/admin/dashboard");
      setData(d);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  /* Initial + interval polling. */
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  /* SSE — refetch instantly whenever something consequential happens. */
  useLiveEvents({
    scope: "admin",
    topics: ADMIN_TOPICS,
    onEvent: (e) => {
      if (e && e.topic && e.topic !== "ping" && e.topic !== "hello") load();
    },
  });

  /* Real market candles for the trading-activity chart (on-demand). */
  const loadCandles = useCallback(async (symbol) => {
    try {
      const d = await api(
        `/api/market/candles?symbol=${encodeURIComponent(symbol)}&interval=1m&limit=40`,
      );
      const feedStatus = d.feed === "LIVE" ? "live" : "offline";
      setFeed(feedStatus);
      setCandles((prev) => ({ ...prev, [symbol]: d.candles || [] }));
    } catch {
      setFeed("offline");
      setCandles((prev) => ({ ...prev, [symbol]: [] }));
    }
  }, []);

  /* Default market candles on first load. */
  const defaultSymbol = data?.markets?.[0]?.symbol;
  useEffect(() => {
    if (defaultSymbol) loadCandles(defaultSymbol);
  }, [defaultSymbol, loadCandles]);

  const kpi = data?.kpi ?? null;
  const pnl = kpi?.pnl?.[range] ?? 0;

  return {
    range,
    setRange,
    data,
    error,
    feed,
    kpi,
    pnl,
    pending: data?.pending ?? null,
    geo: data?.geo ?? [],
    revenueSeries: data?.revenueSeries ?? [],
    callPut: data?.callPut ?? [],
    gateways: data?.gateways ?? [],
    trades: data?.trades ?? [],
    alerts: data?.alerts ?? [],
    sharpTraders: data?.sharpTraders ?? [],
    markets: data?.markets ?? [],
    candles,
    loadCandles,
  };
}
