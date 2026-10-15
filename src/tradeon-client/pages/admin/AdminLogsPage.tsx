/**
 * AdminLogsPage — 1:1 port of legacy src/app/nexa-admin-portal/logs/page.jsx.
 * Security / audit log with device & IP forensics.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate } from "@/tradeon-client/lib/apiClient";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";

const SEV_CLASS: Record<string, string> = {
  INFO: "badge badge-info",
  WARNING: "badge badge-warn",
  CRITICAL: "badge badge-down",
};

export default function AdminLogsPage() {
  const [severity, setSeverity] = useState("ALL");
  const [logs, setLogs] = useState<any[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async (sev: string) => {
    const d: any = await api(`/api/admin/logs?severity=${sev}&limit=300`);
    setLogs(d.logs);
  }, []);

  useEffect(() => {
    load(severity).catch(() => {});
    const t = setInterval(() => load(severity).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [severity, load]);

  const filtered = logs.filter(
    (l: any) =>
      !q || `${l.event} ${l.email} ${l.ip} ${l.device}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Audit trail"
        title="System"
        highlight="Logs"
        subtitle="Security events & operator activity"
      />
      <div className="row-between" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8 }}>
          {["ALL", "INFO", "WARNING", "CRITICAL"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${severity === s ? "btn-gold" : "btn-ghost"}`}
              onClick={() => setSeverity(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Filter event, email, IP…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Time</th>
              <th>Severity</th>
              <th>Event</th>
              <th>Account</th>
              <th>IP</th>
              <th>Device</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l: any) => (
              <tr key={l.id}>
                <td className="dim">{fmtDate(l.createdAt)}</td>
                <td>
                  <span className={SEV_CLASS[l.severity] || "badge"}>{l.severity}</span>
                </td>
                <td>
                  <strong>{l.event}</strong>
                </td>
                <td>{l.email || "—"}</td>
                <td className="mono">{l.ip}</td>
                <td className="dim">{l.device}</td>
                <td className="dim mono">
                  {Object.keys(l.meta || {}).length ? (
                    <details className="nt-log-detail">
                      <summary>View details</summary>
                      <pre>{JSON.stringify(l.meta, null, 2)}</pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="empty">No log entries.</div>}
      </div>
    </div>
  );
}
