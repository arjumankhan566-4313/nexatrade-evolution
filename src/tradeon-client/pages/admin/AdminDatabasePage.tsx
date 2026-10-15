/**
 * AdminDatabasePage — Database Health & Control Center.
 *
 * NEW MODULE (Part 3 of the master directive): a dedicated admin panel for
 * real-time database monitoring and administrative control.
 *
 * Design: premium 3D visual aesthetic using CSS perspective transforms +
 * framer-motion animations. 2D fallback via `prefers-reduced-motion`.
 * No DB credentials or secrets ever reach the frontend.
 *
 * Features:
 *   • Real-time storage pressure (total size, per-table sizes, usage %)
 *   • Connection health (active/idle/idle-in-txn, limit usage)
 *   • Query activity (active queries, waiting, TPS)
 *   • Management actions: VACUUM/ANALYZE, terminate connections, data cleanup
 *   • Audit log for all management actions
 *   • Confirmation dialogs with impact previews
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  HardDrive,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Wrench,
  Shield,
  RefreshCw,
  Layers,
  Gauge,
} from "lucide-react";
import { api } from "@/tradeon-client/lib/apiClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import { socket } from "@/tradeon-client/lib/socket";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";

type HealthData = {
  timestamp: string;
  storage: {
    totalSize: number;
    totalSizeHuman: string;
    planLimit: number;
    planLimitHuman: string;
    usagePercent: number;
  };
  connections: {
    active: number;
    idle: number;
    idleInTransaction: number;
    waiting: number;
    maxConnections: number;
    usagePercent: number;
  };
  queries: { active: number; waiting: number; list: any[] };
  throughput: {
    tps: number;
    xactCommit: number;
    xactRollback: number;
    tuplesInserted: number;
    tuplesUpdated: number;
    tuplesDeleted: number;
    tuplesReturned: number;
  };
  cache: { hitRatio: number; blocksHit: number; blocksRead: number };
  tables: {
    schema: string;
    name: string;
    totalSize: number;
    totalSizeHuman: string;
    dataSize: number;
    indexSize: number;
    rowEstimate: number;
    deadTuples: number;
  }[];
  healthScore: number;
};

type AuditEntry = {
  id: string;
  admin: string;
  action: string;
  target: string;
  status: string;
  message: string;
  created_at: string;
};

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function healthColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function pressureColor(pct: number): string {
  if (pct < 60) return "#22c55e";
  if (pct < 85) return "#f59e0b";
  return "#ef4444";
}

// ── 3D Gauge Component ──
function Gauge3D({
  value,
  max,
  label,
  unit,
  color,
  icon,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  icon: any;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const Icon = icon;
  return (
    <div className="db-gauge3d" style={{ perspective: "800px" }}>
      <motion.div
        className="db-gauge-face"
        initial={{ rotateX: 15, opacity: 0 }}
        animate={{ rotateX: 15, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="db-gauge-ring"
          style={{
            background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,0.06) ${pct * 3.6}deg)`,
          }}
        >
          <div className="db-gauge-inner">
            <Icon size={22} style={{ color, marginBottom: 4 }} />
            <div className="db-gauge-val" style={{ color }}>
              {value < 1000 ? value.toFixed(unit === "%" ? 1 : 0) : fmtNum(value)}
            </div>
            <div className="db-gauge-unit">{unit}</div>
          </div>
        </div>
        <div className="db-gauge-label">{label}</div>
      </motion.div>
    </div>
  );
}

// ── 3D Bar Chart for Table Sizes ──
function TableBars3D({ tables }: { tables: HealthData["tables"] }) {
  const max = Math.max(...tables.map((t) => t.totalSize), 1);
  const top = tables.slice(0, 20);
  return (
    <div className="db-bars3d" style={{ perspective: "1000px" }}>
      <motion.div
        className="db-bars-scene"
        initial={{ rotateX: 25, opacity: 0 }}
        animate={{ rotateX: 25, opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {top.map((t, i) => {
          const h = (t.totalSize / max) * 100;
          const p = (t.totalSize / (1024 * 1024 * 1024)) * 100;
          return (
            <div
              key={`${t.schema}.${t.name}`}
              className="db-bar3d-col"
              title={`${t.name}: ${t.totalSizeHuman}`}
            >
              <motion.div
                className="db-bar3d"
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(2, h)}%` }}
                transition={{ delay: i * 0.02, type: "spring", stiffness: 80, damping: 14 }}
                style={{
                  background: `linear-gradient(180deg, ${pressureColor(p)} 0%, ${pressureColor(p)}cc 50%, ${pressureColor(p)}44 100%)`,
                  boxShadow: `0 0 20px -4px ${pressureColor(p)}66, inset 0 1px 0 rgba(255,255,255,0.2)`,
                }}
              />
              <div className="db-bar3d-label">
                {t.name.length > 12 ? t.name.slice(0, 10) + "…" : t.name}
              </div>
              <div className="db-bar3d-size">{t.totalSizeHuman}</div>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ── Connection Health Visualization ──
function ConnectionViz({ connections }: { connections: HealthData["connections"] }) {
  const max = connections.maxConnections || 100;
  const segments = [
    { label: "Active", count: connections.active, color: "#3b82f6" },
    { label: "Idle", count: connections.idle, color: "#64748b" },
    { label: "Idle in Txn", count: connections.idleInTransaction, color: "#f59e0b" },
    { label: "Waiting", count: connections.waiting, color: "#ef4444" },
  ];
  return (
    <div className="db-conn-viz">
      <div className="db-conn-bar" style={{ perspective: "600px" }}>
        <motion.div
          className="db-conn-bar-inner"
          initial={{ rotateX: 20, opacity: 0 }}
          animate={{ rotateX: 20, opacity: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            transformStyle: "preserve-3d",
            display: "flex",
            height: 44,
            borderRadius: 10,
            overflow: "hidden",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          {segments.map((s) => {
            const w = s.count > 0 ? (s.count / max) * 100 : 0;
            return w > 0 ? (
              <motion.div
                key={s.label}
                initial={{ width: 0 }}
                animate={{ width: `${w}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 16 }}
                style={{
                  background: `linear-gradient(180deg, ${s.color}, ${s.color}aa)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                {s.count > 2 && s.count}
              </motion.div>
            ) : null;
          })}
        </motion.div>
      </div>
      <div className="db-conn-legend">
        {segments.map((s) => (
          <div key={s.label} className="db-conn-leg-item">
            <span className="db-conn-dot" style={{ background: s.color }} />
            <span className="dim">{s.label}</span>
            <strong className="mono">{s.count}</strong>
          </div>
        ))}
        <div className="db-conn-leg-item">
          <span
            className="db-conn-dot"
            style={{ background: "transparent", border: "1px solid var(--stroke)" }}
          />
          <span className="dim">Max</span>
          <strong className="mono">{max}</strong>
        </div>
      </div>
    </div>
  );
}

export default function AdminDatabasePage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<{
    kind: string;
    title: string;
    message: string;
    confirmLabel: string;
    payload?: any;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<{
    kind: string;
    rows: number;
    label: string;
  } | null>(null);
  const socketRef = useRef(false);

  const loadHealth = useCallback(async () => {
    try {
      const d = await api("/api/admin/db-health");
      setHealth(d.health);
    } catch (err: any) {
      alert.critical(err.message, { title: "Database health unavailable" });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const d = await api("/api/admin/db-health/audit");
      setAudit(d.audit || []);
    } catch {
      /* table might not exist yet */
    }
  }, []);

  useEffect(() => {
    loadHealth();
    loadAudit();
    const t = setInterval(loadHealth, 10000);
    return () => clearInterval(t);
  }, [loadHealth, loadAudit]);

  // Socket.io live updates
  useEffect(() => {
    if (!socket || socketRef.current) return;
    socketRef.current = true;
    socket.on("db:health", (data: any) => {
      if (data?.storage) {
        setHealth((prev) =>
          prev
            ? {
                ...prev,
                storage: {
                  ...prev.storage,
                  totalSize: data.storage.totalSize,
                  totalSizeHuman: data.storage.totalSizeHuman,
                  usagePercent: data.storage.usagePercent,
                },
                connections: data.connections
                  ? { ...prev.connections, ...data.connections }
                  : prev.connections,
                queries: data.queries ? { ...prev.queries, ...data.queries } : prev.queries,
                timestamp: data.timestamp,
              }
            : prev,
        );
      }
    });
    return () => {
      socket.off("db:health");
    };
  }, []);

  const runAction = async (action: string, payload?: any) => {
    setBusy(true);
    try {
      await api("/api/admin/db-health/action", {
        method: "POST",
        body: { action, confirmed: true, ...payload },
      });
      alert.success("Action completed successfully.");
      setActionModal(null);
      setCleanupPreview(null);
      await loadHealth();
      await loadAudit();
    } catch (err: any) {
      alert.critical(err.message, { title: "Action failed" });
    } finally {
      setBusy(false);
    }
  };

  const previewCleanup = async (kind: string, olderThanDays: number) => {
    try {
      const d = await api("/api/admin/db-health/action", {
        method: "POST",
        body: { action: kind, confirmed: true, previewOnly: true, olderThanDays },
      });
      const rows = d.audit?.message ? parseInt(d.audit.message.match(/(\d+)/)?.[1] || "0", 10) : 0;
      setCleanupPreview({ kind, rows, label: `${rows} rows older than ${olderThanDays} days` });
    } catch (err: any) {
      alert.critical(err.message, { title: "Preview failed" });
    }
  };

  if (loading || !health) {
    return (
      <div
        className="admin-db-health"
        style={{ display: "grid", placeItems: "center", minHeight: 400 }}
      >
        <div style={{ textAlign: "center" }}>
          <RefreshCw
            size={28}
            className="spin"
            style={{
              color: "var(--gold-1)",
              marginBottom: 12,
              animation: "spin 1.2s linear infinite",
            }}
          />
          <div className="dim">Scanning database health…</div>
        </div>
      </div>
    );
  }

  const storageColor = pressureColor(health.storage.usagePercent);
  const connColor = pressureColor(health.connections.usagePercent);

  return (
    <div className="admin-db-health">
      <PageHeader
        eyebrow="Infrastructure"
        title="Database Health &"
        highlight="Control Center"
        subtitle="Real-time PostgreSQL monitoring · Neon storage pressure · Administrative controls"
      />

      {/* ── Top Row: 3D Gauges ── */}
      <div className="db-gauges-row">
        <Gauge3D
          value={health.storage.usagePercent}
          max={100}
          label="Storage Pressure"
          unit="%"
          color={storageColor}
          icon={HardDrive}
        />
        <Gauge3D
          value={health.connections.active}
          max={health.connections.maxConnections}
          label="Connections"
          unit=""
          color={connColor}
          icon={Activity}
        />
        <Gauge3D
          value={health.queries.active}
          max={50}
          label="Active Queries"
          unit=""
          color="#3b82f6"
          icon={Zap}
        />
        <Gauge3D
          value={health.cache.hitRatio}
          max={100}
          label="Cache Hit Ratio"
          unit="%"
          color="#22c55e"
          icon={Layers}
        />
        <Gauge3D
          value={health.healthScore}
          max={100}
          label="Health Score"
          unit="/100"
          color={healthColor(health.healthScore)}
          icon={Gauge}
        />
      </div>

      {/* ── Storage Pressure Detail ── */}
      <section className="glass db-section" style={{ marginBottom: 16 }}>
        <div className="db-section-head">
          <h3>
            <HardDrive size={16} /> Storage Pressure
          </h3>
          <div className="db-storage-bar-wrap">
            <div className="db-storage-bar">
              <motion.div
                className="db-storage-fill"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, health.storage.usagePercent)}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 16 }}
                style={{ background: `linear-gradient(90deg, ${storageColor}, ${storageColor}88)` }}
              />
            </div>
            <div className="db-storage-text">
              <strong className="mono" style={{ color: storageColor }}>
                {health.storage.totalSizeHuman}
              </strong>
              <span className="dim">
                {" "}
                / {health.storage.planLimitHuman} ({health.storage.usagePercent.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
        <p className="dim db-section-desc">
          Total database size vs. Neon plan limit. Over 85% triggers automated OTC data pruning.
        </p>
      </section>

      {/* ── Connection Health ── */}
      <section className="glass db-section" style={{ marginBottom: 16 }}>
        <div className="db-section-head">
          <h3>
            <Activity size={16} /> Connection Health
          </h3>
          <span
            className={`badge ${health.connections.usagePercent < 60 ? "badge-up" : health.connections.usagePercent < 85 ? "badge-warn" : "badge-down"}`}
          >
            {health.connections.usagePercent.toFixed(0)}% used
          </span>
        </div>
        <ConnectionViz connections={health.connections} />
      </section>

      {/* ── Query Activity ── */}
      <section className="glass db-section" style={{ marginBottom: 16 }}>
        <div className="db-section-head">
          <h3>
            <Zap size={16} /> Query Activity
          </h3>
          <div className="row" style={{ gap: 16, fontSize: 12.5 }}>
            <span className="dim">
              TPS: <strong className="mono up">{health.throughput.tps}</strong>
            </span>
            <span className="dim">
              Commits: <strong className="mono">{fmtNum(health.throughput.xactCommit)}</strong>
            </span>
            <span className="dim">
              Rollbacks:{" "}
              <strong className="mono {health.throughput.xactRollback > 0 ? 'down' : ''}">
                {fmtNum(health.throughput.xactRollback)}
              </strong>
            </span>
          </div>
        </div>
        {health.queries.list.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>State</th>
                  <th>Duration</th>
                  <th>Wait Event</th>
                  <th>Query Preview</th>
                  <th>Client</th>
                </tr>
              </thead>
              <tbody>
                {health.queries.list.map((q) => (
                  <tr key={q.pid}>
                    <td className="mono">{q.pid}</td>
                    <td>
                      <span className={`badge ${q.state === "active" ? "badge-up" : "badge-warn"}`}>
                        {q.state}
                      </span>
                    </td>
                    <td className="mono">{q.duration}s</td>
                    <td className="dim">{q.waitEvent || "—"}</td>
                    <td
                      className="mono"
                      style={{
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {q.preview}
                    </td>
                    <td className="mono dim">{q.client}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 24 }}>
            No active queries — database is idle. ✓
          </div>
        )}
      </section>

      {/* ── Table Sizes 3D Bar Chart ── */}
      <section className="glass db-section" style={{ marginBottom: 16 }}>
        <div className="db-section-head">
          <h3>
            <Layers size={16} /> Table Storage Map
          </h3>
          <span className="dim" style={{ fontSize: 12 }}>
            {health.tables.length} largest tables
          </span>
        </div>
        <p className="dim db-section-desc">
          3D heightmap — bar height is proportional to total relation size (data + indexes).
        </p>
        <TableBars3D tables={health.tables} />
      </section>

      {/* ── Throughput Stats ── */}
      <section className="glass db-section" style={{ marginBottom: 16 }}>
        <div className="db-section-head">
          <h3>
            <Database size={16} /> Throughput Statistics
          </h3>
        </div>
        <div className="db-stats-grid">
          {[
            { label: "Tuples Inserted", value: health.throughput.tuplesInserted, color: "#22c55e" },
            { label: "Tuples Updated", value: health.throughput.tuplesUpdated, color: "#3b82f6" },
            { label: "Tuples Deleted", value: health.throughput.tuplesDeleted, color: "#ef4444" },
            { label: "Tuples Returned", value: health.throughput.tuplesReturned, color: "#f59e0b" },
            { label: "Cache Blocks Hit", value: health.cache.blocksHit, color: "#22c55e" },
            { label: "Cache Blocks Read", value: health.cache.blocksRead, color: "#64748b" },
          ].map((s) => (
            <div key={s.label} className="db-stat-card">
              <div className="db-stat-val mono" style={{ color: s.color }}>
                {fmtNum(s.value)}
              </div>
              <div className="db-stat-label dim">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Administrative Controls ── */}
      <section
        className="glass db-section"
        style={{ marginBottom: 16, borderColor: "rgba(243,186,47,.25)" }}
      >
        <div className="db-section-head">
          <h3>
            <Wrench size={16} /> Administrative Controls
          </h3>
          <span className="badge badge-warn">
            Read-only by default · Actions require confirmation
          </span>
        </div>
        <p className="dim db-section-desc">
          All management actions require explicit confirmation, show an impact preview, and are
          written to the audit log. Destructive operations (DROP/TRUNCATE) are NOT exposed as
          one-click actions.
        </p>
        <div className="db-actions-grid">
          <button
            className="db-action-btn"
            onClick={() =>
              setActionModal({
                kind: "vacuum-analyze",
                title: "Run VACUUM ANALYZE",
                message:
                  "Reclaims dead tuple space and updates planner statistics. This is a maintenance operation — it does NOT delete data. May briefly increase I/O.",
                confirmLabel: "Run VACUUM ANALYZE",
              })
            }
          >
            <Wrench size={18} />
            <span>VACUUM ANALYZE</span>
            <small>Reclaim space & update stats</small>
          </button>

          <button
            className="db-action-btn"
            onClick={() => {
              if (health.queries.list.length === 0) {
                alert.info("No active queries to terminate.");
                return;
              }
              setActionModal({
                kind: "terminate-connection",
                title: "Terminate a Connection",
                message: `Select a connection to terminate. This is useful for stuck or long-running idle-in-transaction connections. Active queries being terminated will roll back.`,
                confirmLabel: "Terminate",
                payload: { list: health.queries.list },
              });
            }}
          >
            <AlertTriangle size={18} />
            <span>Terminate Connection</span>
            <small>Kill stuck or idle connections</small>
          </button>

          <button
            className="db-action-btn"
            onClick={() =>
              setActionModal({
                kind: "cleanup-otc-ticks",
                title: "Cleanup OTC Price Ticks",
                message:
                  "Delete old OTC price tick data to free storage. This is safe — tick data is only used for live price display and is not needed for historical analysis.",
                confirmLabel: "Preview impact",
              })
            }
          >
            <Trash2 size={18} />
            <span>Cleanup OTC Ticks</span>
            <small>Free storage by pruning old ticks</small>
          </button>

          <button
            className="db-action-btn"
            onClick={() =>
              setActionModal({
                kind: "cleanup-otc-candles",
                title: "Cleanup OTC Candles",
                message:
                  "Delete old OTC candle data to free storage. Candle data older than the retention window is not needed — synthetic history regenerates on demand.",
                confirmLabel: "Preview impact",
              })
            }
          >
            <Trash2 size={18} />
            <span>Cleanup OTC Candles</span>
            <small>Free storage by pruning old candles</small>
          </button>
        </div>
      </section>

      {/* ── Audit Log ── */}
      <section className="glass db-section">
        <div className="db-section-head">
          <h3>
            <Shield size={16} /> Action Audit Log
          </h3>
          <button className="btn btn-sm btn-ghost" onClick={loadAudit}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {audit.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="dim" style={{ fontSize: 11.5 }}>
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td>{a.admin}</td>
                    <td>
                      <span className="badge">{a.action}</span>
                    </td>
                    <td className="mono">{a.target}</td>
                    <td>
                      <span
                        className={`badge ${a.status === "success" ? "badge-up" : a.status === "failed" ? "badge-down" : "badge-warn"}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="dim" style={{ fontSize: 11.5 }}>
                      {a.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 20 }}>
            No administrative actions recorded yet.
          </div>
        )}
      </section>

      {/* ── Action Confirmation Modal ── */}
      <AnimatePresence>
        {actionModal && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setActionModal(null);
              setCleanupPreview(null);
            }}
          >
            <motion.div
              className="glass db-action-modal"
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>{actionModal.title}</h3>
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.6, margin: "12px 0" }}>
                {actionModal.message}
              </p>

              {/* Terminate connection: show query list */}
              {actionModal.kind === "terminate-connection" && actionModal.payload?.list && (
                <div
                  className="table-wrap"
                  style={{ margin: "12px 0", maxHeight: 240, overflowY: "auto" }}
                >
                  <table className="data">
                    <thead>
                      <tr>
                        <th>PID</th>
                        <th>State</th>
                        <th>Duration</th>
                        <th>Preview</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionModal.payload.list.map((q: any) => (
                        <tr key={q.pid}>
                          <td className="mono">{q.pid}</td>
                          <td>
                            <span
                              className={`badge ${q.state === "active" ? "badge-up" : "badge-warn"}`}
                            >
                              {q.state}
                            </span>
                          </td>
                          <td className="mono">{q.duration}s</td>
                          <td
                            className="mono dim"
                            style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}
                          >
                            {q.preview}
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-down"
                              disabled={busy}
                              onClick={() => runAction("terminate-connection", { pid: q.pid })}
                            >
                              Terminate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cleanup actions: show preview / retention selector */}
              {(actionModal.kind === "cleanup-otc-ticks" ||
                actionModal.kind === "cleanup-otc-candles") && (
                <div style={{ margin: "12px 0" }}>
                  <div className="field">
                    <label>Retention window (days)</label>
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        className="input mono"
                        type="number"
                        min="1"
                        defaultValue={actionModal.kind === "cleanup-otc-ticks" ? 7 : 30}
                        id="cleanup-days-input"
                        style={{ width: 100 }}
                      />
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() =>
                          previewCleanup(
                            actionModal.kind,
                            parseInt(
                              (document.getElementById("cleanup-days-input") as HTMLInputElement)
                                ?.value || "7",
                              10,
                            ),
                          )
                        }
                      >
                        Preview impact
                      </button>
                    </div>
                  </div>
                  {cleanupPreview && (
                    <div className="alert alert-warn" style={{ marginTop: 12, fontSize: 12.5 }}>
                      <CheckCircle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
                      {cleanupPreview.label} will be permanently deleted. This cannot be undone.
                    </div>
                  )}
                </div>
              )}

              <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setActionModal(null);
                    setCleanupPreview(null);
                  }}
                >
                  Cancel
                </button>
                {actionModal.kind !== "terminate-connection" && (
                  <button
                    className="btn btn-gold"
                    disabled={
                      busy ||
                      ((actionModal.kind === "cleanup-otc-ticks" ||
                        actionModal.kind === "cleanup-otc-candles") &&
                        !cleanupPreview)
                    }
                    onClick={() => {
                      if (
                        actionModal.kind === "cleanup-otc-ticks" ||
                        actionModal.kind === "cleanup-otc-candles"
                      ) {
                        const days = parseInt(
                          (document.getElementById("cleanup-days-input") as HTMLInputElement)
                            ?.value || "7",
                          10,
                        );
                        runAction(actionModal.kind, { olderThanDays: days });
                      } else {
                        runAction(actionModal.kind);
                      }
                    }}
                  >
                    {busy
                      ? "Running…"
                      : cleanupPreview
                        ? "Confirm & execute"
                        : actionModal.confirmLabel}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
