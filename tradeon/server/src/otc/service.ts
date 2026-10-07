/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — SERVICE LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/service.js — the single server-side entry
 * point for everything OTC: the market list, the chart snapshot + history,
 * quotes, trade ENTRY price and SETTLEMENT price. Every one of those reads the
 * SAME authoritative engine stream, so the header price, the forming candle
 * close and the live price line can never disagree.
 */
import {
  ensureEngine,
  getEngine,
  currentSnapshot,
  currentCandle,
  ticksSince,
  engineHealth,
  subscribe,
  type EngineTick,
  type CurrentSnapshot,
  type OtcEngine,
} from './runner';
import { mergeCandles, timeframeMs, OTC_CANDLE_TIMEFRAMES, type Candle } from './candles';
import {
  toAssetView,
  isOtcSymbol,
  OTC_MARKET_TYPE,
  OTC_DISCLOSURE,
  realCounterpart,
  otcSessionOpen,
  configFor,
  otcInstrument,
  type AssetView,
} from './instruments';
import { generateSyntheticCandles } from './synthHistory';
import { livePayoutRate, livePayoutMap } from './payouts';
export { formatOtcDisplayName, formatAssetName, stripOtcMarkers } from './displayName';
import * as store from './store';

export { isOtcSymbol, OTC_MARKET_TYPE, OTC_DISCLOSURE, realCounterpart };
export const OTC_TIMEFRAMES = OTC_CANDLE_TIMEFRAMES;

/**
 * List OTC instruments as client assets — the USER-FACING trading catalogue.
 * Only instruments present in the in-memory registry are exposed here, so
 * stale DB rows removed from the curated catalogue never leak into the market
 * drawer. Admin still sees every row via loadOtcInstruments({activeOnly:false}).
 */
export async function listOtcAssets({ activeOnly = true }: { activeOnly?: boolean } = {}): Promise<AssetView[]> {
  const rows = await store.loadOtcInstruments({ activeOnly });
  const curated = rows.filter((row) => otcInstrument(row.symbol));
  // The persisted price_engine_status is a checkpoint written by the LAST
  // process that owned the stream; the live engine singleton is the authority.
  const engine = getEngine();
  const liveStatus = engine ? (engine.running ? 'RUNNING' : 'STOPPED') : null;
  const now = Date.now();
  return curated.map((row) =>
    toAssetView(row, {
      // The OFFERED payout, not the frozen base column — the same derivation
      // the live feed and trade placement use (`otc/payouts.ts`).
      payout: livePayoutRate(row.symbol, Number(row.payout_percentage), {
        regime: runtimeFor(row.symbol)?.state?.regime,
        now,
      }),
      session_status: row.session_status,
      price_engine_status: liveStatus || row.price_engine_status,
    })
  );
}

/**
 * The live payout rate for every OTC instrument — a single in-memory read
 * model (`otc/payouts.ts`) shared by the market list, the header tabs and the
 * trade panel. Safe to poll: it never queries the database.
 */
export function listOtcPayouts(): Record<string, number> {
  return livePayoutMap();
}

/** Engine runtime for a symbol (the runner's Runtime type is private). */
function runtimeFor(symbol: string): { state?: { regime?: string } } | undefined {
  return getEngine()?.runtimes.get(symbol) as { state?: { regime?: string } } | undefined;
}

/** True when the symbol is an OTC instrument known to the platform. */
export async function isKnownOtc(symbol: string): Promise<boolean> {
  if (!isOtcSymbol(symbol)) return false;
  return Boolean(await store.getOtcInstrument(symbol));
}

export interface OtcSnapshot extends CurrentSnapshot {
  recentCandles?: Candle[];
  payoutRate?: number;
  digits?: number;
  disclosure?: string;
  serverTime?: number;
  engine?: { running: boolean; leaderMode: string };
}

/**
 * Authoritative snapshot for one OTC instrument. Falls back to the persisted
 * checkpoint when this process is a standby (another worker owns the stream),
 * so a browser always gets a coherent picture.
 */
export async function getOtcSnapshot(symbol: string, timeframe = '1m'): Promise<OtcSnapshot | null> {
  const engine = await ensureEngine();
  const row = await store.getOtcInstrument(symbol);
  if (!row) return null;
  const frameMs = timeframeMs(timeframe) ? timeframe : '1m';
  const up = String(symbol).toUpperCase();
  const live = currentSnapshot(engine, up, frameMs);
  if (live) {
    return {
      ...live,
      recentCandles: engine.runtimes.get(up)?.candles.get(frameMs)?.finalized || [],
      payoutRate: livePayoutRate(up, Number(row.payout_percentage), { regime: live.regime }),
      digits: Number(row.decimal_precision),
      disclosure: OTC_DISCLOSURE,
      serverTime: Date.now(),
      engine: { running: engine.running, leaderMode: engine.leaderMode },
    };
  }
  // Standby / engine not started for this symbol: read the checkpoint.
  const saved = await store.loadAllMarketState();
  const state = saved.get(up);
  if (!state) return null;
  return {
    symbol: up,
    marketType: OTC_MARKET_TYPE,
    price: Number(state.current_price),
    bid: Number(state.bid),
    ask: Number(state.ask),
    sequence: Number(state.sequence_number),
    regime: state.regime_state,
    timestamp: state.last_tick_time ? Number(state.last_tick_time) : null,
    sessionStatus: row.session_status,
    tradingStatus: row.trading_status,
    currentCandle: (() => {
      try {
        const parsed = JSON.parse(state.current_candle || '{}');
        return parsed?.time ? parsed : null;
      } catch {
        return null;
      }
    })(),
    payoutRate: livePayoutRate(up, Number(row.payout_percentage), { regime: state.regime_state }),
    digits: Number(row.decimal_precision),
    disclosure: OTC_DISCLOSURE,
    serverTime: Date.now(),
    engine: { running: false, leaderMode: engine.leaderMode },
  };
}

/** REST history merged with the engine's forming candle. */
export async function getOtcCandles(symbol: string, timeframe = '1m', limit = 300): Promise<Candle[]> {
  const frame = timeframeMs(timeframe) ? timeframe : '1m';
  const up = String(symbol).toUpperCase();
  const history = await store.loadCandles(up, frame, limit);
  const engine = getEngine();
  const forming = engine ? currentCandle(engine, up, frame) : null;
  const finalized = engine?.runtimes.get(up)?.candles.get(frame)?.finalized || [];
  const merged = mergeCandles(history, [...finalized, ...(forming ? [forming] : [])]);
  let result = merged.slice(-Math.min(Math.max(1, limit), 2000));

  // Supplement with synthetic history if we don't have enough candles
  // (e.g. engine just started). This ensures the chart always has a full set.
  if (result.length < limit) {
    const synthLimit = limit - result.length;
    const synthBefore = result.length > 0 ? result[0].time : Date.now();
    const anchorPrice = result.length > 0 ? result[0].open : (otcInstrument(up)?.starting_price || 100);
    const synth = generateSyntheticCandles(up, frame, synthBefore, synthLimit, anchorPrice);
    if (synth.length) result = [...synth, ...result];
  }

  return result;
}

export interface CandlesBeforeResult {
  candles: Candle[];
  nextCursor: number | null;
  hasMore: boolean;
}

/**
 * Paginated deep-history query. Returns older candles before the given cursor
 * timestamp, plus `nextCursor` and `hasMore` so the frontend can continue
 * loading when the user pans further left.
 */
export async function getOtcCandlesBefore(
  symbol: string,
  timeframe = '1m',
  before: number,
  limit = 300
): Promise<CandlesBeforeResult> {
  const frame = timeframeMs(timeframe) ? timeframe : '1m';
  const up = String(symbol).toUpperCase();
  const result = await store.loadCandlesBefore(up, frame, Number.isFinite(Number(before)) ? Number(before) : null, limit);

  // INFINITE SCROLL: when the DB runs out of candles, generate synthetic ones
  // so the user can scroll left indefinitely.
  if (result.hasMore) {
    return result;
  }

  const dbCandles = result.candles;
  const dbCount = dbCandles.length;
  const synthLimit = Math.max(0, limit - dbCount);

  if (synthLimit <= 0) {
    // DB returned enough candles — just mark as having more for infinite scroll
    return { ...result, hasMore: true };
  }

  const synthBefore = dbCount > 0 ? dbCandles[0].time : before;
  const anchorPrice = dbCount > 0 ? dbCandles[0].open : (otcInstrument(up)?.starting_price || 100);

  const synth = generateSyntheticCandles(up, frame, synthBefore, synthLimit, anchorPrice);
  const merged = [...synth, ...dbCandles];
  const nextCursor = merged.length ? merged[0].time : null;

  return {
    candles: merged.slice(-limit),
    nextCursor,
    hasMore: true, // Always more — infinite scrolling
  };
}

export interface OtcQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  ts: number;
  changePct: null;
  volume: null;
  source: string;
  realtime: boolean;
  delayed: boolean;
  marketClosed: boolean;
  marketState: string;
  marketType: string;
  synthetic: boolean;
  sequence: number;
  stale: boolean;
  disclosure: string;
}

/**
 * Authoritative quote object for the OTC stream. `realtime: true` is truthful:
 * this process generated the tick milliseconds ago.
 */
export async function getOtcQuote(symbol: string): Promise<OtcQuote | null> {
  const snapshot = await getOtcSnapshot(symbol, '1m');
  if (!snapshot) return null;
  const age = snapshot.timestamp ? Date.now() - snapshot.timestamp : null;
  return {
    symbol: snapshot.symbol,
    price: snapshot.price,
    bid: snapshot.bid,
    ask: snapshot.ask,
    ts: snapshot.timestamp || Date.now(),
    changePct: null,
    volume: null,
    source: 'OTC',
    realtime: true,
    delayed: false,
    marketClosed: false,
    marketState: 'OPEN',
    marketType: OTC_MARKET_TYPE,
    synthetic: true,
    sequence: snapshot.sequence,
    stale: age != null && age > 30_000,
    disclosure: OTC_DISCLOSURE,
  };
}

export async function getOtcQuotes(symbols: string[]): Promise<Record<string, OtcQuote>> {
  const out: Record<string, OtcQuote> = {};
  for (const symbol of symbols || []) {
    const quote = await getOtcQuote(symbol).catch(() => null);
    if (quote) out[String(symbol).toUpperCase()] = quote;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Trade health gating + authoritative prices
 * ------------------------------------------------------------------ */

export interface TradeableGate {
  ok: boolean;
  reason?: string;
  price?: number;
  sequence?: number;
  timestamp?: number | null;
  config?: ReturnType<typeof configFor>;
}

/**
 * Is this OTC instrument safe to open a trade on RIGHT NOW?
 * Returns `{ ok, reason }` — the caller shows `reason` to the user verbatim.
 */
export async function otcTradeable(symbol: string): Promise<TradeableGate> {
  const engine = await ensureEngine();
  const row = await store.getOtcInstrument(symbol);
  if (!row) return { ok: false, reason: 'Unknown OTC market.' };
  if (row.is_active === false) return { ok: false, reason: 'This OTC market is unavailable.' };
  if (String(row.trading_status).toUpperCase() !== 'ENABLED') {
    return { ok: false, reason: `This OTC market is ${String(row.trading_status).toLowerCase()}.` };
  }
  if (!otcSessionOpen(row.session_status)) {
    return { ok: false, reason: `This OTC market is ${String(row.session_status).toLowerCase()}.` };
  }
  if (!engine.running) {
    // A standby process still serves prices from the leader's checkpoint, but
    // it must not accept trades it cannot authoritatively price.
    return { ok: false, reason: 'OTC pricing engine is not authoritative on this instance.' };
  }
  const snap = currentSnapshot(engine, row.symbol, '1m');
  if (!snap) return { ok: false, reason: 'OTC market is starting up. Try again in a moment.' };
  if (!Number.isFinite(snap.price) || snap.price <= 0) return { ok: false, reason: 'OTC price unavailable.' };
  const interval = timeframeMs('1s') as number;
  const maxAge = Math.max(5000, interval * 10);
  if (snap.timestamp && Date.now() - snap.timestamp > maxAge) {
    return { ok: false, reason: 'OTC price feed is stale. Try again in a moment.' };
  }
  return { ok: true, price: snap.price, sequence: snap.sequence, timestamp: snap.timestamp, config: configFor(row.symbol) ?? undefined };
}

export interface AuthoritativePrice {
  price: number;
  sequence: number;
  timestamp: number | null;
  source: string;
  receivedAt?: number;
}

/** Authoritative ENTRY price for an OTC trade. Server-side only. */
export async function otcEntryPrice(symbol: string): Promise<AuthoritativePrice | null> {
  const gate = await otcTradeable(symbol);
  if (!gate.ok) return null;
  return {
    price: gate.price as number,
    sequence: gate.sequence as number,
    timestamp: gate.timestamp ?? null,
    source: 'OTC',
    receivedAt: Date.now(),
  };
}

/**
 * Authoritative SETTLEMENT price: the last tick whose timestamp ≤ expiry.
 * Uses the in-memory replay buffer first, then the database — it never
 * invents a price, and returns null if none exists.
 */
export async function otcSettlementPrice(symbol: string, expiryTimestamp: number): Promise<AuthoritativePrice | null> {
  const up = String(symbol).toUpperCase();
  const expiry = Number(expiryTimestamp);
  const engine = getEngine();
  if (engine) {
    const runtime = engine.runtimes.get(up);
    if (runtime?.ring?.length) {
      const ring = runtime.ring;
      if (Number.isFinite(expiry)) {
        for (let i = ring.length - 1; i >= 0; i -= 1) {
          if (ring[i].timestamp <= expiry) {
            return { price: ring[i].price, sequence: ring[i].sequence, timestamp: ring[i].timestamp, source: 'OTC' };
          }
        }
      } else {
        const last = ring[ring.length - 1];
        return { price: last.price, sequence: last.sequence, timestamp: last.timestamp, source: 'OTC' };
      }
    }
  }
  const row = await store.tickAtOrBefore(up, Number.isFinite(expiry) ? expiry : Date.now());
  if (!row) return null;
  return { price: Number(row.price), sequence: Number((row as { sequence_number?: number }).sequence_number ?? row.sequence), timestamp: Number(row.timestamp), source: 'OTC' };
}

/* ------------------------------------------------------------------ *
 * Status + health
 * ------------------------------------------------------------------ */

export interface OtcStatus {
  symbol: string;
  marketType: string;
  synthetic: boolean;
  status: string;
  sessionStatus: string;
  tradingStatus: string;
  engineStatus: string;
  lastSequence: number | null;
  serverTime: number;
  disclosure: string;
}

/** LIVE / PAUSED / DISABLED presentation for an OTC instrument. */
export async function otcStatus(symbol: string): Promise<OtcStatus | null> {
  const row = await store.getOtcInstrument(symbol);
  if (!row) return null;
  const engine = getEngine();
  const snap = engine ? currentSnapshot(engine, row.symbol, '1m') : null;
  const session = String(row.session_status || 'OPEN').toUpperCase();
  const trading = String(row.trading_status || 'ENABLED').toUpperCase();
  const status =
    !row.is_active || trading === 'DISABLED' ? 'DISABLED'
      : session === 'MAINTENANCE' ? 'MAINTENANCE'
      : !['OPEN'].includes(session) ? 'PAUSED'
      : engine?.running ? 'LIVE'
      : 'CLOSED';
  return {
    symbol: row.symbol,
    marketType: OTC_MARKET_TYPE,
    synthetic: true,
    status,
    sessionStatus: session,
    tradingStatus: trading,
    engineStatus: engine?.running ? 'RUNNING' : 'STOPPED',
    lastSequence: snap?.sequence ?? null,
    serverTime: Date.now(),
    disclosure: OTC_DISCLOSURE,
  };
}

export async function otcHealth(): Promise<Record<string, any>> {
  // Observability must never start/reseed an engine or undo an operator STOP.
  const engine = getEngine();
  const [store_, leader] = await Promise.all([
    store.storeHealth(),
    store.readLeader().catch(() => null),
  ]);
  const health = engineHealth(engine as OtcEngine);
  const now = Date.now();
  const staleSymbols = (health.symbols || [])
    .filter((s) => s.tickAgeMs != null && s.tickAgeMs > 10_000)
    .map((s) => s.symbol);
  return {
    enabled: process.env.OTC_ENGINE_ENABLED !== 'false',
    workerId: process.env.OTC_WORKER_ID || null,
    running: health.running,
    leaderId: health.leaderId,
    leaderMode: health.leaderMode,
    leader,
    uptimeMs: health.uptimeMs,
    subscribers: health.subscriberCount,
    queueDepth: health.queueDepth,
    metrics: health.metrics,
    symbols: health.symbols,
    staleSymbols,
    store: store_,
    serverTime: now,
  };
}

/** Replay-support helper for the Socket.io gateway. */
export function replayFrom(symbol: string, sequence: number): EngineTick[] | null {
  const engine = getEngine();
  if (!engine) return null;
  return ticksSince(engine, String(symbol).toUpperCase(), sequence);
}

export { subscribe, engineHealth, getEngine };
