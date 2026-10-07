/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — ENGINE RUNNER (the authoritative 24/7 stream)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/runner.js. ONE engine per process, held
 * on globalThis. Leadership is elected in the database (advisory lock) so
 * exactly ONE process ticks each symbol; the loser stays a read-only standby.
 *
 * Responsibilities:
 *   • advance every OTC instrument on its own tick interval, aligned to
 *     server time, with bounded deterministic catch-up after downtime
 *   • maintain the authoritative price + forming candle per timeframe
 *   • keep a replay ring buffer so a reconnecting client can catch up
 *   • batch-persist ticks and upsert candles (never one write per paint)
 *   • checkpoint state periodically and on graceful shutdown
 *   • expose health metrics and an in-process pub/sub (Redis carries ticks
 *     to the Socket.io gateway — config/redis.ts)
 *
 * The engine NEVER sees a user, a trade, a stake, a direction or a balance.
 */
import { nextTick, initialState, setReferencePrice, roundTo, type OtcConfig, type EngineState } from './engine';
import {
  reduceTick,
  createCandle,
  bucketStart,
  OTC_CANDLE_TIMEFRAMES,
  timeframeMs,
  type Candle,
  type CandleState,
} from './candles';
import { deriveSeedReference } from './prng';
import { configFor, OTC_MARKET_TYPE, OTC_DISCLOSURE, type InstrumentRow } from './instruments';
import * as store from './store';
import type { OtcEngineConfigRow } from './store';
import { drainTickQueue } from './persistenceQueue';
import { publishOtcTick } from '../config/redis';

const g = globalThis as { __nexaOtcEngineV2?: OtcEngine };
const LOOP_MS = 200;
/** Bounded catch-up: never loop more than this many ticks after downtime. */
const MAX_CATCHUP_TICKS = 1800;
const MAX_QUEUE_BEFORE_FLUSH = 400;
/**
 * How long a COLD-START instrument (no persisted checkpoint) waits for its
 * first real-market quote before it starts ticking from its configured
 * `starting_price` anyway. The reference feed's first poll lands in a second or
 * two; this bound only matters when the feed is unreachable, and keeps the
 * market alive rather than stalling it forever.
 */
const REFERENCE_WAIT_MS = 20_000;

export interface EngineTick {
  symbol: string;
  timestamp: number;
  sequence: number;
  price: number;
  bid: number;
  ask: number;
  regime: string;
  /** Transport-only snapshot captured before the next tick can change OHLC. */
  candles?: Record<string, { current: Candle | null; finalized: Candle[] }>;
}

interface Runtime {
  row: InstrumentRow;
  symbol: string;
  config: OtcConfig;
  seedReference: string;
  /** Counter-based PRNG lane; the raw secret is never stored. */
  seed: string;
  state: EngineState;
  candles: Map<string, CandleState>;
  nextTickAt: number | null;
  tickCount: number;
  lastBid: number | null;
  lastAsk: number | null;
  restored: boolean;
  /** Cold start: no checkpoint yet, so hold the stream until the first real quote. */
  awaitingReference?: boolean;
  awaitingSince?: number;
  ring?: EngineTick[];
  ringBase?: number;
}

type TickSubscriber = ((tick: EngineTick) => void) & { symbols: Set<string> | null; cb?: (tick: EngineTick) => void };

interface QueueItem {
  kind: 'tick' | 'candle';
  symbol: string;
  timeframe?: string;
  timestamp?: number;
  sequence?: number;
  price?: number;
  bid?: number;
  ask?: number;
  candle?: Candle;
  finalized?: boolean;
}

export interface EngineMetrics {
  ticks: number;
  flushes: number;
  checkpoints: number;
  gaps: number;
  rejects: number;
  lastError: string | null;
  lastTickAt: number | null;
}

export interface OtcEngine {
  version: number;
  leaderId: string;
  leaderMode: string;
  running: boolean;
  starting: Promise<OtcEngine> | null;
  startedAt: number | null;
  runtimes: Map<string, Runtime>;
  subscribers: Set<TickSubscriber>;
  /** Active Socket.io OTC client connections (reported as subscriberCount). */
  connectionCount: number;
  tickQueue: QueueItem[];
  engineConfig: OtcEngineConfigRow | null;
  timer: NodeJS.Timeout | null;
  checkpointTimer: NodeJS.Timeout | null;
  flushTimer: NodeJS.Timeout | null;
  pruneTimer: NodeJS.Timeout | null;
  busy: boolean;
  metrics: EngineMetrics;
  leadership: store.Leadership | null;
  flushPromise: Promise<number> | null;
  checkpointPromise: Promise<void> | null;
}

const numOr = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function configForRow(row: InstrumentRow): OtcConfig {
  const base = configFor(row.symbol) || ({} as OtcConfig);
  return {
    ...base,
    starting_price: numOr(row.starting_price, base.starting_price),
    decimal_precision: Number.isInteger(Number(row.decimal_precision)) ? Number(row.decimal_precision) : base.decimal_precision,
    tick_interval_ms: numOr(row.tick_interval_ms, base.tick_interval_ms),
    volatility: Number(row.volatility) >= 0 ? Number(row.volatility) : base.volatility,
    spread: Number(row.spread) >= 0 ? Number(row.spread) : base.spread,
    minimum_price_step: numOr(row.minimum_price_step, base.minimum_price_step),
    min_tick_move: numOr(row.min_tick_move, base.min_tick_move),
    max_tick_move: numOr(row.max_tick_move, base.max_tick_move),
    mean_reversion: Number(row.mean_reversion) >= 0 ? Number(row.mean_reversion) : base.mean_reversion,
  };
}

/** Per-symbol in-memory runtime. */
function makeRuntime(row: InstrumentRow, secretReference: (symbol: string) => string): Runtime {
  const config = configForRow(row);
  const seedReference = row.seed_reference || secretReference(row.symbol);
  return {
    row,
    symbol: row.symbol,
    config,
    seedReference,
    seed: seedReference,
    state: initialState(config),
    candles: new Map(),
    nextTickAt: null,
    tickCount: 0,
    lastBid: null,
    lastAsk: null,
    restored: false,
  };
}

function emptyEngine(): OtcEngine {
  return {
    version: 1,
    leaderId: '',
    leaderMode: 'starting',
    running: false,
    starting: null,
    startedAt: null,
    runtimes: new Map(),
    subscribers: new Set(),
    connectionCount: 0,
    tickQueue: [],
    engineConfig: null,
    timer: null,
    checkpointTimer: null,
    flushTimer: null,
    pruneTimer: null,
    busy: false,
    metrics: { ticks: 0, flushes: 0, checkpoints: 0, gaps: 0, rejects: 0, lastError: null, lastTickAt: null },
    leadership: null,
    flushPromise: null,
    checkpointPromise: null,
  };
}

export function getEngine(): OtcEngine | null {
  return g.__nexaOtcEngineV2 || null;
}

/** Lazily start (and return) the singleton engine. Safe to call from anywhere. */
export async function ensureEngine(): Promise<OtcEngine> {
  if (g.__nexaOtcEngineV2?.running) return g.__nexaOtcEngineV2;
  if (g.__nexaOtcEngineV2?.starting) return g.__nexaOtcEngineV2.starting;
  const engine = g.__nexaOtcEngineV2 || emptyEngine();
  g.__nexaOtcEngineV2 = engine;
  engine.starting = startEngine(engine).finally(() => {
    engine.starting = null;
  });
  return engine.starting;
}

async function startEngine(engine: OtcEngine): Promise<OtcEngine> {
  engine.leaderId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    engine.engineConfig = await store.loadOtcEngineConfig();
    if (!engine.engineConfig.engine_enabled || process.env.OTC_ENGINE_ENABLED === 'false') {
      engine.leaderMode = 'disabled';
      engine.running = false;
      return engine;
    }
    await store.ensureOtcInstruments();
    const leadership = await store.tryAcquireLeadership(engine.leaderId);
    engine.leadership = leadership;
    engine.leaderMode = leadership.mode;
    if (!leadership.acquired) {
      // Another process owns the OTC stream. This process only READS state.
      engine.running = false;
      engine.leaderMode = 'standby';
      return engine;
    }

    const rows = await store.loadOtcInstruments();
    const persisted = await store.loadAllMarketState();
    const secretRef = (symbol: string) =>
      deriveSeedReference(process.env.OTC_PRNG_SECRET || 'nexatrade-otc-engine', symbol);
    const now = Date.now();

    engine.runtimes.clear();
    for (const row of rows) {
      const runtime = makeRuntime(row, secretRef);
      const saved = persisted.get(row.symbol);
      if (saved && Number(saved.sequence_number) > 0) {
        const price = Number(saved.current_price);
        if (Number.isFinite(price) && price > 0) {
          runtime.state = {
            price,
            sequence: Number(saved.sequence_number),
            regime: saved.regime_state || 'normal',
            volatility: numOr(saved.volatility_state, runtime.config.volatility),
            lastTickTime: saved.last_tick_time ? Number(saved.last_tick_time) : null,
            referencePrice: null,
            anchorPrice: price,
          };
          runtime.restored = true;
          // Seed the forming candle of every timeframe from the restored price
          // so continuity survives a restart.
          const base = runtime.state.lastTickTime || now;
          for (const { value, ms } of OTC_CANDLE_TIMEFRAMES) {
            runtime.candles.set(value, { current: createCandle(bucketStart(base, ms), ms, price), finalized: [] });
          }
        }
      }
      if (!runtime.restored) {
        for (const { value, ms } of OTC_CANDLE_TIMEFRAMES) {
          runtime.candles.set(value, { current: createCandle(bucketStart(now, ms), ms, runtime.state.price), finalized: [] });
        }
        // A never-priced instrument starts at the registry's `starting_price`,
        // which can be years behind the live market. Ramping from there paints
        // a violent jump that reads as fake candles, so hold this symbol's
        // stream until its FIRST real quote arrives and open at that price.
        runtime.awaitingReference = process.env.OTC_REFERENCE_FEED_ENABLED !== 'false';
        runtime.awaitingSince = now;
      }
      runtime.nextTickAt = (runtime.state.lastTickTime || now) + runtime.config.tick_interval_ms;
      engine.runtimes.set(row.symbol, runtime);
    }

    engine.running = true;
    engine.leaderMode = 'running';
    engine.startedAt = now;
    engine.timer = setInterval(() => { runLoop(engine).catch(() => {}); }, LOOP_MS);
    engine.flushTimer = setInterval(() => { flushTicks(engine).catch(() => {}); }, engine.engineConfig.batch_flush_ms);
    engine.checkpointTimer = setInterval(() => { checkpointAll(engine).catch(() => {}); }, engine.engineConfig.checkpoint_interval_ms);
    // Auto-prune old ticks/candles every 3 minutes to stay under the Neon 1024 MB limit.
    // 10-minute retention is safe: the in-memory ring buffer (5000 ticks/symbol ≈ 42 min)
    // covers trade settlement; synthetic history fills older chart data.
    engine.pruneTimer = setInterval(() => { store.pruneOldData(10).catch(() => {}); }, 3 * 60_000);
    if (typeof engine.timer.unref === 'function') engine.timer.unref();
    if (typeof engine.flushTimer.unref === 'function') engine.flushTimer.unref();
    if (typeof engine.checkpointTimer.unref === 'function') engine.checkpointTimer.unref();
    if (typeof engine.pruneTimer.unref === 'function') engine.pruneTimer.unref();

    await store.recordLeader(engine.leaderId, 'RUNNING').catch(() => {});
    await store.recordEvent({ kind: 'ENGINE_START', severity: 'INFO', detail: { mode: leadership.mode, symbols: engine.runtimes.size, leaderId: engine.leaderId } }).catch(() => {});
    return engine;
  } catch (err) {
    engine.metrics.lastError = (err as Error)?.message || String(err);
    engine.leaderMode = 'error';
    engine.running = false;
    if (engine.leadership?.acquired) await engine.leadership.release().catch(() => {});
    engine.leadership = null;
    await store.recordEvent({ kind: 'ENGINE_START_FAILED', severity: 'ERROR', detail: { error: engine.metrics.lastError } }).catch(() => {});
    return engine;
  }
}

/* ------------------------------------------------------------------ *
 * Tick loop
 * ------------------------------------------------------------------ */

async function runLoop(engine: OtcEngine): Promise<void> {
  if (engine.busy || !engine.running) return;
  engine.busy = true;
  try {
    const now = Date.now();
    const gapEvents: store.OtcEvent[] = [];
    for (const runtime of engine.runtimes.values()) {
      if (String(runtime.row.trading_status || 'ENABLED') === 'DISABLED') continue;
      if (runtime.awaitingReference) {
        // Cold start: hold this symbol until the first real quote arrives (or
        // the bounded wait expires) so its first candle opens at the live price.
        if (now - (runtime.awaitingSince ?? now) < REFERENCE_WAIT_MS) continue;
        runtime.awaitingReference = false;
      }
      const interval = runtime.config.tick_interval_ms;
      if (runtime.nextTickAt == null) runtime.nextTickAt = now;
      let produced = 0;
      // Bounded deterministic catch-up after downtime.
      if (now - runtime.nextTickAt > interval * MAX_CATCHUP_TICKS) {
        runtime.nextTickAt = now;
        engine.metrics.gaps += 1;
        gapEvents.push({ symbol: runtime.symbol, kind: 'DOWNTIME_GAP', severity: 'WARN', detail: { resumeAt: now } });
      }
      while (now >= runtime.nextTickAt && produced < MAX_CATCHUP_TICKS) {
        produceTick(engine, runtime, runtime.nextTickAt);
        runtime.nextTickAt += interval;
        produced += 1;
      }
    }
    if (gapEvents.length) await store.recordEvents(gapEvents);
    if (engine.tickQueue.length >= MAX_QUEUE_BEFORE_FLUSH) await flushTicks(engine);
  } finally {
    engine.busy = false;
  }
}

function produceTick(engine: OtcEngine, runtime: Runtime, timestamp: number): void {
  const out = nextTick(runtime.state, runtime.config, runtime.seed);
  runtime.state = { ...out.state, lastTickTime: timestamp };
  runtime.tickCount += 1;
  engine.metrics.ticks += 1;
  engine.metrics.lastTickAt = timestamp;
  if (out.event) {
    engine.metrics.rejects += 1;
    if (out.event.kind !== 'PRICE_CLAMPED') {
      store.recordEvent({ symbol: runtime.symbol, kind: out.event.kind, severity: 'WARN', detail: out.event }).catch(() => {});
    }
  }

  const tick: EngineTick = {
    symbol: runtime.symbol,
    timestamp,
    sequence: runtime.state.sequence,
    price: runtime.state.price,
    bid: out.tick.bid,
    ask: out.tick.ask,
    regime: runtime.state.regime,
  };
  runtime.lastBid = tick.bid;
  runtime.lastAsk = tick.ask;

  // Ring buffer for replay.
  let ring = runtime.ring;
  if (!ring) {
    ring = [];
    runtime.ring = ring;
    runtime.ringBase = tick.sequence;
  }
  ring.push(tick);
  const cap = engine.engineConfig?.replay_buffer_size || 5000;
  if (ring.length > cap) ring.splice(0, ring.length - cap);
  runtime.ringBase = ring[0]?.sequence;

  // Candles for every timeframe from the ONE authoritative tick.
  for (const { value } of OTC_CANDLE_TIMEFRAMES) {
    const ms = timeframeMs(value) as number;
    const prevState = runtime.candles.get(value) || { current: null, finalized: [] };
    const nextState = reduceTick(prevState, tick, ms);
    if (nextState !== prevState) {
      runtime.candles.set(value, nextState);
      const rolled = nextState.finalized[nextState.finalized.length - 1];
      if (rolled && prevState.current && rolled.time === prevState.current.time) {
        engine.tickQueue.push({ kind: 'candle', symbol: runtime.symbol, timeframe: value, candle: rolled, finalized: true });
      }
    }
  }

  engine.tickQueue.push({
    kind: 'tick',
    symbol: tick.symbol,
    timestamp: tick.timestamp,
    sequence: tick.sequence,
    price: tick.price,
    bid: tick.bid,
    ask: tick.ask,
  });

  // Keep the replay ring lean; only the delivery envelope carries OHLC.
  const deliveryTick: EngineTick = {
    ...tick,
    candles: Object.fromEntries([...runtime.candles].map(([frame, state]) => [
      frame, { current: state.current, finalized: state.finalized.slice(-2) },
    ])),
  };
  notify(engine, deliveryTick);
  // Publish the LEAN tick (no candle snapshots) to Redis. The gateway already
  // falls back to the engine's in-memory candle state when tick.candles is
  // absent, so serializing 15 timeframes per tick is pure waste. At 361
  // symbols × 2 ticks/s this was allocating ~6.5 MB/s of JSON strings and
  // caused the old generation to grow until OOM.
  publishOtcTick(tick).catch(() => {});
}

function notify(engine: OtcEngine, tick: EngineTick): void {
  if (!engine.subscribers.size) return;
  for (const sub of engine.subscribers) {
    if (sub.symbols && !sub.symbols.has(tick.symbol)) continue;
    try {
      // Keep entries callable: accept both the callable entries and the
      // object format (parity with the legacy HMR-safe contract).
      const cb = sub.cb || sub;
      cb(tick);
    } catch {
      /* a broken subscriber must never stop the engine */
    }
  }
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

async function flushTicks(engine: OtcEngine): Promise<number> {
  try {
    return await drainTickQueue(engine, async (queue) => {
      const candleMap = new Map<string, store.CandleUpsert>();
      const ticks: store.TickInsert[] = [];
      for (const item of queue) {
        if (item.kind === 'tick') {
          ticks.push({ symbol: item.symbol, timestamp: item.timestamp as number, sequence: item.sequence as number, price: item.price as number, bid: item.bid as number, ask: item.ask as number });
        } else if (item.candle) {
          candleMap.set(`${item.symbol}|${item.timeframe}|${item.candle.time}`, {
            symbol: item.symbol, timeframe: item.timeframe as string, startTime: item.candle.time,
            // Engine candles always carry endTime (createCandle sets it).
            endTime: item.candle.endTime!, open: item.candle.open, high: item.candle.high,
            low: item.candle.low, close: item.candle.close, tickCount: item.candle.tickCount, finalized: true,
          });
        }
      }
      await store.upsertCandles([...candleMap.values()]);
      const written = await store.insertTicksBatch(ticks);
      engine.metrics.flushes += 1;
      return written;
    });
  } catch (err) {
    engine.metrics.lastError = (err as Error)?.message || String(err);
    return 0; // the failed batch remains queued for the next flush
  }
}

async function checkpointAll(engine: OtcEngine): Promise<void> {
  if (engine.checkpointPromise) return engine.checkpointPromise;
  engine.checkpointPromise = (async () => {
    const states: store.CheckpointRow[] = [];
    const candles: store.CandleUpsert[] = [];
    // Capture one coherent snapshot before any asynchronous database writes.
    for (const runtime of engine.runtimes.values()) {
      const cur = runtime.candles.get('1m')?.current || null;
      states.push({
        symbol: runtime.symbol,
        state: { ...runtime.state, bid: runtime.lastBid, ask: runtime.lastAsk, seedReference: runtime.seedReference },
        candleJson: JSON.stringify(cur),
        engineStatus: 'RUNNING',
      });
      if (cur) {
        candles.push({
          symbol: runtime.symbol, timeframe: '1m', startTime: cur.time, endTime: cur.endTime!,
          open: cur.open, high: cur.high, low: cur.low, close: cur.close,
          tickCount: cur.tickCount, finalized: false,
        });
      }
    }
    await store.saveCheckpoints(states);
    await store.upsertCandles(candles);
    engine.metrics.checkpoints += 1;
    await store.recordLeader(engine.leaderId, 'RUNNING');
  })()
    .catch((err: Error) => {
      engine.metrics.lastError = err?.message || String(err);
    })
    .finally(() => {
      engine.checkpointPromise = null;
    });
  return engine.checkpointPromise;
}

/** Flush + checkpoint, then release leadership (graceful shutdown). */
export async function stopEngine(): Promise<void> {
  const engine = g.__nexaOtcEngineV2;
  if (!engine) return;
  if (engine.starting) await engine.starting;
  engine.running = false;
  clearInterval(engine.timer as NodeJS.Timeout);
  clearInterval(engine.flushTimer as NodeJS.Timeout);
  clearInterval(engine.checkpointTimer as NodeJS.Timeout);
  clearInterval(engine.pruneTimer as NodeJS.Timeout);
  engine.timer = engine.flushTimer = engine.checkpointTimer = engine.pruneTimer = null;
  // A disabled/standby process must not overwrite the real leader's heartbeat.
  if (!engine.leadership?.acquired) return;
  engine.leaderMode = 'stopped';
  try {
    await flushTicks(engine);
    await checkpointAll(engine);
  } catch {
    /* best effort */
  }
  await store.recordEvent({ kind: 'ENGINE_STOP', severity: 'INFO', detail: { leaderId: engine.leaderId } }).catch(() => {});
  try {
    await engine.leadership?.release?.();
  } catch {
    /* best effort */
  }
  engine.leadership = null;
  await store.recordLeader('', 'STOPPED').catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Read API used by routes / service
 * ------------------------------------------------------------------ */

export interface CurrentSnapshot {
  symbol: string;
  marketType: string;
  price: number;
  bid: number;
  ask: number;
  sequence: number;
  regime: string;
  timestamp: number | null;
  sessionStatus: string;
  tradingStatus: string;
  currentCandle: Candle | null;
}

export function currentSnapshot(engine: OtcEngine | null, symbol: string, timeframe = '1m'): CurrentSnapshot | null {
  const runtime = engine?.runtimes?.get(symbol);
  if (!runtime) return null;
  const cur = runtime.candles.get(timeframe)?.current || null;
  return {
    symbol,
    marketType: OTC_MARKET_TYPE,
    price: runtime.state.price,
    bid: runtime.lastBid ?? runtime.state.price,
    ask: runtime.lastAsk ?? runtime.state.price,
    sequence: runtime.state.sequence,
    regime: runtime.state.regime,
    timestamp: runtime.state.lastTickTime,
    sessionStatus: (runtime.row.session_status as string) || 'OPEN',
    tradingStatus: (runtime.row.trading_status as string) || 'ENABLED',
    currentCandle: cur,
  };
}

export function currentCandle(engine: OtcEngine | null, symbol: string, timeframe: string): Candle | null {
  return engine?.runtimes?.get(symbol)?.candles?.get(timeframe)?.current || null;
}

export function ticksSince(engine: OtcEngine | null, symbol: string, sequence: number): EngineTick[] | null {
  const runtime = engine?.runtimes?.get(symbol);
  if (!runtime?.ring) return null;
  const from = Number(sequence) || 0;
  if (runtime.ringBase != null && from < runtime.ringBase - 1) return null; // replay expired
  return runtime.ring.filter((t) => t.sequence > from);
}

export interface SymbolHealth {
  symbol: string;
  price: number;
  sequence: number;
  regime: string;
  lastTickTime: number | null;
  tickAgeMs: number | null;
  tickCount: number;
  tickIntervalMs: number;
  sessionStatus: string;
  tradingStatus: string;
  restored: boolean;
}

export interface EngineHealth {
  running: boolean;
  leaderId: string;
  leaderMode: string;
  startedAt: number | null;
  uptimeMs: number;
  subscriberCount: number;
  queueDepth: number;
  metrics: EngineMetrics;
  symbols: SymbolHealth[];
}

export function engineHealth(engine?: OtcEngine | null): EngineHealth {
  const e = engine || g.__nexaOtcEngineV2;
  if (!e) return { running: false, leaderId: '', leaderMode: 'stopped', startedAt: null, uptimeMs: 0, subscriberCount: 0, queueDepth: 0, metrics: { ticks: 0, flushes: 0, checkpoints: 0, gaps: 0, rejects: 0, lastError: null, lastTickAt: null }, symbols: [] };
  const now = Date.now();
  const symbols: SymbolHealth[] = [...e.runtimes.values()].map((r) => ({
    symbol: r.symbol,
    price: r.state.price,
    sequence: r.state.sequence,
    regime: r.state.regime,
    lastTickTime: r.state.lastTickTime,
    tickAgeMs: r.state.lastTickTime ? now - r.state.lastTickTime : null,
    tickCount: r.tickCount,
    tickIntervalMs: r.config.tick_interval_ms,
    sessionStatus: (r.row.session_status as string) || 'OPEN',
    tradingStatus: (r.row.trading_status as string) || 'ENABLED',
    restored: r.restored,
  }));
  return {
    running: e.running,
    leaderId: e.leaderId,
    leaderMode: e.leaderMode,
    startedAt: e.startedAt,
    uptimeMs: e.startedAt ? now - e.startedAt : 0,
    subscriberCount: e.subscribers.size + e.connectionCount,
    queueDepth: e.tickQueue.length,
    metrics: { ...e.metrics },
    symbols,
  };
}

/**
 * Subscribe to live ticks. Pass a `symbols` Set to receive only ticks for
 * those symbols — the engine skips subscribers who didn't ask for the tick's
 * symbol.
 */
export function subscribe(cb: (tick: EngineTick) => void, symbols: Iterable<string> | null = null): () => void {
  const engine = g.__nexaOtcEngineV2;
  if (!engine) return () => {};
  const wanted = symbols ? new Set(symbols) : null;
  const entry = ((tick: EngineTick) => {
    if (!wanted || wanted.has(tick.symbol)) cb(tick);
  }) as TickSubscriber;
  entry.symbols = wanted;
  entry.cb = entry; // compatible with timers that invoke sub.cb(tick)
  engine.subscribers.add(entry);
  return () => {
    engine.subscribers.delete(entry);
  };
}

/** Reload a symbol's config after an admin change (applies live). */
export async function reloadSymbol(symbol: string): Promise<void> {
  const engine = g.__nexaOtcEngineV2;
  if (!engine?.running) return;
  const row = await store.getOtcInstrument(symbol);
  if (!row) return;
  const runtime = engine.runtimes.get(row.symbol);
  if (!runtime) return;
  runtime.row = row;
  runtime.config = configForRow(row);
  await store.recordEvent({ symbol: row.symbol, kind: 'CONFIG_RELOADED', detail: { tick_interval_ms: runtime.config.tick_interval_ms } }).catch(() => {});
}

/**
 * Update a real-market reference price on one instrument's runtime. Called by
 * the reference-feed poller when a fresh real market quote is available. When
 * null, the engine continues from its last state (OTC is 24/7).
 */
export function updateReferencePrice(symbol: string, refPrice: number | null): void {
  const engine = g.__nexaOtcEngineV2;
  if (!engine?.running) return;
  const runtime = engine.runtimes.get(String(symbol).toUpperCase());
  if (!runtime) return;
  const ref = Number(refPrice);

  // Cold start: this instrument has never been priced, so `starting_price` is
  // just a placeholder. The first real quote OPENS the market at the actual
  // market level — no ramp, no teleport — and the stream starts from there.
  if (runtime.awaitingReference && Number.isFinite(ref) && ref > 0) {
    const price = roundTo(ref, runtime.config.decimal_precision);
    runtime.state = { ...runtime.state, price, referencePrice: ref, anchorPrice: price };
    const now = Date.now();
    for (const { value, ms } of OTC_CANDLE_TIMEFRAMES) {
      runtime.candles.set(value, { current: createCandle(bucketStart(now, ms), ms, price), finalized: [] });
    }
    runtime.nextTickAt = now + runtime.config.tick_interval_ms;
    runtime.awaitingReference = false;
    return;
  }

  runtime.state = setReferencePrice(runtime.state, refPrice);
}

export { OTC_DISCLOSURE };
