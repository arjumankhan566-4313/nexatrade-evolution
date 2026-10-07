/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — PERSISTENCE / STORE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/otc/store.js — every database access for the
 * OTC module lives here. Strictly ADDITIVE: it only touches the six `otc_*`
 * tables, so it can never affect users, balances, trades, KYC or settings.
 *
 * Ticks are written in BATCHES; latest state lives in memory and is
 * checkpointed periodically and on graceful shutdown.
 */
import { one, sql, uuid, pool } from '../config/db';
import { OTC_INSTRUMENTS, configFor, type InstrumentRow } from './instruments';
import type { Candle } from './candles';
import type { EngineState } from './engine';

type Row = Record<string, any>;

/** Serialize a JS value for a TEXT/JSON column. */
const json = (v: unknown) => JSON.stringify(v ?? null);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

async function many(text: string, params: unknown[] = []): Promise<Row[]> {
  const res = await sql(text, params);
  return res.rows as Row[];
}

export interface OtcEngineConfigRow {
  engine_enabled: boolean;
  tick_retention_days: number;
  checkpoint_interval_ms: number;
  replay_buffer_size: number;
  batch_flush_ms: number;
  auto_recover: boolean;
  gap_policy: string;
}

export interface TickRow {
  timestamp: number;
  sequence: number;
  price: number;
  bid: number;
  ask: number;
}

export interface CandleUpsert {
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickCount: number;
  finalized: boolean;
}

/* ------------------------------------------------------------------ *
 * Instruments + engine config
 * ------------------------------------------------------------------ */

let catalogueInitialization: Promise<void> | null = null;

/** Bootstrap once per process, never once per admin read/control action. */
export function ensureOtcInstruments(): Promise<void> {
  if (!catalogueInitialization) {
    catalogueInitialization = syncOtcCatalogue().catch((err) => {
      catalogueInitialization = null;
      throw err;
    });
  }
  return catalogueInitialization;
}

async function syncOtcCatalogue(): Promise<void> {
  // Same seed values and conflict fields as legacy, in ONE database roundtrip.
  const rows = OTC_INSTRUMENTS.map((instrument, index) => {
    const cfg = configFor(instrument.symbol)!;
    return {
      id: uuid(), symbol: instrument.symbol, display_name: instrument.displayName,
      base_asset: instrument.base, quote_asset: instrument.quote,
      starting_price: cfg.starting_price, decimal_precision: cfg.decimal_precision,
      tick_interval_ms: cfg.tick_interval_ms, volatility: cfg.volatility, spread: cfg.spread,
      minimum_price_step: cfg.minimum_price_step, min_tick_move: cfg.min_tick_move,
      max_tick_move: cfg.max_tick_move, mean_reversion: cfg.mean_reversion,
      payout_percentage: instrument.payout, sort_order: 50_000 + index * 10,
    };
  });
  await sql(`INSERT INTO otc_instruments
    (id,symbol,display_name,market_type,base_asset,quote_asset,starting_price,
     decimal_precision,tick_interval_ms,volatility,spread,minimum_price_step,
     min_tick_move,max_tick_move,mean_reversion,payout_percentage,sort_order)
    SELECT id,symbol,display_name,'OTC',base_asset,quote_asset,starting_price,
      decimal_precision,tick_interval_ms,volatility,spread,minimum_price_step,
      min_tick_move,max_tick_move,mean_reversion,payout_percentage,sort_order
    FROM jsonb_to_recordset($1::jsonb) AS batch(id text,symbol text,display_name text,
      base_asset text,quote_asset text,starting_price numeric,decimal_precision integer,
      tick_interval_ms integer,volatility numeric,spread numeric,minimum_price_step numeric,
      min_tick_move numeric,max_tick_move numeric,mean_reversion numeric,
      payout_percentage numeric,sort_order integer)
    ON CONFLICT (symbol) DO UPDATE SET tick_interval_ms=EXCLUDED.tick_interval_ms,
      decimal_precision=EXCLUDED.decimal_precision,minimum_price_step=EXCLUDED.minimum_price_step,
      min_tick_move=EXCLUDED.min_tick_move,volatility=EXCLUDED.volatility,
      spread=EXCLUDED.spread,display_name=EXCLUDED.display_name
    WHERE (otc_instruments.tick_interval_ms,otc_instruments.decimal_precision,
      otc_instruments.minimum_price_step,otc_instruments.min_tick_move,
      otc_instruments.volatility,otc_instruments.spread,otc_instruments.display_name)
      IS DISTINCT FROM (EXCLUDED.tick_interval_ms,EXCLUDED.decimal_precision,
      EXCLUDED.minimum_price_step,EXCLUDED.min_tick_move,EXCLUDED.volatility,
      EXCLUDED.spread,EXCLUDED.display_name)`, [json(rows)]);
  await sql(`INSERT INTO otc_engine_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
}

export async function loadOtcInstruments({ activeOnly = true }: { activeOnly?: boolean } = {}): Promise<InstrumentRow[]> {
  return (await many(
    `SELECT * FROM otc_instruments ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY sort_order ASC, symbol ASC`
  )) as InstrumentRow[];
}

export async function getOtcInstrument(symbol: string): Promise<InstrumentRow | null> {
  return (await one('SELECT * FROM otc_instruments WHERE symbol = $1', [String(symbol || '').toUpperCase()])) as InstrumentRow | null;
}

/**
 * Create a brand-new OTC instrument from the admin console. The engine config
 * is explicit (there is no catalogue entry to inherit from), and the row is
 * only ever inserted — never replacing an existing instrument.
 */
export async function createOtcInstrument(input: Record<string, any>): Promise<InstrumentRow | null> {
  const symbol = String(input.symbol || '').toUpperCase();
  const row = {
    symbol,
    display_name: String(input.displayName || symbol).slice(0, 60),
    base_asset: String(input.base || symbol.replace(/[^A-Z]/g, '').slice(0, 6) || 'OTC'),
    quote_asset: String(input.quote || 'USD').slice(0, 6),
    starting_price: Number(input.startingPrice),
    decimal_precision: Number(input.digits ?? 2),
    tick_interval_ms: Number(input.tickIntervalMs ?? 1000),
    volatility: Number(input.volatility ?? 0.00005),
    spread: Number(input.spread ?? 0.00004),
    minimum_price_step: Number(input.minimumPriceStep ?? 10 ** -(Number(input.digits ?? 2))),
    min_tick_move: Number(input.minTickMove ?? 10 ** -(Number(input.digits ?? 2))),
    max_tick_move: Number(input.maxTickMove ?? 0.05),
    mean_reversion: Number(input.meanReversion ?? 0.01),
    payout_percentage: Number(input.payout ?? 85),
    sort_order: Number(input.sortOrder ?? 60_000),
  };
  await sql(
    `INSERT INTO otc_instruments
       (id, symbol, display_name, market_type, base_asset, quote_asset,
        starting_price, decimal_precision, tick_interval_ms, volatility, spread,
        minimum_price_step, min_tick_move, max_tick_move, mean_reversion,
        payout_percentage, sort_order)
     VALUES ($1,$2,$3,'OTC',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      uuid(), row.symbol, row.display_name, row.base_asset, row.quote_asset,
      row.starting_price, row.decimal_precision, row.tick_interval_ms, row.volatility, row.spread,
      row.minimum_price_step, row.min_tick_move, row.max_tick_move, row.mean_reversion,
      row.payout_percentage, row.sort_order,
    ]
  );
  return getOtcInstrument(symbol);
}

export async function updateOtcInstrument(symbol: string, patch: Record<string, any>): Promise<InstrumentRow | null> {
  const allowed = [
    'display_name', 'trading_status', 'session_status', 'payout_percentage',
    'min_stake', 'max_stake', 'exposure_limit', 'volatility', 'spread',
    'tick_interval_ms', 'decimal_precision', 'minimum_price_step', 'min_tick_move',
    'max_tick_move', 'mean_reversion', 'retention_days', 'is_active', 'sort_order',
    'starting_price', 'price_engine_status',
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = $${params.length + 1}`);
    params.push(patch[key]);
  }
  if (!sets.length) return getOtcInstrument(symbol);
  sets.push('updated_at = NOW()');
  params.push(String(symbol).toUpperCase());
  await sql(`UPDATE otc_instruments SET ${sets.join(', ')} WHERE symbol = $${params.length}`, params);
  return getOtcInstrument(symbol);
}

export async function loadOtcEngineConfig(): Promise<OtcEngineConfigRow> {
  const row = await one('SELECT * FROM otc_engine_config WHERE id = 1');
  return {
    engine_enabled: row ? (row as Row).engine_enabled !== false : true,
    tick_retention_days: Number((row as Row)?.tick_retention_days ?? 14),
    checkpoint_interval_ms: Number((row as Row)?.checkpoint_interval_ms ?? 5000),
    replay_buffer_size: Number((row as Row)?.replay_buffer_size ?? 5000),
    batch_flush_ms: Number((row as Row)?.batch_flush_ms ?? 250),
    auto_recover: row ? (row as Row).auto_recover !== false : true,
    gap_policy: (row as Row)?.gap_policy || 'RESUME_WITH_GAP',
  };
}

export async function updateOtcEngineConfig(patch: Record<string, any>): Promise<OtcEngineConfigRow> {
  const allowed = ['engine_enabled', 'tick_retention_days', 'checkpoint_interval_ms', 'replay_buffer_size', 'batch_flush_ms', 'auto_recover', 'gap_policy'];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = $${params.length + 1}`);
    params.push(patch[key]);
  }
  if (!sets.length) return loadOtcEngineConfig();
  sets.push('updated_at = NOW()');
  params.push(1);
  await sql(`UPDATE otc_engine_config SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return loadOtcEngineConfig();
}

/* ------------------------------------------------------------------ *
 * Market state (checkpoint / restore)
 * ------------------------------------------------------------------ */

export async function loadAllMarketState(): Promise<Map<string, Row>> {
  const rows = await many('SELECT * FROM otc_market_state');
  return new Map(rows.map((r) => [String(r.symbol), r]));
}

export interface CheckpointRow {
  symbol: string;
  state: EngineState & { bid: number | null; ask: number | null; seedReference: string };
  candleJson: string;
  engineStatus: string;
}

export async function saveCheckpoint(symbol: string, { state, candleJson, engineStatus }: Omit<CheckpointRow, 'symbol'>): Promise<void> {
  await sql(
    `INSERT INTO otc_market_state
       (symbol, current_price, bid, ask, sequence_number, regime_state, volatility_state,
        seed_reference, last_tick_time, engine_status, current_candle, checkpoint_time, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
     ON CONFLICT (symbol) DO UPDATE SET
       current_price = EXCLUDED.current_price,
       bid = EXCLUDED.bid,
       ask = EXCLUDED.ask,
       sequence_number = EXCLUDED.sequence_number,
       regime_state = EXCLUDED.regime_state,
       volatility_state = EXCLUDED.volatility_state,
       seed_reference = EXCLUDED.seed_reference,
       last_tick_time = EXCLUDED.last_tick_time,
       engine_status = EXCLUDED.engine_status,
       current_candle = EXCLUDED.current_candle,
       checkpoint_time = NOW(),
       updated_at = NOW()`,
    [
      symbol, state.price, state.bid ?? state.price, state.ask ?? state.price,
      state.sequence, state.regime, state.volatility,
      state.seedReference || '', state.lastTickTime ?? null, engineStatus || 'RUNNING',
      candleJson || '{}',
    ]
  );
}

/** All symbols in one checkpoint write, with a monotonic-sequence guard. */
export async function saveCheckpoints(rows: CheckpointRow[]): Promise<void> {
  if (!rows.length) return;
  const batch = rows.map(({ symbol, state, candleJson, engineStatus }) => ({
    symbol, current_price: state.price, bid: state.bid ?? state.price, ask: state.ask ?? state.price,
    sequence_number: state.sequence, regime_state: state.regime, volatility_state: state.volatility,
    seed_reference: state.seedReference || '', last_tick_time: state.lastTickTime ?? null,
    engine_status: engineStatus || 'RUNNING', current_candle: candleJson || '{}',
  }));
  await sql(`INSERT INTO otc_market_state
    (symbol,current_price,bid,ask,sequence_number,regime_state,volatility_state,
     seed_reference,last_tick_time,engine_status,current_candle,checkpoint_time,updated_at)
    SELECT symbol,current_price,bid,ask,sequence_number,regime_state,volatility_state,
      seed_reference,last_tick_time,engine_status,current_candle,NOW(),NOW()
    FROM jsonb_to_recordset($1::jsonb) AS batch(symbol text,current_price numeric,bid numeric,
      ask numeric,sequence_number bigint,regime_state text,volatility_state numeric,
      seed_reference text,last_tick_time bigint,engine_status text,current_candle text)
    ON CONFLICT (symbol) DO UPDATE SET current_price=EXCLUDED.current_price,
      bid=EXCLUDED.bid,ask=EXCLUDED.ask,sequence_number=EXCLUDED.sequence_number,
      regime_state=EXCLUDED.regime_state,volatility_state=EXCLUDED.volatility_state,
      seed_reference=EXCLUDED.seed_reference,last_tick_time=EXCLUDED.last_tick_time,
      engine_status=EXCLUDED.engine_status,current_candle=EXCLUDED.current_candle,
      checkpoint_time=NOW(),updated_at=NOW()
    WHERE EXCLUDED.sequence_number >= otc_market_state.sequence_number`, [json(batch)]);
}

export async function setEngineStatus(symbol: string, engineStatus: string): Promise<void> {
  await sql(
    `UPDATE otc_market_state SET engine_status = $2, updated_at = NOW() WHERE symbol = $1`,
    [symbol, engineStatus]
  ).catch(() => {});
}

/** Record the elected leader + heartbeat (observability + crash detection). */
export async function recordLeader(leaderId: string, engineStatus = 'RUNNING'): Promise<void> {
  await sql(
    `INSERT INTO otc_market_state (symbol, engine_status, leader_id, leader_heartbeat)
     VALUES ('__ENGINE__', $1, $2, NOW())
     ON CONFLICT (symbol) DO UPDATE SET engine_status = EXCLUDED.engine_status,
       leader_id = EXCLUDED.leader_id, leader_heartbeat = NOW(), updated_at = NOW()`,
    [engineStatus, leaderId]
  ).catch(() => {});
}

export async function readLeader(): Promise<{
  leaderId: string;
  engineStatus: string;
  heartbeatAt: number | null;
  isStale: boolean;
} | null> {
  const row = (await one(`SELECT * FROM otc_market_state WHERE symbol = '__ENGINE__'`).catch(() => null)) as Row | null;
  if (!row) return null;
  return {
    leaderId: row.leader_id || '',
    engineStatus: row.engine_status || 'STOPPED',
    heartbeatAt: row.leader_heartbeat ? new Date(row.leader_heartbeat).getTime() : null,
    isStale: row.leader_heartbeat ? Date.now() - new Date(row.leader_heartbeat).getTime() > 15_000 : true,
  };
}

/* ------------------------------------------------------------------ *
 * Ticks (batched) + replay
 * ------------------------------------------------------------------ */

export interface TickInsert {
  symbol: string;
  timestamp: number;
  sequence: number;
  price: number;
  bid: number;
  ask: number;
}

export async function insertTicksBatch(rows: TickInsert[]): Promise<number> {
  if (!rows?.length) return 0;
  const symbols = rows.map((r) => r.symbol);
  const stamps = rows.map((r) => r.timestamp);
  const seqs = rows.map((r) => r.sequence);
  const prices = rows.map((r) => r.price);
  const bids = rows.map((r) => r.bid);
  const asks = rows.map((r) => r.ask);
  const res = await sql(
    `INSERT INTO otc_price_ticks (symbol, timestamp, sequence_number, price, bid, ask)
     SELECT s, ts, q, p, b, a
     FROM UNNEST($1::text[],$2::bigint[],$3::bigint[],$4::numeric[],$5::numeric[],$6::numeric[])
       AS t(s, ts, q, p, b, a)
     ON CONFLICT (symbol, sequence_number) DO NOTHING`,
    [symbols, stamps, seqs, prices, bids, asks]
  );
  return res.rowCount ?? rows.length;
}

export async function loadTicksAfter(symbol: string, sequence: number, limit = 2000): Promise<TickRow[]> {
  return many(
    `SELECT timestamp, sequence_number, price, bid, ask FROM otc_price_ticks
      WHERE symbol = $1 AND sequence_number > $2 ORDER BY sequence_number ASC LIMIT $3`,
    [symbol, Number(sequence) || 0, Math.min(Math.max(1, limit), 20_000)]
  ) as Promise<TickRow[]>;
}

export async function loadRecentTicks(symbol: string, limit = 200): Promise<TickRow[]> {
  const rows = await many(
    `SELECT timestamp, sequence_number, price, bid, ask FROM otc_price_ticks
      WHERE symbol = $1 ORDER BY sequence_number DESC LIMIT $2`,
    [symbol, Math.min(Math.max(1, limit), 20_000)]
  );
  return rows.reverse() as TickRow[];
}

/** Last authoritative tick at or before a timestamp (settlement rule). */
export async function tickAtOrBefore(symbol: string, timestamp: number): Promise<TickRow | null> {
  return one(
    `SELECT timestamp, sequence_number, price, bid, ask FROM otc_price_ticks
      WHERE symbol = $1 AND timestamp <= $2 ORDER BY timestamp DESC LIMIT 1`,
    [String(symbol || '').toUpperCase(), Number(timestamp) || Date.now()]
  ) as Promise<TickRow | null>;
}

export async function pruneTicks(retentionDays = 14): Promise<unknown> {
  const days = Math.max(1, Math.min(365, Number(retentionDays) || 14));
  return sql(`DELETE FROM otc_price_ticks WHERE created_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
}

/**
 * Aggressive auto-prune: delete ticks and candles older than `retentionMinutes`.
 * The OTC engine generates ~1 GB/hour of tick+candle data across 361 instruments
 * and 15 timeframes; without pruning the Neon 1024 MB limit is hit within an hour.
 * Synthetic candle history (synthHistory.ts) fills in older chart data, so only
 * recent rows need to be persisted.
 */
export async function pruneOldData(retentionMinutes = 30): Promise<{ ticks: number; candles: number }> {
  const mins = Math.max(1, Number(retentionMinutes) || 30);
  const interval = `($1 || ' minutes')::interval`;
  const tickRes = await sql(`DELETE FROM otc_price_ticks WHERE created_at < NOW() - ${interval}`, [String(mins)]);
  const candleRes = await sql(`DELETE FROM otc_candles WHERE created_at < NOW() - ${interval}`, [String(mins)]);
  return { ticks: tickRes.rowCount ?? 0, candles: candleRes.rowCount ?? 0 };
}

/* ------------------------------------------------------------------ *
 * Candles
 * ------------------------------------------------------------------ */

export async function upsertCandle(candle: CandleUpsert): Promise<void> {
  await sql(
    `INSERT INTO otc_candles (symbol, timeframe, start_time, end_time, open, high, low, close, tick_count, finalized)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (symbol, timeframe, start_time) DO UPDATE SET
       end_time = EXCLUDED.end_time, open = EXCLUDED.open, high = EXCLUDED.high,
       low = EXCLUDED.low, close = EXCLUDED.close, tick_count = EXCLUDED.tick_count,
       finalized = EXCLUDED.finalized`,
    [candle.symbol, candle.timeframe, candle.startTime, candle.endTime, candle.open, candle.high, candle.low, candle.close, candle.tickCount || 0, Boolean(candle.finalized)]
  );
}

export async function upsertCandles(rows: CandleUpsert[]): Promise<void> {
  if (!rows?.length) return;
  const batch = rows.map((c) => ({
    symbol: c.symbol, timeframe: c.timeframe, start_time: c.startTime,
    end_time: c.endTime, open: c.open, high: c.high, low: c.low, close: c.close,
    tick_count: c.tickCount || 0, finalized: Boolean(c.finalized),
  }));
  await sql(`INSERT INTO otc_candles
    (symbol,timeframe,start_time,end_time,open,high,low,close,tick_count,finalized)
    SELECT symbol,timeframe,start_time,end_time,open,high,low,close,tick_count,finalized
    FROM jsonb_to_recordset($1::jsonb) AS batch(symbol text,timeframe text,start_time bigint,
      end_time bigint,open numeric,high numeric,low numeric,close numeric,tick_count integer,finalized boolean)
    ON CONFLICT (symbol,timeframe,start_time) DO UPDATE SET end_time=EXCLUDED.end_time,
      open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,
      tick_count=EXCLUDED.tick_count,finalized=EXCLUDED.finalized
    WHERE NOT otc_candles.finalized AND EXCLUDED.tick_count >= otc_candles.tick_count`, [json(batch)]);
}

function rowToCandle(r: Row): Candle {
  return {
    time: Number(r.start_time),
    endTime: Number(r.end_time),
    open: num(r.open) ?? 0,
    high: num(r.high) ?? 0,
    low: num(r.low) ?? 0,
    close: num(r.close) ?? 0,
    volume: null,
    tickCount: Number(r.tick_count || 0),
    finalized: r.finalized === true,
  };
}

export async function loadCandles(symbol: string, timeframe: string, limit = 300): Promise<Candle[]> {
  const rows = await many(
    `SELECT start_time, end_time, open, high, low, close, tick_count, finalized
       FROM otc_candles WHERE symbol = $1 AND timeframe = $2
      ORDER BY start_time DESC LIMIT $3`,
    [symbol, timeframe, Math.min(Math.max(1, limit), 2000)]
  );
  return rows.map(rowToCandle).reverse();
}

/**
 * Paginated candle query for deep history. Returns candles OLDER than
 * `before` (exclusive), oldest-first for chart prepend, plus `nextCursor`
 * and `hasMore`.
 */
export async function loadCandlesBefore(
  symbol: string,
  timeframe: string,
  before: number | null,
  limit = 300
): Promise<{ candles: Candle[]; nextCursor: number | null; hasMore: boolean }> {
  const params: unknown[] = [symbol, timeframe];
  let query = `SELECT start_time, end_time, open, high, low, close, tick_count, finalized
       FROM otc_candles WHERE symbol = $1 AND timeframe = $2`;
  if (Number.isFinite(Number(before)) && Number(before) > 0) {
    params.push(Number(before));
    query += ` AND start_time < $${params.length}`;
  }
  params.push(Math.min(Math.max(1, limit), 2000));
  query += ` ORDER BY start_time DESC LIMIT $${params.length}`;
  const rows = await many(query, params);
  const candles = rows.map(rowToCandle).reverse();
  const nextCursor = candles.length ? candles[0].time : null;
  const hasMore = candles.length >= Math.min(Math.max(1, limit), 2000);
  return { candles, nextCursor, hasMore };
}

/* ------------------------------------------------------------------ *
 * Audit / events
 * ------------------------------------------------------------------ */

export interface OtcEvent {
  symbol?: string;
  kind: string;
  severity?: string;
  actorId?: string | null;
  actorRole?: string;
  oldValue?: unknown;
  newValue?: unknown;
  detail?: unknown;
}

export async function recordEvent(event: OtcEvent): Promise<void> {
  await sql(
    `INSERT INTO otc_engine_events (symbol, kind, severity, actor_id, actor_role, old_value, new_value, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      event.symbol || '', event.kind, event.severity || 'INFO',
      event.actorId || null, event.actorRole || '', String(event.oldValue ?? ''),
      String(event.newValue ?? ''), json(event.detail ?? {}),
    ]
  ).catch(() => {});
}

/** Preserve each audit entry while avoiding one network roundtrip per gap. */
export async function recordEvents(events: OtcEvent[]): Promise<void> {
  if (!events.length) return;
  const rows = events.map((event) => ({
    symbol: event.symbol || '', kind: event.kind, severity: event.severity || 'INFO',
    actor_id: event.actorId || null, actor_role: event.actorRole || '',
    old_value: String(event.oldValue ?? ''), new_value: String(event.newValue ?? ''),
    detail: json(event.detail ?? {}),
  }));
  await sql(`INSERT INTO otc_engine_events
    (symbol,kind,severity,actor_id,actor_role,old_value,new_value,detail)
    SELECT symbol,kind,severity,actor_id,actor_role,old_value,new_value,detail
    FROM jsonb_to_recordset($1::jsonb) AS batch(symbol text,kind text,severity text,
      actor_id text,actor_role text,old_value text,new_value text,detail text)`, [json(rows)]).catch(() => {});
}

export async function listEvents(limit = 100): Promise<Row[]> {
  return many('SELECT * FROM otc_engine_events ORDER BY created_at DESC LIMIT $1', [Math.min(Math.max(1, limit), 500)]);
}

/* ------------------------------------------------------------------ *
 * Single-writer leadership (Postgres advisory lock)
 * ------------------------------------------------------------------ */

/** Numeric advisory-lock key (Postgres bigint) — "NEXAOTC". */
const LEADER_LOCK_KEY = 88172645463325252;

export interface Leadership {
  acquired: boolean;
  mode: string;
  leaderId: string;
  release: () => Promise<void>;
}

/**
 * Try to become the single OTC engine leader. Holds a SESSION-level advisory
 * lock on a dedicated pooled connection, so two workers can never generate
 * the same symbol — the loser gets `acquired: false` and must not tick.
 */
export async function tryAcquireLeadership(leaderId: string): Promise<Leadership> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    // Database unavailable — single process, safe.
    return { acquired: true, mode: 'fallback', leaderId, release: async () => {} };
  }
  try {
    const res = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LEADER_LOCK_KEY]);
    const acquired = res.rows?.[0]?.ok === true;
    if (!acquired) {
      client.release();
      return { acquired: false, mode: 'postgres', leaderId, release: async () => {} };
    }
    return {
      acquired: true,
      mode: 'postgres',
      leaderId,
      release: async () => {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [LEADER_LOCK_KEY]);
        } catch {
          /* session lock also drops when the connection closes */
        } finally {
          client.release();
        }
      },
    };
  } catch {
    // pg_try_advisory_lock unavailable — single process, safe.
    client.release();
    return { acquired: true, mode: 'fallback', leaderId, release: async () => {} };
  }
}

/** Health snapshot of the persistence layer for the admin monitor. */
export async function storeHealth(): Promise<Record<string, unknown>> {
  try {
    const [ticks, candles, state] = await Promise.all([
      one('SELECT COUNT(*)::int AS n FROM otc_price_ticks'),
      one('SELECT COUNT(*)::int AS n FROM otc_candles'),
      one('SELECT MAX(updated_at) AS at FROM otc_market_state'),
    ]);
    return {
      ok: true,
      tickCount: Number((ticks as Row)?.n || 0),
      candleCount: Number((candles as Row)?.n || 0),
      lastCheckpoint: (state as Row)?.at ? new Date((state as Row).at).toISOString() : null,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'store unavailable' };
  }
}

export { LEADER_LOCK_KEY };
