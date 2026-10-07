/**
 * Performance store — Redis-backed persistence for rollups, audit log,
 * and auto-optimize state. Uses ioredis setex (lowercase) for all writes.
 *
 * Rollup intervals:
 *   1h  → per-10s bucket × 360 = 1h (TTL 2h)
 *   24h → per-60s bucket × 1440 = 24h (TTL 48h)
 *   7d  → per-300s bucket × 2016 = 7d (TTL 8d)
 *
 * No personal data stored. No existing tables modified.
 */
import { getRedisPublisher as getRedisClient } from '../config/redis';

const ROLLUP_TTL = { '1h': 7200, '24h': 172800, '7d': 691200 };
const AUDIT_TTL = 2592000; // 30 days

function bucketKey(range, ts) {
  const bucketSize = range === '1h' ? 10 : range === '24h' ? 60 : 300;
  const bucket = Math.floor(ts / 1000 / bucketSize) * bucketSize;
  return `perf:rollup:${range}:${bucket}`;
}

async function getRedis() {
  try { return await getRedisClient(); } catch { return null; }
}

/** Write a rollup snapshot to Redis. */
export async function writeRollup(range, data) {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const key = bucketKey(range, Date.now());
    const existing = await redis.get(key);
    if (existing) {
      const prev = JSON.parse(existing);
      // Merge: append to arrays, recompute aggregates
      data = mergeRollups(prev, data);
    }
    await redis.setex(key, ROLLUP_TTL[range], JSON.stringify(data));
  } catch { /* best-effort */ }
}

function mergeRollups(a, b) {
  return {
    ts: b.ts,
    apiCount: (a.apiCount || 0) + (b.apiCount || 0),
    apiP50: b.apiP50 || a.apiP50,
    apiP95: b.apiP95 || a.apiP95,
    apiErrors: (a.apiErrors || 0) + (b.apiErrors || 0),
    rumCount: (a.rumCount || 0) + (b.rumCount || 0),
    rumLcp: b.rumLcp || a.rumLcp,
    rumInp: b.rumInp || a.rumInp,
    rumCls: b.rumCls || a.rumCls,
    speedScore: b.speedScore || a.speedScore,
    rssMB: b.rssMB || a.rssMB,
    cpu: b.cpu || a.cpu,
    elLag: b.elLag || a.elLag,
    socketClients: b.socketClients || a.socketClients,
  };
}

/** Read history for a given range. */
export async function readHistory(range) {
  const redis = await getRedis();
  if (!redis) return [];
  try {
    const now = Date.now();
    const bucketSize = range === '1h' ? 10 : range === '24h' ? 60 : 300;
    const count = range === '1h' ? 360 : range === '24h' ? 1440 : 2016;
    const keys = [];
    for (let i = 0; i < count; i++) {
      const ts = now - i * bucketSize * 1000;
      keys.push(bucketKey(range, ts));
    }
    // Fetch in batches of 50 to avoid huge pipelining
    const results = [];
    for (let i = 0; i < keys.length; i += 50) {
      const batch = keys.slice(i, i + 50);
      const vals = await redis.mget(...batch);
      for (const v of vals) {
        if (v) results.push(JSON.parse(v));
      }
    }
    return results.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  } catch { return []; }
}

/** Write an audit log entry for a boost action. */
export async function writeAudit(entry) {
  const redis = await getRedis();
  if (!redis) return;
  try {
    const key = `perf:audit:${entry.id}`;
    await redis.setex(key, AUDIT_TTL, JSON.stringify(entry));
    // Also maintain a list index
    await redis.lpush('perf:audit:list', entry.id);
    await redis.ltrim('perf:audit:list', 0, 99);
  } catch { /* best-effort */ }
}

/** Read recent audit entries. */
export async function readAudit() {
  const redis = await getRedis();
  if (!redis) return [];
  try {
    const ids = await redis.lrange('perf:audit:list', 0, 49);
    if (!ids.length) return [];
    const vals = await redis.mget(...ids.map(id => `perf:audit:${id}`));
    return vals.filter(Boolean).map(v => JSON.parse(v));
  } catch { return []; }
}

/** Get/set auto-optimize state. */
export async function getAutoOptimize() {
  const redis = await getRedis();
  if (!redis) return { enabled: false, rules: [] };
  try {
    const raw = await redis.get('perf:auto-optimize');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { enabled: false, rules: DEFAULT_RULES };
}

export async function setAutoOptimize(state) {
  const redis = await getRedis();
  if (!redis) return;
  try { await redis.setex('perf:auto-optimize', 86400, JSON.stringify(state)); } catch { /* ignore */ }
}

const DEFAULT_RULES = [
  {
    id: 'cache-refresh',
    name: 'Auto-refresh Redis cache',
    trigger: { metric: 'apiP95', op: '>', value: 1000 },
    action: 'cache-refresh',
    cooldownMs: 60000,
    lastRun: 0,
    enabled: true,
  },
  {
    id: 'cache-warmup',
    name: 'Warm up hot data',
    trigger: { metric: 'rumLcp', op: '>', value: 3000 },
    action: 'cache-warmup',
    cooldownMs: 120000,
    lastRun: 0,
    enabled: true,
  },
];

/** Get/cache settings with safe bounds. */
export async function getThresholds() {
  const redis = await getRedis();
  if (!redis) return DEFAULT_THRESHOLDS;
  try {
    const raw = await redis.get('perf:thresholds');
    if (raw) return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_THRESHOLDS;
}

export async function setThresholds(t) {
  const redis = await getRedis();
  if (!redis) return;
  try { await redis.setex('perf:thresholds', 86400, JSON.stringify({ ...DEFAULT_THRESHOLDS, ...t })); } catch { /* ignore */ }
}

const DEFAULT_THRESHOLDS = {
  apiP95Warn: 500,
  apiP95Critical: 1500,
  lcpWarn: 2500,
  lcpCritical: 4000,
  inpWarn: 200,
  inpCritical: 500,
  clsWarn: 0.1,
  clsCritical: 0.25,
  errorRateWarn: 1,
  errorRateCritical: 5,
};

/** Selectively clear Redis cache by namespace prefix. */
export async function clearCache(prefix) {
  const redis = await getRedis();
  if (!redis) return { cleared: 0 };
  try {
    // Use SCAN to find keys matching the prefix (never KEYS in production)
    let cursor = '0';
    let cleared = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'COUNT', 100, 'MATCH', `${prefix}*`);
      cursor = next;
      if (keys.length) {
        await redis.del(...keys);
        cleared += keys.length;
      }
    } while (cursor !== '0' && cleared < 1000);
    return { cleared };
  } catch { return { cleared: 0, error: 'Failed to clear cache' }; }
}

/** Get pool size (read-only from the pg pool). */
export async function getPoolSize() {
  try {
    const { pool } = await import('../config/db');
    return { max: pool.max, idle: pool.idleCount, waiting: pool.waitingCount, total: pool.totalCount };
  } catch { return null; }
}

/** Adjust pool size within safe bounds [5, 20]. */
export async function setPoolSize(newMax) {
  const clamped = Math.max(5, Math.min(20, newMax));
  try {
    const { pool } = await import('../config/db');
    // pg Pool does not allow changing max at runtime safely.
    // We return the desired value; a restart would be needed to apply it.
    return { requested: clamped, current: pool.max, applied: false, message: 'Pool size change requires server restart to take effect.' };
  } catch { return null; }
}
