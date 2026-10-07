/**
 * Performance collector — in-memory ring buffers for API timings, process
 * health, Socket.io stats, and client-side RUM (Real-User Monitoring) data.
 *
 * Lightweight by design: no per-request Redis writes, no blocking work.
 * Ring buffers cap memory; a periodic rollup writer (store.js) flushes
 * aggregated data to Redis with TTLs.
 *
 * No personal data is collected — only performance metrics.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

// ── Ring buffer helper ──
class RingBuffer {
  constructor(max) { this.max = max; this.items = []; this.idx = 0; }
  push(item) {
    if (this.items.length < this.max) this.items.push(item);
    else { this.items[this.idx] = item; this.idx = (this.idx + 1) % this.max; }
  }
  all() { return this.items; }
  recent(ms) {
    const cut = Date.now() - ms;
    return this.items.filter(i => i.ts >= cut);
  }
}

// ── State ──
const MAX_API = 2000;
const MAX_PROC = 360;        // 30 min at 5s
const MAX_RUM = 500;
const MAX_SOCKET = 360;

const apiBuffer = new RingBuffer(MAX_API);
const procBuffer = new RingBuffer(MAX_PROC);
const rumBuffer = new RingBuffer(MAX_RUM);
const socketBuffer = new RingBuffer(MAX_SOCKET);

let ioRef = null;
let lastCpu = process.cpuUsage();
let lastCpuTime = process.hrtime.bigint();
const elDelay = monitorEventLoopDelay();
elDelay.enable();

// ── API timing recording (called by Express middleware) ──
export function recordApi(method, path, status, durationMs) {
  // Normalize path: replace IDs with :id
  const normPath = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
  apiBuffer.push({ method, path: normPath, status, duration: durationMs, ts: Date.now() });
}

// ── Process health sampling ──
export function sampleProcessHealth() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const cpuTime = process.hrtime.bigint();
  const elapsedUs = Number(cpuTime - lastCpuTime) / 1000; // nanoseconds → microseconds
  const cpuUser = cpu.user - lastCpu.user;
  const cpuSystem = cpu.system - lastCpu.system;
  const cpuPercent = elapsedUs > 0 ? ((cpuUser + cpuSystem) / elapsedUs) * 100 : 0;
  lastCpu = cpu;
  lastCpuTime = cpuTime;

  const elMs = elDelay.max;
  elDelay.reset();

  const sample = {
    ts: Date.now(),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    cpuPercent: Math.min(100, Math.max(0, cpuPercent)),
    eventLoopLagMs: elMs,
  };
  procBuffer.push(sample);
  return sample;
}

// ── Socket.io stats ──
export function setIo(io) { ioRef = io; }

export function sampleSocketStats() {
  if (!ioRef) return null;
  const stats = {
    ts: Date.now(),
    connectedClients: 0,
    adminClients: 0,
    userClients: 0,
  };
  try {
    const mainNs = ioRef.of('/');
    const sockets = mainNs.sockets instanceof Map
      ? [...mainNs.sockets.values()]
      : Object.values(mainNs.sockets);
    stats.connectedClients = sockets.length;
    for (const s of sockets) {
      if (s.data?.role && ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR'].includes(s.data.role)) {
        stats.adminClients++;
      } else if (s.data?.userId) {
        stats.userClients++;
      }
    }
  } catch { /* ignore */ }
  socketBuffer.push(stats);
  return stats;
}

// ── RUM recording (called by beacon endpoint) ──
export function recordRum(data) {
  if (!data || !data.metrics) return;
  rumBuffer.push({
    panel: data.panel || 'user',
    page: data.page || '/',
    metrics: data.metrics,
    ts: Date.now(),
  });
}

// ── Percentile calculation ──
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Get current snapshot ──
export function getSnapshot() {
  const now = Date.now();
  const recentApi = apiBuffer.recent(60000); // last 60s
  const recentRum = rumBuffer.recent(60000);

  // API metrics by endpoint
  const byEndpoint = {};
  for (const r of recentApi) {
    const key = `${r.method} ${r.path}`;
    if (!byEndpoint[key]) byEndpoint[key] = { count: 0, durations: [], errors: 0, key };
    byEndpoint[key].count++;
    byEndpoint[key].durations.push(r.duration);
    if (r.status >= 400) byEndpoint[key].errors++;
  }

  const endpointStats = Object.values(byEndpoint).map(e => ({
    endpoint: e.key,
    count: e.count,
    p50: Math.round(percentile(e.durations, 50)),
    p95: Math.round(percentile(e.durations, 95)),
    p99: Math.round(percentile(e.durations, 99)),
    errorRate: e.count > 0 ? (e.errors / e.count) * 100 : 0,
  })).sort((a, b) => b.p95 - a.p95);

  const allDurations = recentApi.map(r => r.duration);
  const allRumLcp = recentRum.map(r => r.metrics.lcp).filter(Boolean);
  const allRumInp = recentRum.map(r => r.metrics.inp).filter(Boolean);
  const allRumCls = recentRum.map(r => r.metrics.cls).filter(Boolean);
  const allRumTtfb = recentRum.map(r => r.metrics.ttfb).filter(Boolean);

  // RUM by panel
  const rumByPanel = { admin: { count: 0, lcp: [], inp: [], cls: [], ttfb: [], loadTime: [], fps: [] },
                       user:  { count: 0, lcp: [], inp: [], cls: [], ttfb: [], loadTime: [], fps: [] } };
  for (const r of recentRum) {
    const p = rumByPanel[r.panel] || rumByPanel.user;
    p.count++;
    if (r.metrics.lcp) p.lcp.push(r.metrics.lcp);
    if (r.metrics.inp) p.inp.push(r.metrics.inp);
    if (r.metrics.cls) p.cls.push(r.metrics.cls);
    if (r.metrics.ttfb) p.ttfb.push(r.metrics.ttfb);
    if (r.metrics.loadTime) p.loadTime.push(r.metrics.loadTime);
    if (r.metrics.fps) p.fps.push(r.metrics.fps);
  }

  // RUM by page
  const rumByPage = {};
  for (const r of recentRum) {
    if (!rumByPage[r.page]) rumByPage[r.page] = { count: 0, lcp: [], inp: [], cls: [], loadTime: [] };
    rumByPage[r.page].count++;
    if (r.metrics.lcp) rumByPage[r.page].lcp.push(r.metrics.lcp);
    if (r.metrics.inp) rumByPage[r.page].inp.push(r.metrics.inp);
    if (r.metrics.cls) rumByPage[r.page].cls.push(r.metrics.cls);
    if (r.metrics.loadTime) rumByPage[r.page].loadTime.push(r.metrics.loadTime);
  }

  const latestProc = procBuffer.all()[procBuffer.all().length - 1] || null;
  const latestSocket = socketBuffer.all()[socketBuffer.all().length - 1] || null;

  // Speed score calculation
  const apiP95 = percentile(allDurations, 95);
  const lcpP75 = percentile(allRumLcp, 75);
  const inpP75 = percentile(allRumInp, 75);
  const clsP75 = percentile(allRumCls, 75);
  const errorCount = recentApi.filter(r => r.status >= 400).length;
  const errorRate = recentApi.length > 0 ? (errorCount / recentApi.length) * 100 : 0;

  // Scoring: start at 100, subtract penalties
  // CWV thresholds: LCP good<2500ms, poor>4000ms; INP good<200ms, poor>500ms; CLS good<0.1, poor>0.25
  let score = 100;
  if (apiP95 > 500) score -= Math.min(25, (apiP95 - 500) / 40);
  if (lcpP75 > 2500) score -= Math.min(25, (lcpP75 - 2500) / 60);
  if (inpP75 > 200) score -= Math.min(20, (inpP75 - 200) / 15);
  if (clsP75 > 0.1) score -= Math.min(15, (clsP75 - 0.1) * 60);
  if (errorRate > 1) score -= Math.min(15, (errorRate - 1) * 3);
  score = Math.round(Math.max(0, Math.min(100, score)));

  // Trend: compare last 30s vs previous 30s
  const last30 = apiBuffer.recent(30000).map(r => r.duration);
  const prev30 = apiBuffer.all().filter(r => r.ts >= now - 60000 && r.ts < now - 30000).map(r => r.duration);
  const last30Avg = last30.length ? last30.reduce((a, b) => a + b, 0) / last30.length : 0;
  const prev30Avg = prev30.length ? prev30.reduce((a, b) => a + b, 0) / prev30.length : 0;
  const trend = last30Avg < prev30Avg * 0.9 ? 'improving' : last30Avg > prev30Avg * 1.1 ? 'degrading' : 'stable';

  return {
    timestamp: new Date().toISOString(),
    api: {
      total: recentApi.length,
      p50: Math.round(percentile(allDurations, 50)),
      p95: Math.round(percentile(allDurations, 95)),
      p99: Math.round(percentile(allDurations, 99)),
      errorRate: Math.round(errorRate * 100) / 100,
      throughput: recentApi.length, // req/min ≈ req in 60s
      slowest: endpointStats.slice(0, 10),
    },
    rum: {
      total: recentRum.length,
      admin: {
        count: rumByPanel.admin.count,
        lcpP75: Math.round(percentile(rumByPanel.admin.lcp, 75)),
        inpP75: Math.round(percentile(rumByPanel.admin.inp, 75)),
        clsP75: Math.round(percentile(rumByPanel.admin.cls, 75) * 1000) / 1000,
        ttfbP75: Math.round(percentile(rumByPanel.admin.ttfb, 75)),
        loadTimeAvg: rumByPanel.admin.loadTime.length ? Math.round(rumByPanel.admin.loadTime.reduce((a, b) => a + b, 0) / rumByPanel.admin.loadTime.length) : 0,
        fpsAvg: rumByPanel.admin.fps.length ? Math.round(rumByPanel.admin.fps.reduce((a, b) => a + b, 0) / rumByPanel.admin.fps.length) : 0,
      },
      user: {
        count: rumByPanel.user.count,
        lcpP75: Math.round(percentile(rumByPanel.user.lcp, 75)),
        inpP75: Math.round(percentile(rumByPanel.user.inp, 75)),
        clsP75: Math.round(percentile(rumByPanel.user.cls, 75) * 1000) / 1000,
        ttfbP75: Math.round(percentile(rumByPanel.user.ttfb, 75)),
        loadTimeAvg: rumByPanel.user.loadTime.length ? Math.round(rumByPanel.user.loadTime.reduce((a, b) => a + b, 0) / rumByPanel.user.loadTime.length) : 0,
        fpsAvg: rumByPanel.user.fps.length ? Math.round(rumByPanel.user.fps.reduce((a, b) => a + b, 0) / rumByPanel.user.fps.length) : 0,
      },
      pages: Object.entries(rumByPage).map(([page, d]) => ({
        page, count: d.count,
        lcpP75: Math.round(percentile(d.lcp, 75)),
        inpP75: Math.round(percentile(d.inp, 75)),
        loadTimeAvg: d.loadTime.length ? Math.round(d.loadTime.reduce((a, b) => a + b, 0) / d.loadTime.length) : 0,
      })).sort((a, b) => (b.lcpP75 || 0) - (a.lcpP75 || 0)).slice(0, 10),
    },
    process: latestProc ? {
      rss: latestProc.rss,
      rssMB: Math.round(latestProc.rss / 1024 / 1024),
      heapUsed: latestProc.heapUsed,
      heapUsedMB: Math.round(latestProc.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(latestProc.heapTotal / 1024 / 1024),
      cpuPercent: Math.round(latestProc.cpuPercent * 100) / 100,
      eventLoopLagMs: Math.round(latestProc.eventLoopLagMs),
    } : null,
    socket: latestSocket ? {
      connectedClients: latestSocket.connectedClients,
      adminClients: latestSocket.adminClients,
      userClients: latestSocket.userClients,
    } : null,
    speedScore: score,
    trend,
  };
}

// ── Get process history (for sparklines) ──
export function getProcessHistory() {
  return procBuffer.all().slice(-60).map(s => ({
    ts: s.ts,
    rss: s.rss,
    cpu: s.cpuPercent,
    elLag: s.eventLoopLagMs,
  }));
}

// ── Get API history (for sparklines) ──
export function getApiHistory() {
  const samples = [];
  const now = Date.now();
  for (let i = 11; i >= 0; i--) {
    const start = now - (i + 1) * 5000;
    const end = now - i * 5000;
    const batch = apiBuffer.all().filter(r => r.ts >= start && r.ts < end);
    const durs = batch.map(r => r.duration);
    samples.push({
      ts: end,
      count: batch.length,
      p50: Math.round(percentile(durs, 50)),
      p95: Math.round(percentile(durs, 95)),
    });
  }
  return samples;
}
