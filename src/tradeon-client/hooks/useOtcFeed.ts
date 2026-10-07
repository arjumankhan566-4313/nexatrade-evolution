/**
 * useOtcFeed — the live-data bridge for the chart.
 *
 * 1. On (symbol,timeframe) change: fetch historical candles + snapshot from
 *    `GET /api/market/otc/candles`, then emit `otc:subscribe` on the shared
 *    Socket.io socket to open the live stream.
 * 2. On each `otc:tick`: the payload arrives as a Micro-JSON tuple
 *    (Phase 2 · Step 2 — see platform-v2/server/src/sockets/microJson.ts), so
 *    it is parsed here into the readable OtcTick shape and merged: the live
 *    price is updated and the forming candle is replaced with the server-sent
 *    `candle`, appending any finalized `closedCandles`. The server is the
 *    authority for candle formation, so the client only merges — it never
 *    computes OHLC itself. This is the ONLY place the client touches the wire
 *    tuple shape; everything downstream stays unchanged.
 * 3. On `otc:snapshot` (keyed JSON, once per subscribe): seed the forming
 *    candle from the authoritative currentCandle.
 * 4. `otc:replay` (reconnect catch-up, also a tuple) is merged as a tick burst.
 *
 * Returns the candle array (stable ref updated in place) plus live price and
 * stream status, so the React layer can hand them straight to the chart engine.
 *
 * `options.dedicatedSocket` gives the feed its OWN connection. The gateway
 * keeps one symbol set (and one timeframe) per socket, so a page with several
 * independent charts — /dashboard/multi — would otherwise have the cells
 * overwrite each other's subscription. The single-chart terminal keeps sharing
 * the app-wide socket.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { createSocket, socket } from '../lib/socket';
import { api } from '../lib/api';
import {
  parseOtcReplay,
  parseOtcTick,
  type Candle,
  type OtcHelloPayload,
  type OtcReplayTuple,
  type OtcSnapshotPayload,
  type OtcTick,
  type OtcTickTuple,
} from '../chart/types';

export interface FeedState {
  candles: Candle[];
  livePrice: number | null;
  sequence: number;
  status: 'idle' | 'loading' | 'live' | 'error';
  error: string | null;
}

/** Hard cap on the in-memory series: live tail + any history paged in. */
const MAX_CANDLES = 2000;
/** Candles requested per backward page (infinite left-scroll). */
const OLDER_PAGE = 300;

export function useOtcFeed(
  symbol: string,
  timeframe: string,
  options: { dedicatedSocket?: boolean } = {}
) {
  const ownSocket = options.dedicatedSocket === true;
  const [state, setState] = useState<FeedState>({
    candles: [],
    livePrice: null,
    sequence: 0,
    status: 'idle',
    error: null,
  });
  const candlesRef = useRef<Candle[]>([]);
  const lastSeq = useRef(0);
  /** Set only when this feed owns its connection. */
  const ownRef = useRef<Socket | null>(null);
  /** One backward page in flight at a time. */
  const loadingOlder = useRef(false);

  const mergeTick = useCallback((tick: OtcTick) => {
    const list = candlesRef.current;
    if (!list.length) return;
    const tail = list[list.length - 1];
    // The server owns candle formation: its `candle` is the forming bucket for
    // this exact tick, so the client only replaces its forming entry with that
    // snapshot — it never derives OHLC itself.
    const forming: Candle = tick.candle
      ? { ...tick.candle }
      : { ...tail, close: tick.price, high: Math.max(tail.high, tick.price), low: Math.min(tail.low, tick.price) };
    const next = list.slice();
    const tailIdx = next.length - 1;
    if (forming.time > tail.time) {
      // New bucket: our forming candle just finalized. The server re-sends the
      // last two finalized candles on every roll (and after each resubscribe),
      // so append ONLY the candles we do not already hold. Appending the whole
      // ring duplicated the edge candles and injected a backwards time step,
      // which is what produced the repeated/flat candles at the right edge.
      next[tailIdx] = { ...tail, finalized: true };
      for (const c of tick.closedCandles ?? []) {
        if (c.time > next[next.length - 1].time) next.push({ ...c });
      }
      next.push(forming);
    } else if (forming.time === tail.time) {
      // Same bucket: update the forming candle in place.
      next[tailIdx] = forming;
    } else {
      // Tick for a bucket that is already closed (stale replay): refresh the
      // live price only — history is immutable.
      setState((s) => ({ ...s, livePrice: tick.price, sequence: tick.sequence, status: 'live' }));
      return;
    }
    // Cap the in-memory buffer (matches the live tail the engine holds).
    if (next.length > MAX_CANDLES) next.splice(0, next.length - MAX_CANDLES);
    candlesRef.current = next;
    lastSeq.current = tick.sequence;
    setState((s) => ({ ...s, candles: next, livePrice: tick.price, sequence: tick.sequence, status: 'live' }));
  }, []);

  // Open/close this feed's own connection (declared before the stream effect so
  // it has run by the time the subscription is emitted).
  useEffect(() => {
    if (!ownSocket) return undefined;
    ownRef.current = createSocket();
    return () => {
      ownRef.current?.disconnect();
      ownRef.current = null;
    };
  }, [ownSocket]);

  /**
   * Page one older block in front of the current series (infinite left-scroll).
   * The server's `before` cursor makes each page contiguous with the oldest
   * candle we hold, so the chart can prepend it without a gap or a jump.
   */
  const loadOlder = useCallback(async () => {
    const list = candlesRef.current;
    if (loadingOlder.current || !list.length || list.length >= MAX_CANDLES) return;
    loadingOlder.current = true;
    try {
      const oldest = list[0].time;
      const limit = Math.min(OLDER_PAGE, MAX_CANDLES - list.length);
      const res = await api<{ candles: Candle[] }>(
        `/market/otc/candles?symbol=${encodeURIComponent(symbol)}` +
          `&interval=${encodeURIComponent(timeframe)}&before=${oldest}&limit=${limit}`
      );
      const older = (res.data?.candles || []).filter((c) => c.time < oldest);
      if (!older.length) return;
      const next = [...older, ...candlesRef.current];
      if (next.length > MAX_CANDLES) next.splice(0, next.length - MAX_CANDLES);
      candlesRef.current = next;
      setState((s) => ({ ...s, candles: next }));
    } catch {
      /* a failed page simply leaves the current window in place */
    } finally {
      loadingOlder.current = false;
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    let cancelled = false;
    // Shared feeds use the app-wide socket; dedicated ones their own.
    const sock = ownRef.current ?? socket;
    setState({ candles: [], livePrice: null, sequence: 0, status: 'loading', error: null });
    candlesRef.current = [];
    lastSeq.current = 0;

    api<{ candles: Candle[]; snapshot: { price: number; sequence: number; currentCandle: Candle | null } | null }>(
      `/market/otc/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframe)}&limit=300`
    )
      .then((res) => {
        if (cancelled) return;
        if (res.status >= 400) {
          setState((s) => ({ ...s, status: 'error', error: 'Failed to load candles' }));
          return;
        }
        const candles = res.data.candles || [];
        candlesRef.current = candles;
        lastSeq.current = res.data.snapshot?.sequence ?? 0;
        setState((s) => ({
          ...s,
          candles,
          livePrice: res.data.snapshot?.price ?? (candles.length ? candles[candles.length - 1].close : null),
          sequence: lastSeq.current,
          status: candles.length ? 'live' : 'live',
        }));

        sock.emit('otc:subscribe', {
          symbols: [symbol],
          timeframe,
          since: lastSeq.current,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error', error: 'Network error' }));
      });

    const onHello = (_p: OtcHelloPayload) => {};
    const onSnapshot = (p: OtcSnapshotPayload) => {
      if (cancelled) return;
      const c = p.snapshot?.currentCandle;
      if (c && candlesRef.current.length) {
        const next = candlesRef.current.slice();
        next[next.length - 1] = { ...c };
        candlesRef.current = next;
        setState((s) => ({ ...s, candles: next, livePrice: p.snapshot?.price ?? s.livePrice, sequence: p.snapshot?.sequence ?? s.sequence }));
      }
    };
    // Micro-JSON tuple → readable tick, then merged exactly as before.
    const onTick = (tuple: OtcTickTuple) => {
      if (cancelled) return;
      const tick = parseOtcTick(tuple);
      if (tick.symbol !== symbol) return;
      mergeTick(tick);
    };
    const onReplay = (tuple: OtcReplayTuple) => {
      if (cancelled) return;
      const p = parseOtcReplay(tuple);
      if (p.symbol !== symbol) return;
      for (const t of p.ticks) {
        mergeTick({
          symbol: p.symbol,
          price: t.price,
          bid: t.bid,
          ask: t.ask,
          sequence: t.sequence,
          timestamp: t.timestamp,
          candle: null,
          serverTime: p.serverTime,
        });
      }
    };

    // Re-subscribe after a (re)connection. A dev-server restart — or any
    // dropped socket — leaves the gateway with no subscription for this
    // socket: the client reconnects but never re-emits `otc:subscribe`, so the
    // chart silently freezes on its last candles until a manual reload. Resume
    // from the last sequence we hold so the server can replay what we missed.
    const onConnect = () => {
      if (!candlesRef.current.length) return; // the history load emits its own subscribe
      sock.emit('otc:subscribe', { symbols: [symbol], timeframe, since: lastSeq.current });
    };
    sock.on('connect', onConnect);

    sock.on('otc:hello', onHello);
    sock.on('otc:snapshot', onSnapshot);
    sock.on('otc:tick', onTick);
    sock.on('otc:replay', onReplay);

    return () => {
      cancelled = true;
      sock.emit('otc:unsubscribe', {});
      sock.off('connect', onConnect);
      sock.off('otc:hello', onHello);
      sock.off('otc:snapshot', onSnapshot);
      sock.off('otc:tick', onTick);
      sock.off('otc:replay', onReplay);
    };
  }, [symbol, timeframe, mergeTick]);

  return { ...state, loadOlder };
}
