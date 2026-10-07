/**
 * Database Health & Control Center — admin route handlers.
 *
 * Real-time monitoring: DB size, per-table sizes, connection health, active
 * queries, transactions per second. All queries are lightweight and throttled
 * via Redis caching so the monitor never adds pressure to an already-loaded DB.
 *
 * Management actions: VACUUM/ANALYZE, terminate idle/stuck connections, data
 * cleanup with preview + audit log. Destructive actions (DROP/TRUNCATE) are
 * NOT exposed as one-click — they require a full backup first.
 *
 * No DB credentials or secrets ever reach the frontend.
 */
import { requireAdmin, json, fail, route, logSecurity } from '../http';
import { sql, all } from '../db';
import { PERMISSIONS } from '../lib/rbac.js';
import { getRedisPublisher as getRedisClient } from '../../config/redis';

/** Cache metrics in Redis for 5s to avoid hammering the DB. */
const CACHE_TTL = 5;
const METRICS_KEY = 'db-health:metrics';

async function getCached(key, ttl, fetcher) {
  let redis;
  try { redis = await getRedisClient(); } catch { /* no redis — fetch directly */ }
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch { /* ignore cache errors */ }
  }
  const data = await fetcher();
  if (redis) {
    try { await redis.setex(key, ttl, JSON.stringify(data)); } catch { /* ignore */ }
  }
  return data;
}

/** Format bytes to human-readable. */
function fmtBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * GET /api/admin/db-health — current database health snapshot.
 * Lightweight: uses cached pg_stat_database, pg_stat_activity, and
 * pg_total_relation_size queries. No heavy locks.
 */
export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  const data = await getCached(METRICS_KEY, CACHE_TTL, async () => {
    // Database size & stats
    const dbInfo = await sql(`
      SELECT
        pg_database_size(current_database()) AS total_size,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') AS active_queries,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle') AS idle_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction') AS idle_in_txn,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event IS NOT NULL) AS waiting_queries,
        xact_commit, xact_rollback, blks_hit, blks_read,
        tup_inserted, tup_updated, tup_deleted, tup_returned
      FROM pg_stat_database WHERE datname = current_database()
    `);

    // Connection limit info
    const connLimit = await sql(`SHOW max_connections`);
    const maxConn = connLimit.rows?.[0]?.max_connections
      ? parseInt(connLimit.rows[0].max_connections, 10)
      : 100;

    // Per-table sizes (top 30 by total size)
    const tableSizes = await sql(`
      SELECT
        s.schemaname AS schema,
        c.relname AS table,
        pg_total_relation_size(c.oid) AS total_size,
        pg_relation_size(c.oid) AS data_size,
        pg_total_relation_size(c.oid) - pg_relation_size(c.oid) AS index_size,
        s.n_live_tup AS row_estimate,
        s.n_dead_tup AS dead_tuples
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 30
    `);

    // Active queries (non-idle, longer than 1s)
    const activeQueries = await sql(`
      SELECT
        pid, state, wait_event_type, wait_event,
        EXTRACT(EPOCH FROM now() - query_start) AS duration_seconds,
        LEFT(query, 200) AS query_preview,
        application_name, client_addr
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state != 'idle'
      ORDER BY query_start ASC
      LIMIT 20
    `);

    // Calculate cache hit ratio
    const blksHit = parseInt(dbInfo.rows?.[0]?.blks_hit || '0', 10);
    const blksRead = parseInt(dbInfo.rows?.[0]?.blks_read || '0', 10);
    const cacheHitRatio = blksHit + blksRead > 0
      ? (blksHit / (blksHit + blksRead)) * 100
      : 100;

    // TPS estimate (commits + rollbacks per second since stats reset)
    // We use a delta approach: store last reading in Redis
    let tps = 0;
    let redis;
    try { redis = await getRedisClient(); } catch {}
    if (redis) {
      const totalXact = parseInt(dbInfo.rows?.[0]?.xact_commit || '0', 10)
        + parseInt(dbInfo.rows?.[0]?.xact_rollback || '0', 10);
      const prev = await redis.get('db-health:prev-xact');
      const prevTime = await redis.get('db-health:prev-time');
      const now = Date.now();
      if (prev && prevTime) {
        const dt = (now - parseInt(prevTime, 10)) / 1000;
        if (dt > 0) tps = Math.max(0, (totalXact - parseInt(prev, 10)) / dt);
      }
      await redis.setex('db-health:prev-xact', 300, String(totalXact));
      await redis.setex('db-health:prev-time', 300, String(now));
    }

    const totalSize = parseInt(dbInfo.rows?.[0]?.total_size || '0', 10);
    const activeConns = parseInt(dbInfo.rows?.[0]?.active_connections || '0', 10);
    const activeQueries_count = parseInt(dbInfo.rows?.[0]?.active_queries || '0', 10);
    const idleConns = parseInt(dbInfo.rows?.[0]?.idle_connections || '0', 10);
    const idleInTxn = parseInt(dbInfo.rows?.[0]?.idle_in_txn || '0', 10);
    const waitingQueries = parseInt(dbInfo.rows?.[0]?.waiting_queries || '0', 10);

    // Health score (0-100): weighted combination of factors
    const connPressure = maxConn > 0 ? activeConns / maxConn : 0;
    const idleTxnPenalty = Math.min(1, idleInTxn / 10);
    const cacheBonus = cacheHitRatio / 100;
    const healthScore = Math.round(
      Math.max(0, Math.min(100,
        100 - (connPressure * 40) - (idleTxnPenalty * 30) - ((100 - cacheBonus) * 30)
      ))
    );

    return {
      timestamp: new Date().toISOString(),
      storage: {
        totalSize,
        totalSizeHuman: fmtBytes(totalSize),
        planLimit: 1024 * 1024 * 1024, // Neon free plan ~1GB
        planLimitHuman: '1 GB',
        usagePercent: totalSize > 0 ? (totalSize / (1024 * 1024 * 1024)) * 100 : 0,
      },
      connections: {
        active: activeConns,
        idle: idleConns,
        idleInTransaction: idleInTxn,
        waiting: waitingQueries,
        maxConnections: maxConn,
        usagePercent: maxConn > 0 ? (activeConns / maxConn) * 100 : 0,
      },
      queries: {
        active: activeQueries_count,
        waiting: waitingQueries,
        list: activeQueries.rows?.map(q => ({
          pid: q.pid,
          state: q.state,
          waitEvent: q.wait_event,
          duration: parseFloat(q.duration_seconds || '0').toFixed(2),
          preview: q.query_preview,
          app: q.application_name || 'unknown',
          client: q.client_addr || 'local',
        })) || [],
      },
      throughput: {
        tps: Math.round(tps * 100) / 100,
        xactCommit: parseInt(dbInfo.rows?.[0]?.xact_commit || '0', 10),
        xactRollback: parseInt(dbInfo.rows?.[0]?.xact_rollback || '0', 10),
        tuplesInserted: parseInt(dbInfo.rows?.[0]?.tup_inserted || '0', 10),
        tuplesUpdated: parseInt(dbInfo.rows?.[0]?.tup_updated || '0', 10),
        tuplesDeleted: parseInt(dbInfo.rows?.[0]?.tup_deleted || '0', 10),
        tuplesReturned: parseInt(dbInfo.rows?.[0]?.tup_returned || '0', 10),
      },
      cache: {
        hitRatio: Math.round(cacheHitRatio * 100) / 100,
        blocksHit: blksHit,
        blocksRead: blksRead,
      },
      tables: (tableSizes.rows || []).map(t => ({
        schema: t.schema,
        name: t.table,
        totalSize: parseInt(t.total_size || '0', 10),
        totalSizeHuman: fmtBytes(parseInt(t.total_size || '0', 10)),
        dataSize: parseInt(t.data_size || '0', 10),
        indexSize: parseInt(t.index_size || '0', 10),
        rowEstimate: parseInt(t.row_estimate || '0', 10),
        deadTuples: parseInt(t.dead_tuples || '0', 10),
      })),
      healthScore,
    };
  });

  return json({ health: data });
});

/**
 * POST /api/admin/db-health/action — execute a management action.
 * Actions: vacuum, analyze, vacuum-analyze, terminate-connection, cleanup-otc-ticks, cleanup-otc-candles
 * All actions require explicit confirmation and are written to an audit log.
 */
export const POST = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { action, pid, confirmed, tableName } = body;

  if (!action) return fail('Action is required.', 400);
  if (!confirmed) return fail('Explicit confirmation is required.', 400);

  // Audit log entry
  const auditEntry = {
    id: `audit-${Date.now()}`,
    admin: user.email,
    action,
    target: pid ? `pid:${pid}` : tableName || 'database-wide',
    timestamp: new Date().toISOString(),
    status: 'pending',
  };

  try {
    switch (action) {
      case 'vacuum': {
        const target = tableName ? `"${tableName}"` : '';
        await sql(`VACUUM ${target}`);
        auditEntry.status = 'success';
        auditEntry.message = `VACUUM ${target || 'FULL'} completed.`;
        break;
      }
      case 'analyze': {
        const target = tableName ? `"${tableName}"` : '';
        await sql(`ANALYZE ${target}`);
        auditEntry.status = 'success';
        auditEntry.message = `ANALYZE ${target || 'FULL'} completed.`;
        break;
      }
      case 'vacuum-analyze': {
        const target = tableName ? `"${tableName}"` : '';
        await sql(`VACUUM ANALYZE ${target}`);
        auditEntry.status = 'success';
        auditEntry.message = `VACUUM ANALYZE ${target || 'FULL'} completed.`;
        break;
      }
      case 'terminate-connection': {
        if (!pid) return fail('Connection PID is required.', 400);
        const result = await sql(`SELECT pg_terminate_backend($1)`, [parseInt(pid, 10)]);
        const terminated = result.rows?.[0]?.pg_terminate_backend;
        auditEntry.status = terminated ? 'success' : 'failed';
        auditEntry.message = terminated
          ? `Connection ${pid} terminated.`
          : `Connection ${pid} could not be terminated (already gone or insufficient privileges).`;
        break;
      }
      case 'cleanup-otc-ticks': {
        // Preview mode: count rows to be deleted
        const olderThanDays = parseInt(body.olderThanDays || '7', 10);
        const countResult = await sql(`
          SELECT COUNT(*) AS c FROM otc_price_ticks
          WHERE created_at < NOW() - INTERVAL '${olderThanDays} days'
        `);
        const rowCount = parseInt(countResult.rows?.[0]?.c || '0', 10);
        if (body.previewOnly) {
          auditEntry.status = 'preview';
          auditEntry.message = `${rowCount} tick rows older than ${olderThanDays} days would be deleted.`;
        } else {
          await sql(`DELETE FROM otc_price_ticks WHERE created_at < NOW() - INTERVAL '${olderThanDays} days'`);
          auditEntry.status = 'success';
          auditEntry.message = `Deleted ${rowCount} OTC tick rows older than ${olderThanDays} days.`;
        }
        break;
      }
      case 'cleanup-otc-candles': {
        const olderThanDays = parseInt(body.olderThanDays || '30', 10);
        const countResult = await sql(`
          SELECT COUNT(*) AS c FROM otc_candles
          WHERE time < NOW() - INTERVAL '${olderThanDays} days'
        `);
        const rowCount = parseInt(countResult.rows?.[0]?.c || '0', 10);
        if (body.previewOnly) {
          auditEntry.status = 'preview';
          auditEntry.message = `${rowCount} candle rows older than ${olderThanDays} days would be deleted.`;
        } else {
          await sql(`DELETE FROM otc_candles WHERE time < NOW() - INTERVAL '${olderThanDays} days'`);
          auditEntry.status = 'success';
          auditEntry.message = `Deleted ${rowCount} OTC candle rows older than ${olderThanDays} days.`;
        }
        break;
      }
      case 'reindex': {
        if (!tableName) return fail('Table name is required for REINDEX.', 400);
        await sql(`REINDEX TABLE "${tableName}"`);
        auditEntry.status = 'success';
        auditEntry.message = `REINDEX on "${tableName}" completed.`;
        break;
      }
      default:
        return fail(`Unknown action: ${action}`, 400);
    }

    // Write to audit log table (best-effort — create table if not exists)
    try {
      await sql(`
        CREATE TABLE IF NOT EXISTS db_health_audit (
          id TEXT PRIMARY KEY,
          admin TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT,
          status TEXT NOT NULL,
          message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await sql(`
        INSERT INTO db_health_audit (id, admin, action, target, status, message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [auditEntry.id, auditEntry.admin, auditEntry.action, auditEntry.target, auditEntry.status, auditEntry.message]);
    } catch { /* best-effort audit log */ }

    await logSecurity({
      req,
      userId: user.id,
      email: user.email,
      event: 'DB_HEALTH_ACTION',
      severity: action.startsWith('cleanup') || action === 'terminate-connection' ? 'CRITICAL' : 'WARNING',
      meta: auditEntry,
    });

    // Invalidate metrics cache after any action
    let redis;
    try { redis = await getRedisClient(); } catch {}
    if (redis) { try { await redis.del(METRICS_KEY); } catch {} }

    return json({ ok: true, audit: auditEntry });
  } catch (err) {
    auditEntry.status = 'failed';
    auditEntry.message = (err && err.message) ? err.message : 'Unknown error';
    return fail(`Action failed: ${auditEntry.message}`, 500);
  }
});

/**
 * GET /api/admin/db-health/audit — read the audit log.
 */
export const GET_AUDIT = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  try {
    const result = await sql(`
      SELECT * FROM db_health_audit
      ORDER BY created_at DESC
      LIMIT 100
    `);
    return json({ audit: result.rows || [] });
  } catch {
    // Table might not exist yet
    return json({ audit: [] });
  }
});
