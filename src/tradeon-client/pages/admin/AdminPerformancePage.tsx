/**
 * AdminPerformancePage — Performance & Speed Control Center.
 *
 * Real-time performance monitoring for the whole site (Admin + User panels):
 *   • Frontend RUM: TTFB, FCP, LCP, INP, CLS, page load, route transitions
 *   • Backend: API latency p50/p95/p99, throughput, error rate, slowest endpoints
 *   • Process health: CPU, memory, event-loop lag
 *   • Socket.io: connected clients, admin/user split
 *   • Speed Score (0-100) with trend indicator
 *   • History: 1h / 24h / 7d
 *   • Bottleneck detection
 *   • Speed Boost controls (cache clear, pool resize, threshold config)
 *   • Auto-Optimize mode with rule-based, non-destructive actions
 *   • Before/after comparison for every action
 *   • Audit log
 *
 * Live updates via Socket.io. Premium 3D visuals with framer-motion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gauge, Zap, Activity, Cpu, Radio, AlertTriangle, TrendingUp,
  TrendingDown, Minus, Trash2, Database, Settings, RefreshCw, Bot,
  ChevronRight, Clock, Server, Wifi } from 'lucide-react';
import { api } from '@/tradeon-client/lib/apiClient';
import { alert } from '@/tradeon-client/lib/useAlertStore';
import { socket } from '@/tradeon-client/lib/socket';
import PageHeader from '@/tradeon-client/components/admin/PageHeader';
import '@/tradeon-client/styles/admin-performance.css';

type Snapshot = {
  timestamp: string;
  api: { total: number; p50: number; p95: number; p99: number; errorRate: number; throughput: number; slowest: any[] };
  rum: { total: number; admin: any; user: any; pages: any[] };
  process: any;
  socket: any;
  speedScore: number;
  trend: string;
  procHistory: any[];
  apiHistory: any[];
  autoOptimize: { enabled: boolean; rules: any[] };
  thresholds: any;
  pool: any;
};

function scoreColor(s: number): string {
  if (s >= 70) return '#22c55e';
  if (s >= 40) return '#f59e0b';
  return '#ef4444';
}

function cwvStatus(value: number, good: number, poor: number): string {
  if (value <= good) return 'good';
  if (value >= poor) return 'poor';
  return 'warn';
}

function latColor(ms: number): string {
  if (ms < 200) return '#22c55e';
  if (ms < 500) return '#3b82f6';
  if (ms < 1000) return '#f59e0b';
  return '#ef4444';
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function Sparkline({ data, color, max }: { data: number[]; color: string; max?: number }) {
  if (!data.length) return <div style={{ height: 36 }} />;
  const mx = max || Math.max(...data, 1);
  return (
    <div className="perf-sparkline">
      {data.map((v, i) => (
        <div key={i} className="perf-spark-bar"
          style={{ height: `${Math.max(2, (v / mx) * 100)}%`, background: color }} />
      ))}
    </div>
  );
}

export default function AdminPerformancePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'1h' | '24h' | '7d'>('1h');
  const [history, setHistory] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoOpt, setAutoOpt] = useState<any>(null);
  const [lastAction, setLastAction] = useState<any>(null);

  // Initial load
  useEffect(() => {
    api('/api/admin/performance').then((d: any) => {
      setSnap(d);
      setAutoOpt(d.autoOptimize);
      setLoading(false);
    }).catch(() => setLoading(false));
    api('/api/admin/performance/audit').then((d: any) => setAudit(d.audit || [])).catch(() => {});
  }, []);

  // Socket.io live updates
  useEffect(() => {
    const handler = (data: any) => {
      setSnap(prev => prev ? { ...prev, ...data, autoOptimize: prev.autoOptimize, thresholds: prev.thresholds, pool: prev.pool } : data);
    };
    socket.on('perf:snapshot', handler);
    socket.emit('subscribe:perf');

    const autoActionHandler = (data: any) => {
      alert.info(`Auto-Optimize: ${data.action} triggered (${data.trigger})`, { title: 'Automatic optimization' });
    };
    socket.on('perf:auto-action', autoActionHandler);

    return () => {
      socket.off('perf:snapshot', handler);
      socket.off('perf:auto-action', autoActionHandler);
      socket.emit('unsubscribe:perf');
    };
  }, []);

  // Load history on range change
  useEffect(() => {
    api(`/api/admin/performance/history?range=${range}`).then((d: any) => setHistory(d.history || [])).catch(() => {});
  }, [range]);

  const refreshAudit = useCallback(() => {
    api('/api/admin/performance/audit').then((d: any) => setAudit(d.audit || [])).catch(() => {});
  }, []);

  const toggleAutoOptimize = async () => {
    const newState = { ...autoOpt, enabled: !autoOpt?.enabled };
    try {
      const d: any = await api('/api/admin/performance/auto-optimize', { method: 'PATCH', body: newState });
      setAutoOpt(d);
      alert.success(`Auto-Optimize ${d.enabled ? 'enabled' : 'disabled'}.`);
    } catch (err: any) {
      alert.critical(err.message, { title: 'Failed to toggle Auto-Optimize' });
    }
  };

  const runAction = async (action: string, extra?: any) => {
    const actionLabels: Record<string, string> = {
      'cache-clear': 'Clear Redis cache (OTC namespace)',
      'cache-clear-all': 'Clear ALL Redis cache',
      'pool-resize': 'Adjust connection pool size',
      'threshold-update': 'Update performance thresholds',
    };
    const isDanger = action === 'cache-clear-all';
    const ok = await alert.confirm({
      severity: isDanger ? 'critical' : 'warning',
      title: actionLabels[action] || action,
      message: isDanger
        ? 'This clears ALL Redis keys including cached ticks. The OTC engine will re-seed hot data. Are you sure?'
        : 'This action will be executed immediately. Before/after metrics will be captured and logged to the audit trail.',
      confirmLabel: 'Execute',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d: any = await api('/api/admin/performance/action', {
        method: 'POST',
        body: { action, confirmed: true, ...extra },
      });
      setLastAction(d.audit);
      refreshAudit();
      if (d.audit.status === 'success') {
        alert.success(`${actionLabels[action]} — ${d.audit.message}`);
      } else {
        alert.critical(d.audit.message || 'Action failed', { title: 'Action failed' });
      }
    } catch (err: any) {
      alert.critical(err.message, { title: 'Action failed' });
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="admin-perf">
        <PageHeader eyebrow="System" title="Performance &" highlight="Speed Control" subtitle="Collecting metrics…" />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>
          <RefreshCw size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 12 }}>Initializing performance monitors…</p>
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="admin-perf">
        <PageHeader eyebrow="System" title="Performance &" highlight="Speed Control" subtitle="No data" />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)' }}>No performance data available.</div>
      </div>
    );
  }

  const scoreC = scoreColor(snap.speedScore);
  const trendIcon = snap.trend === 'improving' ? <TrendingUp size={14} /> : snap.trend === 'degrading' ? <TrendingDown size={14} /> : <Minus size={14} />;

  // Bottleneck detection
  const bottlenecks: { area: string; detail: string; value: string; severity: string }[] = [];
  if (snap.api.p95 > 500) bottlenecks.push({ area: 'API Backend', detail: 'p95 latency is high', value: fmtMs(snap.api.p95), severity: snap.api.p95 > 1500 ? 'critical' : 'warning' });
  if (snap.rum.admin.lcpP75 > 2500) bottlenecks.push({ area: 'Admin Panel LCP', detail: 'Largest Contentful Paint slow', value: fmtMs(snap.rum.admin.lcpP75), severity: snap.rum.admin.lcpP75 > 4000 ? 'critical' : 'warning' });
  if (snap.rum.user.lcpP75 > 2500) bottlenecks.push({ area: 'User Panel LCP', detail: 'Largest Contentful Paint slow', value: fmtMs(snap.rum.user.lcpP75), severity: snap.rum.user.lcpP75 > 4000 ? 'critical' : 'warning' });
  if (snap.process?.cpuPercent > 70) bottlenecks.push({ area: 'Node.js Process', detail: 'CPU usage high', value: `${snap.process.cpuPercent}%`, severity: 'warning' });
  if (snap.process?.eventLoopLagMs > 100) bottlenecks.push({ area: 'Event Loop', detail: 'Lag detected', value: `${snap.process.eventLoopLagMs}ms`, severity: snap.process.eventLoopLagMs > 500 ? 'critical' : 'warning' });
  if (snap.api.errorRate > 1) bottlenecks.push({ area: 'Error Rate', detail: 'API errors detected', value: `${snap.api.errorRate}%`, severity: snap.api.errorRate > 5 ? 'critical' : 'warning' });

  return (
    <div className="admin-perf">
      <PageHeader eyebrow="System" title="Performance &" highlight="Speed Control" subtitle="Real-time monitoring & optimization for the whole site" />

      {/* Alerts */}
      {bottlenecks.filter(b => b.severity === 'critical').length > 0 && (
        <div className="perf-alert critical">
          <AlertTriangle size={16} />
          <strong>Critical bottleneck detected:</strong> {bottlenecks.filter(b => b.severity === 'critical').map(b => b.area).join(', ')}
        </div>
      )}
      {bottlenecks.filter(b => b.severity === 'warning').length > 0 && (
        <div className="perf-alert warning">
          <AlertTriangle size={16} />
          <strong>Performance warnings:</strong> {bottlenecks.filter(b => b.severity === 'warning').map(b => b.area).join(', ')}
        </div>
      )}

      {/* Speed Score Hero */}
      <div className="perf-hero glass">
        <div className="perf-score-3d">
          <motion.div
            className="perf-score-ring"
            initial={{ rotateX: 15, opacity: 0 }}
            animate={{ rotateX: 15, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ background: `conic-gradient(${scoreC} ${snap.speedScore * 3.6}deg, rgba(255,255,255,0.06) ${snap.speedScore * 3.6}deg)`, transformStyle: 'preserve-3d' }}
          >
            <div className="perf-score-inner">
              <div className="perf-score-val" style={{ color: scoreC }}>{snap.speedScore}</div>
              <div className="perf-score-label">SPEED SCORE</div>
            </div>
          </motion.div>
        </div>
        <div className="perf-hero-info">
          <div className="perf-trend" style={{ background: 'transparent', padding: 0 }}>
            <span className={`perf-trend ${snap.trend}`}>{trendIcon} {snap.trend.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            API p50 <strong className="mono">{fmtMs(snap.api.p50)}</strong> · p95 <strong className="mono">{fmtMs(snap.api.p95)}</strong> · {snap.api.throughput} req/min
          </div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            Admin LCP <strong>{snap.rum.admin.lcpP75 ? fmtMs(snap.rum.admin.lcpP75) : '—'}</strong>
            {' · '}User LCP <strong>{snap.rum.user.lcpP75 ? fmtMs(snap.rum.user.lcpP75) : '—'}</strong>
            {' · '}Errors <strong className={snap.api.errorRate > 1 ? 'down' : 'up'}>{snap.api.errorRate}%</strong>
          </div>
          <div className="perf-range-bar" style={{ marginTop: 8 }}>
            {(['1h', '24h', '7d'] as const).map(r => (
              <button key={r} className={`perf-range-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 8 }}>{history.length} data points</span>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="perf-metrics-grid">
        {/* TTFB */}
        <div className="perf-metric-card" style={{ '--accent': '#3b82f6' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">TTFB</span>
            <span className={`perf-metric-status ${cwvStatus(snap.rum.admin.ttfbP75 || 0, 800, 1800)}`}>
              {cwvStatus(snap.rum.admin.ttfbP75 || 0, 800, 1800)}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: latColor(snap.rum.admin.ttfbP75 || 0) }}>
            {snap.rum.admin.ttfbP75 ? fmtMs(snap.rum.admin.ttfbP75) : '—'}
          </div>
          <div className="perf-metric-sub">Time to First Byte (p75)</div>
        </div>

        {/* LCP */}
        <div className="perf-metric-card" style={{ '--accent': '#f59e0b' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">LCP</span>
            <span className={`perf-metric-status ${cwvStatus(snap.rum.admin.lcpP75 || 0, 2500, 4000)}`}>
              {cwvStatus(snap.rum.admin.lcpP75 || 0, 2500, 4000)}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: latColor(snap.rum.admin.lcpP75 || 0) }}>
            {snap.rum.admin.lcpP75 ? fmtMs(snap.rum.admin.lcpP75) : '—'}
          </div>
          <div className="perf-metric-sub">Largest Contentful Paint (p75)</div>
        </div>

        {/* INP */}
        <div className="perf-metric-card" style={{ '--accent': '#8b5cf6' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">INP</span>
            <span className={`perf-metric-status ${cwvStatus(snap.rum.admin.inpP75 || 0, 200, 500)}`}>
              {cwvStatus(snap.rum.admin.inpP75 || 0, 200, 500)}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: latColor(snap.rum.admin.inpP75 || 0) }}>
            {snap.rum.admin.inpP75 ? fmtMs(snap.rum.admin.inpP75) : '—'}
          </div>
          <div className="perf-metric-sub">Interaction to Next Paint (p75)</div>
        </div>

        {/* CLS */}
        <div className="perf-metric-card" style={{ '--accent': '#ec4899' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">CLS</span>
            <span className={`perf-metric-status ${cwvStatus(snap.rum.admin.clsP75 || 0, 0.1, 0.25)}`}>
              {cwvStatus(snap.rum.admin.clsP75 || 0, 0.1, 0.25)}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: (snap.rum.admin.clsP75 || 0) > 0.25 ? '#ef4444' : (snap.rum.admin.clsP75 || 0) > 0.1 ? '#f59e0b' : '#22c55e' }}>
            {snap.rum.admin.clsP75 ? snap.rum.admin.clsP75.toFixed(3) : '—'}
          </div>
          <div className="perf-metric-sub">Cumulative Layout Shift (p75)</div>
        </div>

        {/* API p95 */}
        <div className="perf-metric-card" style={{ '--accent': '#22c55e' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">API p95</span>
            <span className={`perf-metric-status ${snap.api.p95 < 500 ? 'good' : snap.api.p95 < 1500 ? 'warn' : 'poor'}`}>
              {snap.api.p95 < 500 ? 'good' : snap.api.p95 < 1500 ? 'warn' : 'poor'}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: latColor(snap.api.p95) }}>{fmtMs(snap.api.p95)}</div>
          <div className="perf-metric-sub">{snap.api.total} requests in last 60s</div>
          <Sparkline data={snap.apiHistory?.map((h: any) => h.p95 || 0) || []} color={latColor(snap.api.p95)} max={Math.max(snap.api.p95, 1000)} />
        </div>

        {/* CPU */}
        <div className="perf-metric-card" style={{ '--accent': '#f97316' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">CPU</span>
            <span className={`perf-metric-status ${(snap.process?.cpuPercent || 0) < 70 ? 'good' : 'warn'}`}>
              {(snap.process?.cpuPercent || 0) < 70 ? 'good' : 'warn'}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: (snap.process?.cpuPercent || 0) > 70 ? '#ef4444' : '#22c55e' }}>
            {snap.process?.cpuPercent || 0}%
          </div>
          <div className="perf-metric-sub">Node.js process CPU usage</div>
        </div>

        {/* Memory */}
        <div className="perf-metric-card" style={{ '--accent': '#06b6d4' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">Memory (RSS)</span>
            <span className={`perf-metric-status ${(snap.process?.rssMB || 0) < 512 ? 'good' : 'warn'}`}>
              {(snap.process?.rssMB || 0) < 512 ? 'good' : 'warn'}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: '#06b6d4' }}>
            {snap.process?.rssMB || 0} <span style={{ fontSize: 14 }}>MB</span>
          </div>
          <div className="perf-metric-sub">Heap {snap.process?.heapUsedMB || 0}MB / {snap.process?.heapTotalMB || 0}MB</div>
        </div>

        {/* Event Loop Lag */}
        <div className="perf-metric-card" style={{ '--accent': '#a855f7' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">Event Loop</span>
            <span className={`perf-metric-status ${(snap.process?.eventLoopLagMs || 0) < 100 ? 'good' : 'poor'}`}>
              {(snap.process?.eventLoopLagMs || 0) < 100 ? 'good' : 'poor'}
            </span>
          </div>
          <div className="perf-metric-val" style={{ color: (snap.process?.eventLoopLagMs || 0) > 100 ? '#ef4444' : '#22c55e' }}>
            {snap.process?.eventLoopLagMs || 0}<span style={{ fontSize: 14 }}>ms</span>
          </div>
          <div className="perf-metric-sub">Max event-loop delay</div>
        </div>

        {/* Socket.io Clients */}
        <div className="perf-metric-card" style={{ '--accent': '#6366f1' } as any}>
          <div className="perf-metric-head">
            <span className="perf-metric-title">Socket.io</span>
            <span className="perf-metric-status good">live</span>
          </div>
          <div className="perf-metric-val" style={{ color: '#6366f1' }}>
            {snap.socket?.connectedClients || 0}
          </div>
          <div className="perf-metric-sub">{snap.socket?.adminClients || 0} admin · {snap.socket?.userClients || 0} user</div>
        </div>
      </div>

      {/* Bottleneck View */}
      {bottlenecks.length > 0 && (
        <div className="perf-section">
          <div className="perf-section-head">
            <h3><AlertTriangle size={16} style={{ color: '#ef4444' }} /> Where is the slowness?</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {bottlenecks.map((b, i) => (
              <div key={i} className="perf-bottleneck" style={b.severity === 'warning' ? { borderColor: 'rgba(245,158,11,0.2)' } : {}}>
                <div className="perf-bottleneck-head" style={{ color: b.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>
                  <AlertTriangle size={14} /> {b.area}
                </div>
                <div className="perf-bottleneck-target">{b.detail}</div>
                <div className="perf-bottleneck-val" style={{ color: b.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>{b.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slowest API Endpoints */}
      <div className="perf-section">
        <div className="perf-section-head">
          <h3><Server size={16} /> Slowest API Endpoints</h3>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>Last 60s · sorted by p95</span>
        </div>
        {snap.api.slowest.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="perf-table">
              <thead>
                <tr>
                  <th>Endpoint</th><th>Count</th><th>p50</th><th>p95</th><th>p99</th><th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {snap.api.slowest.map((e: any, i: number) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{e.endpoint}</td>
                    <td>{e.count}</td>
                    <td>
                      <span className="perf-lat-bar" style={{ width: `${Math.min(60, e.p50 / 20)}px`, background: latColor(e.p50) }} />
                      {fmtMs(e.p50)}
                    </td>
                    <td>
                      <span className="perf-lat-bar" style={{ width: `${Math.min(60, e.p95 / 20)}px`, background: latColor(e.p95) }} />
                      <strong>{fmtMs(e.p95)}</strong>
                    </td>
                    <td className="mono">{fmtMs(e.p99)}</td>
                    <td>{e.errorRate > 0 ? <span className="down">{e.errorRate.toFixed(1)}%</span> : <span className="dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dim" style={{ fontSize: 13 }}>No API requests in the last 60s. Generate some traffic to see metrics.</div>
        )}
      </div>

      {/* Page Breakdown Heatmap */}
      {snap.rum.pages.length > 0 && (
        <div className="perf-section">
          <div className="perf-section-head">
            <h3><Activity size={16} /> Page Performance Breakdown</h3>
            <span style={{ fontSize: 11, color: 'var(--dim)' }}>Sorted by LCP (slowest first)</span>
          </div>
          <div className="perf-heatmap">
            {snap.rum.pages.map((p: any, i: number) => {
              const c = latColor(p.lcpP75 || 0);
              return (
                <div key={i} className="perf-heat-cell" style={{ borderColor: `${c}33`, background: `${c}08` }}>
                  <div className="perf-heat-page" title={p.page}>{p.page}</div>
                  <div className="perf-heat-val" style={{ color: c }}>{p.lcpP75 ? fmtMs(p.lcpP75) : '—'}</div>
                  <div className="perf-heat-sub">{p.count} samples · {p.loadTimeAvg ? fmtMs(p.loadTimeAvg) : '—'} avg load</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Speed Boost Controls */}
      <div className="perf-section">
        <div className="perf-section-head">
          <h3><Zap size={16} style={{ color: '#22c55e' }} /> Speed Boost Controls</h3>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>Each action shows real before/after numbers</span>
        </div>
        <div className="perf-boost-grid">
          <button className="perf-boost-card" disabled={busy} onClick={() => runAction('cache-clear', { namespace: 'otc:' })}>
            <div className="perf-boost-icon"><RefreshCw size={18} style={{ color: '#22c55e' }} /></div>
            <div className="perf-boost-title">Clear OTC Cache</div>
            <div className="perf-boost-desc">Clears cached price ticks from Redis. Hot data re-seeds automatically. Safe, reversible.</div>
          </button>
          <button className="perf-boost-card danger" disabled={busy} onClick={() => runAction('cache-clear-all')}>
            <div className="perf-boost-icon"><Trash2 size={18} style={{ color: '#ef4444' }} /></div>
            <div className="perf-boost-title">Clear ALL Redis Cache</div>
            <div className="perf-boost-desc">Full Redis flush. All cached data is removed and re-seeded. Use only when cache is corrupted.</div>
          </button>
          <button className="perf-boost-card" disabled={busy} onClick={() => {
            const size = window.prompt('New pool size (5-20):', String(snap.pool?.max || 10));
            if (size) runAction('pool-resize', { newMax: parseInt(size, 10) });
          }}>
            <div className="perf-boost-icon"><Database size={18} style={{ color: '#3b82f6' }} /></div>
            <div className="perf-boost-title">Adjust DB Pool Size</div>
            <div className="perf-boost-desc">Current: {snap.pool?.max || 10} connections. Safe range: 5-20. Note: requires server restart to apply.</div>
          </button>
          <button className="perf-boost-card" disabled={busy} onClick={() => {
            alert.info('Database maintenance (VACUUM/ANALYZE) is available in the Database Health & Control Center.', { title: 'DB Maintenance' });
          }}>
            <div className="perf-boost-icon"><Database size={18} style={{ color: '#f59e0b' }} /></div>
            <div className="perf-boost-title">DB Maintenance</div>
            <div className="perf-boost-desc">VACUUM/ANALYZE operations are in the Database Health module. Avoid during peak hours.</div>
          </button>
        </div>
      </div>

      {/* Before/After Comparison */}
      {lastAction && (
        <div className="perf-section">
          <div className="perf-section-head">
            <h3><Activity size={16} /> Last Action Result</h3>
            <span className="perf-audit-badge success" style={{ background: lastAction.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: lastAction.status === 'success' ? '#22c55e' : '#ef4444' }}>
              {lastAction.status}
            </span>
          </div>
          <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--muted)' }}>{lastAction.message}</div>
          {lastAction.realChange ? (
            <>
              <div className="perf-comparison">
                <div className="perf-comp-col">
                  <h5>Before</h5>
                  <div className="perf-comp-row"><span>Speed Score</span><strong className="mono">{lastAction.before.speedScore}</strong></div>
                  <div className="perf-comp-row"><span>API p95</span><strong className="mono">{fmtMs(lastAction.before.apiP95)}</strong></div>
                  <div className="perf-comp-row"><span>LCP</span><strong className="mono">{lastAction.before.lcp ? fmtMs(lastAction.before.lcp) : '—'}</strong></div>
                </div>
                <div className="perf-comp-col">
                  <h5>After</h5>
                  <div className="perf-comp-row"><span>Speed Score</span><strong className="mono">{lastAction.after.speedScore}</strong></div>
                  <div className="perf-comp-row"><span>API p95</span><strong className="mono">{fmtMs(lastAction.after.apiP95)}</strong></div>
                  <div className="perf-comp-row"><span>LCP</span><strong className="mono">{lastAction.after.lcp ? fmtMs(lastAction.after.lcp) : '—'}</strong></div>
                </div>
              </div>
              <div className={`perf-comp-delta ${lastAction.realChange.speedScoreDelta > 0 ? 'up' : lastAction.realChange.speedScoreDelta < 0 ? 'down' : 'flat'}`}>
                <span>Speed Score: <strong>{lastAction.realChange.speedScoreDelta > 0 ? '+' : ''}{lastAction.realChange.speedScoreDelta}</strong></span>
                <span>API p95: <strong>{lastAction.realChange.apiP95Delta > 0 ? '+' : ''}{fmtMs(lastAction.realChange.apiP95Delta)}</strong></span>
                <span>LCP: <strong>{lastAction.realChange.lcpDelta > 0 ? '+' : ''}{lastAction.after.lcp ? fmtMs(lastAction.realChange.lcpDelta) : '—'}</strong></span>
              </div>
              {lastAction.realChange.speedScoreDelta === 0 && lastAction.realChange.apiP95Delta === 0 && (
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>
                  No measurable improvement detected. The action was executed but metrics remained stable.
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Auto-Optimize */}
      <div className="perf-section">
        <div className="perf-section-head">
          <h3><Bot size={16} style={{ color: '#8b5cf6' }} /> Auto-Optimize Mode</h3>
        </div>
        <div className="perf-auto-row">
          <div className="perf-auto-info">
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              Auto-Optimize is {autoOpt?.enabled ? 'ON' : 'OFF'}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
              When enabled, the system automatically runs safe, reversible, non-destructive actions when thresholds are exceeded.
              It never changes the schema, deletes data, or runs destructive operations. All actions are logged and have cooldowns.
            </div>
          </div>
          <div className={`perf-toggle ${autoOpt?.enabled ? 'on' : ''}`} onClick={toggleAutoOptimize}>
            <div className="perf-toggle-track"><div className="perf-toggle-knob" /></div>
          </div>
        </div>
        {autoOpt?.rules && (
          <div className="perf-auto-rules">
            {autoOpt.rules.map((r: any, i: number) => (
              <div key={i} className="perf-auto-rule">
                <div className={`perf-auto-rule-dot ${r.enabled ? 'on' : 'off'}`} />
                <div style={{ flex: 1 }}>
                  <strong>{r.name}</strong>
                  <div className="dim" style={{ fontSize: 11 }}>
                    Trigger: {r.trigger.metric} {r.trigger.op} {r.trigger.value} → Action: {r.action}
                    {' · '}Cooldown: {r.cooldownMs / 1000}s
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code-Level Recommendations */}
      <div className="perf-section">
        <div className="perf-section-head">
          <h3><Settings size={16} /> Code-Level Recommendations</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="perf-auto-rule">
            <ChevronRight size={14} style={{ color: '#f59e0b' }} />
            <div>
              <strong>Route-level code-splitting</strong>
              <div className="dim" style={{ fontSize: 11 }}>Admin pages are bundled together. Consider React.lazy for rarely-visited tabs to reduce initial load.</div>
            </div>
          </div>
          <div className="perf-auto-rule">
            <ChevronRight size={14} style={{ color: '#3b82f6' }} />
            <div>
              <strong>Asset optimization</strong>
              <div className="dim" style={{ fontSize: 11 }}>Market icons (361 assets) are lazy-loaded. Verify no eager preloading of off-screen artwork.</div>
            </div>
          </div>
          <div className="perf-auto-rule">
            <ChevronRight size={14} style={{ color: '#22c55e' }} />
            <div>
              <strong>Socket.io connection pooling</strong>
              <div className="dim" style={{ fontSize: 11 }}>The realtime transport shares one control SSE per scope. Verify no duplicate connections exist.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="perf-section">
        <div className="perf-section-head">
          <h3><Clock size={16} /> Action Audit Log</h3>
          <button className="btn btn-sm btn-ghost" onClick={refreshAudit}>Refresh</button>
        </div>
        {audit.length > 0 ? (
          <div className="perf-audit-list">
            {audit.slice(0, 10).map((a: any, i: number) => (
              <div key={i} className="perf-audit-entry">
                <span className={`perf-audit-badge ${a.status}`}>{a.status}</span>
                <span style={{ flex: 1 }}>{a.action} {a.target ? `→ ${a.target}` : ''}</span>
                <span className="dim" style={{ fontSize: 11 }}>{a.admin}</span>
                <span className="dim mono" style={{ fontSize: 10.5 }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dim" style={{ fontSize: 13 }}>No actions performed yet.</div>
        )}
      </div>
    </div>
  );
}
