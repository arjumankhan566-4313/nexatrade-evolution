/**
 * Admin OTC routes — ported 1:1 from the legacy Next.js API routes
 * (src/app/api/admin/otc/*) with identical business logic, permission checks
 * (RBAC matrix) and response shapes, now as Express endpoints under
 * /api/admin/otc.
 */
import { Router } from 'express';
import type { Response } from 'express';
import { requireAdmin, PERMISSIONS } from '../lib/rbac';
import { logSecurity } from '../lib/auth';
import { publish } from '../sockets/realtime';
import {
  isOtcSymbol,
  otcInstrument,
  OTC_SESSION_STATUS,
  OTC_ENGINE_STATUS,
  OTC_DISCLOSURE,
} from '../otc/instruments';
import {
  loadOtcInstruments,
  getOtcInstrument,
  updateOtcInstrument,
  createOtcInstrument,
  updateOtcEngineConfig,
  loadOtcEngineConfig,
  recordEvent,
  listEvents,
  readLeader,
  storeHealth,
  type OtcEngineConfigRow,
} from '../otc/store';
import { ensureEngine, stopEngine, reloadSymbol, getEngine, engineHealth } from '../otc/runner';
import { otcHealth } from '../otc/service';
import { getReferenceFeedHealth } from '../referenceFeed';
// Artwork mapping now lives in otc/instrumentIcons.ts (shared with the public
// catalogue route); import the versioned URL for the admin table.
import { otcIconUrlVersioned as otcIconUrl } from '../otc/instrumentIcons';

export const otcAdminRouter = Router();


const fail = (res: Response, message: string, status = 400) =>
  res.status(status).json({ error: message });

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

/* ── GET / — admin OTC console aggregate ─────────────────────────────── */
otcAdminRouter.get('/', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
  if (!user) return;

  const eventLimit = Math.min(Math.max(1, Number(req.query.events) || 60), 200);

  const [instruments, config, health, events] = await Promise.all([
    loadOtcInstruments({ activeOnly: false }),
    loadOtcEngineConfig(),
    otcHealth().catch((err: Error) => ({ enabled: false, error: err?.message || 'engine unavailable' })),
    listEvents(eventLimit).catch(() => []),
  ]);

  const runtimeHealth = engineHealth(getEngine());

  res.json({
    marketType: 'OTC',
    disclosure: OTC_DISCLOSURE,
    sessionStatuses: OTC_SESSION_STATUS,
    engineStatuses: OTC_ENGINE_STATUS,
    instruments: instruments.map((row) => {
      const cat = otcInstrument(row.symbol)?.logicalCategory || 'OTC';
      return {
      symbol: row.symbol,
      displayName: row.display_name,
      marketType: row.market_type || 'OTC',
      category: cat,
      icon: otcIconUrl(row.symbol, cat, row.base_asset),
      base: row.base_asset,
      quote: row.quote_asset,
      startingPrice: Number(row.starting_price),
      digits: Number(row.decimal_precision),
      tickIntervalMs: Number(row.tick_interval_ms),
      volatility: Number(row.volatility),
      spread: Number(row.spread),
      payoutRate: Number(row.payout_percentage),
      minStake: row.min_stake == null ? null : Number(row.min_stake),
      maxStake: row.max_stake == null ? null : Number(row.max_stake),
      exposureLimit: row.exposure_limit == null ? null : Number(row.exposure_limit),
      tradingStatus: row.trading_status,
      sessionStatus: row.session_status,
      engineStatus: row.price_engine_status,
      isActive: Boolean(row.is_active),
      retentionDays: row.retention_days == null ? null : Number(row.retention_days),
      sortOrder: Number(row.sort_order),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
    }),
    categories: instruments.reduce<Record<string, number>>((acc, row) => {
      const cat = otcInstrument(row.symbol)?.logicalCategory || 'OTC';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {}),
    config,
    engine: {
      running: runtimeHealth.running,
      leaderId: runtimeHealth.leaderId,
      leaderMode: runtimeHealth.leaderMode,
      uptimeMs: runtimeHealth.uptimeMs,
      subscribers: runtimeHealth.subscriberCount,
      queueDepth: runtimeHealth.queueDepth,
      metrics: runtimeHealth.metrics,
    },
    health,
    store: (health as Record<string, any>).store || { ok: false },
    events: (events as Record<string, any>[]).map((e) => ({
      id: e.id,
      symbol: e.symbol,
      kind: e.kind,
      severity: e.severity,
      actorRole: e.actor_role,
      newValue: e.new_value,
      oldValue: e.old_value,
      detail: e.detail,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : null,
    })),
    serverTime: Date.now(),
  });
});

/* ── /config — engine configuration (READ + live UPDATE) ────────────── */
const GAP_POLICIES = ['RESUME_WITH_GAP', 'SKIP_GAP'];

otcAdminRouter.get('/config', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
  if (!user) return;
  const config = await loadOtcEngineConfig();
  const engine = getEngine();
  res.json({
    config,
    gapPolicies: GAP_POLICIES,
    engine: { running: Boolean(engine?.running), leaderMode: engine?.leaderMode || 'stopped' },
  });
});

otcAdminRouter.patch('/config', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
  if (!user) return;
  const b = (req.body || {}) as Record<string, any>;
  const before = await loadOtcEngineConfig();
  const patch: Record<string, any> = {};
  const changed: string[] = [];

  if (b.engine_enabled !== undefined) patch.engine_enabled = Boolean(b.engine_enabled);
  if (b.auto_recover !== undefined) patch.auto_recover = Boolean(b.auto_recover);
  if (b.tick_retention_days !== undefined) patch.tick_retention_days = clamp(b.tick_retention_days, 1, 365, before.tick_retention_days);
  if (b.checkpoint_interval_ms !== undefined) patch.checkpoint_interval_ms = clamp(b.checkpoint_interval_ms, 1000, 600_000, before.checkpoint_interval_ms);
  if (b.replay_buffer_size !== undefined) patch.replay_buffer_size = clamp(b.replay_buffer_size, 100, 100_000, before.replay_buffer_size);
  if (b.batch_flush_ms !== undefined) patch.batch_flush_ms = clamp(b.batch_flush_ms, 50, 10_000, before.batch_flush_ms);
  if (b.gap_policy !== undefined) {
    const policy = String(b.gap_policy).toUpperCase();
    if (!GAP_POLICIES.includes(policy)) return fail(res, `gap_policy must be one of ${GAP_POLICIES.join(', ')}.`);
    patch.gap_policy = policy;
  }

  for (const [k, v] of Object.entries(patch)) if (String((before as Record<string, any>)[k]) !== String(v)) changed.push(k);
  if (!changed.length) return res.json({ config: before, unchanged: true });

  const config: OtcEngineConfigRow = await updateOtcEngineConfig(patch);

  // Apply live to the in-process engine.
  const engine = getEngine();
  if (engine) engine.engineConfig = { ...(engine.engineConfig || {}), ...config };
  if (patch.engine_enabled === false) {
    await stopEngine().catch(() => {});
  } else if (patch.engine_enabled === true && !engine?.running) {
    await ensureEngine().catch(() => {});
  }

  await recordEvent({
    kind: 'ENGINE_CONFIG_UPDATED', severity: 'INFO', actorId: user.id, actorRole: user.role,
    oldValue: JSON.stringify(before), newValue: JSON.stringify(config), detail: { changed },
  });
  await logSecurity({ req, userId: user.id, email: user.email, event: `OTC engine config updated (${changed.join(', ')})`, severity: 'INFO' });
  publish('settings', { changed: changed.map((c) => `otc.${c}`) });

  res.json({ config, changed });
});

/* ── POST /control — deliberate operator actions on the engine ──────── */
{
  const ACTIONS = ['START', 'STOP', 'PAUSE', 'RESUME', 'RECOVER', 'TEND', 'HEADLESS', 'LEADER_INFO'];
  const SAFE = new Set(['START', 'STOP', 'PAUSE', 'RESUME', 'RECOVER', 'TEND', 'HEADLESS', 'LEADER_INFO']);
  const SYMBOL_ACTIONS = new Set(['STOP', 'RESUME', 'PAUSE']);

  otcAdminRouter.post('/control', async (req, res) => {
    const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
    if (!user) return;
    const b = (req.body || {}) as Record<string, any>;
    const action = String(b.action || '').toUpperCase();
    if (!ACTIONS.includes(action)) return fail(res, `action must be one of ${ACTIONS.join(', ')}.`);
    if (!SAFE.has(action)) return fail(res, 'That action is not permitted from the admin console.', 403);

    const symbol = b.symbol ? String(b.symbol).trim().toUpperCase() : null;
    // "OTCEngine" (or no symbol) signals an engine-level action, not a
    // per-symbol one.  The client's Start/Stop Engine buttons send this.
    const isEngineLevel = !symbol || symbol === 'OTCENGINE';

    // Per-symbol actions (PAUSE/RESUME/RECOVER) always need a real OTC symbol.
    if (!isEngineLevel && !isOtcSymbol(symbol || ''))
      return fail(res, 'A valid OTC symbol is required.', 400);
    if (action === 'RECOVER' && isEngineLevel)
      return fail(res, 'A symbol is required for RECOVER.');
    if ((action === 'PAUSE' || action === 'RESUME') && isEngineLevel)
      return fail(res, `A symbol is required for ${action}.`);

    // Symbol controls only reload the existing writer; they never reseed it.
    const engine = getEngine();

    // Engine-level STOP — stop the entire OTC engine.
    if (action === 'STOP' && isEngineLevel) {
      await updateOtcEngineConfig({ engine_enabled: false });
      await stopEngine();
      await recordEvent({ kind: 'ENGINE_ADMIN_STOP', severity: 'WARN', actorId: user.id, actorRole: user.role, detail: { by: user.email } });
      await logSecurity({ req, userId: user.id, email: user.email, event: 'OTC engine stopped by admin', severity: 'WARN' });
      publish('assets', { kind: 'otc_engine_status', status: 'STOPPED' });
      return res.json({ ok: true, message: 'OTC engine stopped.' });
    }

    if (action === 'LEADER_INFO') {
      const current = symbol && !isEngineLevel ? await getOtcInstrument(symbol) : null;
      const e = await engine;
      return res.json({
        engine: { running: e?.running, leaderMode: e?.leaderMode, leaderId: e?.leaderId },
        symbolStatus: current ? { symbol, tradingStatus: current.trading_status, sessionStatus: current.session_status } : null,
      });
    }

    // Per-symbol resume / pause / stop.
    if (SYMBOL_ACTIONS.has(action) && !isEngineLevel && symbol) {
      const row = await getOtcInstrument(symbol);
      if (!row) return fail(res, 'Unknown OTC instrument.', 404);
      let sessionStatus: string;
      let tradingStatus: string;
      if (action === 'STOP') {
        sessionStatus = 'MAINTENANCE';
        tradingStatus = 'DISABLED';
      } else if (action === 'PAUSE') {
        sessionStatus = 'PAUSED';
        tradingStatus = 'ENABLED';
      } else {
        sessionStatus = 'OPEN';
        tradingStatus = 'ENABLED';
      }
      const next = await updateOtcInstrument(symbol, { session_status: sessionStatus, trading_status: tradingStatus });
      await reloadSymbol(symbol).catch(() => {});
      await recordEvent({
        symbol, kind: `INSTRUMENT_${action}`, severity: 'INFO',
        actorId: user.id, actorRole: user.role,
        oldValue: JSON.stringify({ session: row.session_status, trading: row.trading_status }),
        newValue: JSON.stringify({ session: next?.session_status, trading: next?.trading_status }),
      });
      await logSecurity({ req, userId: user.id, email: user.email, event: `OTC ${action} symbol: ${symbol}`, severity: 'INFO' });
      publish('assets', { kind: 'otc_instrument_status', symbol, sessionStatus: next?.session_status, tradingStatus: next?.trading_status });
      const e = await engine;
      return res.json({ ok: true, symbol, sessionStatus: next?.session_status, tradingStatus: next?.trading_status, engine: { running: e?.running, leaderMode: e?.leaderMode } });
    }

    // Engine actions that don't target a symbol explicitly.
    if (action === 'START') {
      if (process.env.OTC_ENGINE_ENABLED === 'false')
        return fail(res, 'OTC engine is disabled on this instance.', 503);
      await updateOtcEngineConfig({ engine_enabled: true });
      const current = await ensureEngine();
      if (!current.running) return fail(res, current.metrics.lastError || `OTC engine is ${current.leaderMode} on this instance.`, 503);
      await logSecurity({ req, userId: user.id, email: user.email, event: 'OTC engine started by admin', severity: 'INFO' });
      publish('assets', { kind: 'otc_engine_status', status: 'RUNNING' });
      return res.json({ ok: true, engine: { running: current.running, leaderMode: current.leaderMode } });
    }

    if (action === 'TICK') {
      const e = await engine;
      return res.json({ ok: true, engine: { running: e?.running, leaderMode: e?.leaderMode } });
    }

    return fail(res, `Unhandled action ${action}.`, 500);
  });
}

/* ── /events — read-only audit trail ────────────────────────────────── */
otcAdminRouter.get('/events', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.LOGS_VIEW);
  if (!user) return;

  const limit = Math.min(Math.max(1, Number(req.query.limit) || 80), 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const symbol = String(req.query.symbol || '').toUpperCase().replace(/^-OTC$/, '');
  const kind = String(req.query.kind || '').toUpperCase();

  const rows = (await listEvents(limit + 1)) as Record<string, any>[];
  let filtered = rows;
  if (symbol) filtered = filtered.filter((r) => String(r.symbol || '').toUpperCase() === symbol);
  if (kind) filtered = filtered.filter((r) => String(r.kind || '').toUpperCase() === kind);

  res.json({
    events: filtered
      .slice(offset, offset + limit)
      .map((e) => ({
        id: e.id,
        symbol: e.symbol || null,
        kind: e.kind,
        severity: e.severity,
        actorId: e.actor_id,
        actorRole: e.actor_role,
        oldValue: e.old_value,
        newValue: e.new_value,
        detail: e.detail,
        createdAt: e.created_at ? new Date(e.created_at).toISOString() : null,
      })),
    total: filtered.length,
    hasMore: filtered.length > offset + limit,
  });
});

/* ── /health — deeper OTC-subsystem health read ──────────────────────── */
otcAdminRouter.get('/health', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.LOGS_VIEW);
  if (!user) return;

  const [health, store] = await Promise.all([otcHealth(), storeHealth()]);
  // getEngine()/engineHealth() are synchronous — never promises.
  let runtimeHealth = { running: false as boolean, leaderId: '', leaderMode: 'stopped', uptimeMs: 0, subscriberCount: 0, queueDepth: 0, metrics: {} as Record<string, any> };
  try {
    runtimeHealth = (engineHealth(getEngine()) as typeof runtimeHealth) || runtimeHealth;
  } catch {
    /* engine not booted */
  }

  res.json({
    enabled: (health as Record<string, any>).enabled,
    engine: {
      running: runtimeHealth.running || false,
      leaderId: (runtimeHealth as any).leaderId || null,
      leaderMode: (runtimeHealth as any).leaderMode || 'stopped',
      uptimeMs: (runtimeHealth as any).uptimeMs || 0,
      subscribers: (runtimeHealth as any).subscriberCount || 0,
      queueDepth: (runtimeHealth as any).queueDepth || 0,
      metrics: (runtimeHealth as any).metrics || {},
    },
    store: store || { ok: false },
    symbols: (health as Record<string, any>).symbols?.length
      ? (health as Record<string, any>).symbols.map((s: Record<string, any>) => ({
          symbol: s.symbol,
          price: s.price,
          sequence: s.sequence,
          regime: s.regime,
          tickAgeMs: s.tickAgeMs,
          tickCount: s.tickCount,
          tickIntervalMs: s.tickIntervalMs,
          sessionStatus: s.sessionStatus,
          tradingStatus: s.tradingStatus,
          restored: s.restored,
        }))
      : [],
    staleSymbols: (health as Record<string, any>).staleSymbols || [],
    leader: (health as Record<string, any>).leader || null,
    serverTime: (health as Record<string, any>).serverTime || Date.now(),
  });
});

/* ── /instruments — every OTC instrument, active or not ──────────────── */
{
  /** Numeric fields an operator may tune, with sane bounds. */
  const NUM_FIELDS: Record<string, [string, (v: unknown) => number]> = {
    payout_rate: ['payout_percentage', (v) => clamp(v, 10, 99, 85)],
    volatility: ['volatility', (v) => clamp(v, 0.000001, 0.05, 0.00005)],
    spread: ['spread', (v) => clamp(v, 0, 0.05, 0.00004)],
    tick_interval_ms: ['tick_interval_ms', (v) => clamp(v, 250, 60_000, 1000)],
    digits: ['decimal_precision', (v) => clamp(v, 0, 8, 2)],
    min_stake: ['min_stake', (v) => clamp(v, 0, 1_000_000, 1)],
    max_stake: ['max_stake', (v) => clamp(v, 0, 10_000_000, 10_000)],
    exposure_limit: ['exposure_limit', (v) => clamp(v, 0, 1_000_000_000, 0)],
    retention_days: ['retention_days', (v) => clamp(v, 1, 365, 14)],
    starting_price: ['starting_price', (v) => clamp(v, 0.00001, 10_000_000, 1)],
    sort_order: ['sort_order', (v) => clamp(v, 0, 999_999, 50_000)],
  };

  otcAdminRouter.get('/instruments', async (req, res) => {
    const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
    if (!user) return;
    const rows = await loadOtcInstruments({ activeOnly: false });
    res.json({ instruments: rows, sessionStatuses: OTC_SESSION_STATUS, engineStatuses: OTC_ENGINE_STATUS });
  });

  /* CREATE — a new 24/7 OTC instrument (never replaces an existing one). */
  otcAdminRouter.post('/instruments', async (req, res) => {
    const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
    if (!user) return;
    const b = (req.body || {}) as Record<string, any>;

    const symbol = String(b.symbol || '').trim().toUpperCase();
    if (!isOtcSymbol(symbol)) return fail(res, 'OTC instruments must end with the "-OTC" suffix.');
    if (!/^[A-Z0-9-]{3,24}$/.test(symbol)) return fail(res, 'Symbol must be 3-24 characters (A-Z, 0-9, -).');
    const exists = await getOtcInstrument(symbol);
    if (exists) return fail(res, 'That OTC instrument already exists.', 409);

    const startingPrice = Number(b.startingPrice);
    if (!Number.isFinite(startingPrice) || startingPrice <= 0) return fail(res, 'A positive starting price is required.');

    const row = await createOtcInstrument({
      symbol,
      displayName: b.displayName || b.name,
      base: b.base,
      quote: b.quote,
      startingPrice,
      digits: b.digits,
      tickIntervalMs: b.tickIntervalMs,
      volatility: b.volatility,
      spread: b.spread,
      payout: b.payoutRate,
      sortOrder: b.sortOrder,
    });

    await recordEvent({
      symbol, kind: 'INSTRUMENT_CREATED', severity: 'INFO', actorId: user.id, actorRole: user.role,
      newValue: JSON.stringify({ starting_price: row?.starting_price, payout: row?.payout_percentage }),
    });
    await logSecurity({ req, userId: user.id, email: user.email, event: `OTC instrument created: ${symbol}`, severity: 'INFO' });
    publish('assets', { kind: 'otc_instrument_created', symbol });
    await reloadSymbol(symbol).catch(() => {});

    res.json({ instrument: row });
  });

  /* UPDATE — tune one OTC instrument; applied to the live engine immediately. */
  otcAdminRouter.patch('/instruments', async (req, res) => {
    const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
    if (!user) return;
    const b = (req.body || {}) as Record<string, any>;
    const symbol = String(b.symbol || '').trim().toUpperCase();
    if (!isOtcSymbol(symbol)) return fail(res, 'A valid OTC symbol is required.');
    const current = await getOtcInstrument(symbol);
    if (!current) return fail(res, 'Unknown OTC instrument.', 404);

    const patch: Record<string, any> = {};
    const changed: string[] = [];
    for (const [field, [column, coerce]] of Object.entries(NUM_FIELDS)) {
      if (b[field] === undefined) continue;
      const next = coerce(b[field]);
      if (Number((current as Record<string, any>)[column]) !== next) changed.push(field);
      patch[column] = next;
    }
    if (b.display_name !== undefined) {
      const name = String(b.display_name || '').slice(0, 60);
      if (name && name !== current.display_name) changed.push('display_name');
      patch.display_name = name || current.display_name;
    }
    if (b.session_status !== undefined) {
      const status = String(b.session_status).toUpperCase();
      if (!OTC_SESSION_STATUS.includes(status)) return fail(res, `session_status must be one of ${OTC_SESSION_STATUS.join(', ')}.`);
      if (status !== current.session_status) changed.push('session_status');
      patch.session_status = status;
    }
    if (b.trading_status !== undefined) {
      const status = String(b.trading_status).toUpperCase();
      if (!['ENABLED', 'DISABLED'].includes(status)) return fail(res, 'trading_status must be ENABLED or DISABLED.');
      if (status !== current.trading_status) changed.push('trading_status');
      patch.trading_status = status;
    }
    if (b.engine_status !== undefined) {
      const status = String(b.engine_status).toUpperCase();
      if (!OTC_ENGINE_STATUS.includes(status)) return fail(res, `engine_status must be one of ${OTC_ENGINE_STATUS.join(', ')}.`);
      if (status !== current.price_engine_status) changed.push('engine_status');
      patch.price_engine_status = status;
    }
    if (b.enabled !== undefined) {
      const active = Boolean(b.enabled);
      if (active !== current.is_active) changed.push('enabled');
      patch.is_active = active;
    }

    if (!changed.length) return res.json({ instrument: current, unchanged: true });

    const row = await updateOtcInstrument(symbol, patch);
    await recordEvent({
      symbol, kind: 'INSTRUMENT_UPDATED', severity: 'INFO', actorId: user.id, actorRole: user.role,
      oldValue: JSON.stringify({ payout: current.payout_percentage, session: current.session_status, trading: current.trading_status, active: current.is_active }),
      newValue: JSON.stringify({ payout: row?.payout_percentage, session: row?.session_status, trading: row?.trading_status, active: row?.is_active }),
      detail: { changed },
    });
    await logSecurity({ req, userId: user.id, email: user.email, event: `OTC instrument updated: ${symbol} (${changed.join(', ')})`, severity: 'INFO' });
    publish('assets', { kind: 'otc_instrument_updated', symbol, changed });

    const engine = getEngine();
    if (engine?.running) await reloadSymbol(symbol).catch(() => {});
    // Instant payout sync: when the base rate moved, push the freshly derived
    // map immediately — the next broadcaster tick would take up to one full
    // PAYOUT_STEP_MS, but an admin expects the board to move NOW.
    if (changed.some((c) => String(c).toLowerCase().includes('payout'))) {
      try {
        const { livePayoutMap } = await import('../otc/payouts');
        const { PAYOUT_STEP_MS } = await import('../otc/payouts');
        publish('payouts', { payouts: livePayoutMap(), stepMs: PAYOUT_STEP_MS, serverTime: Date.now() });
      } catch {
        /* the scheduled broadcast still lands within one step */
      }
    }

    res.json({ instrument: row, changed });
  });
}

/* ── /leader — inspect leadership state ─────────────────────────────── */
otcAdminRouter.get('/leader', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.LOGS_VIEW);
  if (!user) return;
  const leader = await readLeader().catch(() => null);
  res.json({ leader });
});

otcAdminRouter.post('/leader', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
  if (!user) return;
  const leader = await readLeader().catch(() => null);
  publish('assets', {
    kind: 'otc_leader_info',
    leader: leader ? { leaderId: leader.leaderId, engineStatus: leader.engineStatus, beatSince: leader.heartbeatAt } : null,
  });
  await logSecurity({ req, userId: user.id, email: user.email, event: 'OTC leader info broadcast', severity: 'INFO' });
  res.json({ ok: true, leader });
});

/* ── GET /reference-feed — real-market reference feed health ──────────── */
otcAdminRouter.get('/reference-feed', async (req, res) => {
  const user = await requireAdmin(req, res, PERMISSIONS.LOGS_VIEW);
  if (!user) return;
  res.json(getReferenceFeedHealth());
});
