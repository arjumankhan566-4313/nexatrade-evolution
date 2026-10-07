/**
 * Performance & Speed Control Center — admin route handlers.
 *
 * GET  /api/admin/performance           — current real-time snapshot
 * GET  /api/admin/performance/history   — 1h / 24h / 7d rollups
 * POST /api/admin/performance/action    — speed boost action
 * GET  /api/admin/performance/audit     — action audit log
 * GET  /api/admin/performance/auto-optimize
 * PATCH /api/admin/performance/auto-optimize
 * GET  /api/admin/performance/thresholds
 * PATCH /api/admin/performance/thresholds
 *
 * Admin-only. No secrets reach the frontend.
 */
import { requireAdmin, json, fail, route, logSecurity } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';
import { getSnapshot, getProcessHistory, getApiHistory } from '../../performance/collector';
import * as store from '../../performance/store';

// ── GET /api/admin/performance — current snapshot ──
export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  const snapshot = getSnapshot();
  const procHistory = getProcessHistory();
  const apiHistory = getApiHistory();
  const autoOptimize = await store.getAutoOptimize();
  const thresholds = await store.getThresholds();
  const pool = await store.getPoolSize();

  return json({
    ...snapshot,
    procHistory,
    apiHistory,
    autoOptimize,
    thresholds,
    pool,
  });
});

// ── GET /api/admin/performance/history?range=1h|24h|7d ──
export const GET_HISTORY = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  const url = new URL(req.url);
  const range = url.searchParams.get('range') || '1h';
  if (!['1h', '24h', '7d'].includes(range)) return fail('Invalid range. Use 1h, 24h, or 7d.', 400);

  const history = await store.readHistory(range);
  return json({ range, history });
});

// ── POST /api/admin/performance/action — speed boost action ──
export const POST_ACTION = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { action, confirmed, namespace, newMax } = body;

  if (!action) return fail('Action is required.', 400);
  if (!confirmed) return fail('Explicit confirmation is required.', 400);

  // Capture before metrics
  const before = getSnapshot();

  const auditEntry = {
    id: `perf-audit-${Date.now()}`,
    admin: user.email,
    action,
    timestamp: new Date().toISOString(),
    status: 'pending',
    before: { speedScore: before.speedScore, apiP95: before.api.p95, lcp: before.rum.admin.lcpP75 },
  };

  try {
    switch (action) {
      case 'cache-clear': {
        const prefix = namespace || '';
        const result = await store.clearCache(prefix || 'otc:');
        auditEntry.status = 'success';
        auditEntry.target = prefix || 'otc:';
        auditEntry.result = result;
        auditEntry.message = `Cleared ${result.cleared} Redis keys matching '${prefix || 'otc:'}*'`;
        break;
      }
      case 'cache-clear-all': {
        const result = await store.clearCache('');
        auditEntry.status = 'success';
        auditEntry.target = 'all';
        auditEntry.result = result;
        auditEntry.message = `Cleared ${result.cleared} Redis keys (full flush)`;
        break;
      }
      case 'pool-resize': {
        const size = parseInt(newMax, 10);
        if (!size || size < 5 || size > 20) return fail('Pool size must be between 5 and 20.', 400);
        const result = await store.setPoolSize(size);
        auditEntry.status = 'success';
        auditEntry.target = `pool:${size}`;
        auditEntry.result = result;
        auditEntry.message = result?.message || `Pool size requested: ${size}`;
        break;
      }
      case 'threshold-update': {
        const newThresholds = body.thresholds;
        if (!newThresholds) return fail('Thresholds object is required.', 400);
        await store.setThresholds(newThresholds);
        auditEntry.status = 'success';
        auditEntry.target = 'thresholds';
        auditEntry.message = 'Performance thresholds updated.';
        break;
      }
      default:
        return fail(`Unknown action: ${action}`, 400);
    }

    // Capture after metrics (immediately — may show no change yet)
    await new Promise(r => setTimeout(r, 500));
    const after = getSnapshot();
    auditEntry.after = { speedScore: after.speedScore, apiP95: after.api.p95, lcp: after.rum.admin.lcpP75 };
    auditEntry.realChange = {
      speedScoreDelta: after.speedScore - before.speedScore,
      apiP95Delta: after.api.p95 - before.api.p95,
      lcpDelta: after.rum.admin.lcpP75 - before.rum.admin.lcpP75,
    };

    await store.writeAudit(auditEntry);

    await logSecurity({
      req,
      userId: user.id,
      email: user.email,
      event: 'PERFORMANCE_ACTION',
      severity: action === 'cache-clear-all' ? 'CRITICAL' : 'WARNING',
      meta: auditEntry,
    });

    return json({ ok: true, audit: auditEntry });
  } catch (err) {
    auditEntry.status = 'failed';
    auditEntry.message = (err && err.message) ? err.message : 'Unknown error';
    await store.writeAudit(auditEntry);
    return fail(`Action failed: ${auditEntry.message}`, 500);
  }
});

// ── GET /api/admin/performance/audit ──
export const GET_AUDIT = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const audit = await store.readAudit();
  return json({ audit });
});

// ── GET /api/admin/performance/auto-optimize ──
export const GET_AUTO_OPTIMIZE = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const state = await store.getAutoOptimize();
  return json(state);
});

// ── PATCH /api/admin/performance/auto-optimize ──
export const PATCH_AUTO_OPTIMIZE = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  const current = await store.getAutoOptimize();
  const newState = {
    enabled: body.enabled !== undefined ? body.enabled : current.enabled,
    rules: body.rules || current.rules,
  };
  await store.setAutoOptimize(newState);

  await logSecurity({
    req,
    userId: user.id,
    email: user.email,
    event: 'AUTO_OPTIMIZE_TOGGLE',
    severity: 'WARNING',
    meta: { enabled: newState.enabled },
  });

  return json(newState);
});

// ── GET /api/admin/performance/thresholds ──
export const GET_THRESHOLDS = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const thresholds = await store.getThresholds();
  return json({ thresholds });
});

// ── PATCH /api/admin/performance/thresholds ──
export const PATCH_THRESHOLDS = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const body = await req.json().catch(() => ({}));
  await store.setThresholds(body);
  const thresholds = await store.getThresholds();
  return json({ thresholds });
});
