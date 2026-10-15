/**
 * AdminAffiliatePage — 1:1 port of legacy src/app/nexa-admin-portal/affiliate/page.jsx.
 * Partners, commissions & payout management with applications tab.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useState } from "react";
import { api, money, fmtDate } from "@/tradeon-client/lib/apiClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";

const AFFILIATE_TOPICS = ["finance", "settings", "admin", "affiliate_application"];

export default function AdminAffiliatePage() {
  const [tab, setTab] = useState("partners");
  const [data, setData] = useState<any>(null);
  const [apps, setApps] = useState<any>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingPartner, setEditingPartner] = useState<any>(null);
  const [rateInput, setRateInput] = useState("");
  const [statusInput, setStatusInput] = useState("ACTIVE");
  const [payoutNotes, setPayoutNotes] = useState<Record<string, string>>({});
  const [appFilter, setAppFilter] = useState("PENDING");
  const [appNotes, setAppNotes] = useState<Record<string, string>>({});
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const load = useCallback(async (query = "") => {
    try {
      const res = await api(`/api/admin/affiliate?q=${encodeURIComponent(query)}`);
      setData(res);
    } catch (err: any) {
      alert.critical(err.message, { title: "Affiliate data unavailable" });
    }
  }, []);

  const loadApps = useCallback(async (status = "PENDING") => {
    try {
      const qs = status === "ALL" ? "" : `&status=${status}`;
      const res = await api(`/api/admin/affiliate/applications?${qs}`);
      setApps(res);
    } catch (err: any) {
      alert.critical(err.message, { title: "Applications unavailable" });
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
    loadApps(appFilter).catch(() => {});
    const t = setInterval(() => {
      load(q).catch(() => {});
      loadApps(appFilter).catch(() => {});
    }, 12000);
    return () => clearInterval(t);
  }, [load, loadApps, q, appFilter]);

  const onLiveEvent = useCallback(
    (event: any) => {
      if (["finance", "settings", "admin", "affiliate_application"].includes(event.topic)) {
        load(q);
        loadApps(appFilter);
      }
    },
    [load, loadApps, q, appFilter],
  );
  useLiveEvents({ scope: "admin", topics: AFFILIATE_TOPICS, onEvent: onLiveEvent });

  useEffect(() => {
    const t = setTimeout(() => load(q).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  const updatePartner = async (userId: string) => {
    const ok = await alert.confirm({
      severity: "warning",
      title: "Update partner settings?",
      message: `Commission rate ${Number(rateInput)}% · status ${statusInput} — applies to every future commission immediately.`,
      confirmLabel: "Confirm & apply",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      await api("/api/admin/affiliate", {
        method: "PATCH",
        body: { userId, commissionRate: Number(rateInput), affiliateStatus: statusInput },
      });
      alert.success("Partner affiliate settings updated.");
      setEditingPartner(null);
      await load(q);
    } catch (err: any) {
      alert.critical(err.message, { title: "Partner NOT updated" });
    }
  };

  const decidePayout = async (payoutId: string, decision: string) => {
    const approving = decision === "APPROVED";
    const ok = await alert.confirm({
      severity: approving ? "warning" : "critical",
      title: approving ? "Approve commission payout?" : "Reject commission payout?",
      message: approving
        ? "The partner is credited immediately and notified."
        : `The request is closed${payoutNotes[payoutId] ? ` — "${payoutNotes[payoutId]}"` : ""} and the partner is notified.`,
      confirmLabel: approving ? "Approve & pay" : "Reject",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusyId(payoutId);
    try {
      await api(`/api/admin/affiliate/payouts/${payoutId}`, {
        method: "PATCH",
        body: { decision, note: payoutNotes[payoutId] || "" },
      });
      alert.success(`Commission payout request ${decision.toLowerCase()}.`);
      await load(q);
    } catch (err: any) {
      alert.critical(err.message, { title: "Payout decision NOT applied" });
    } finally {
      setBusyId(null);
    }
  };

  const decideApp = async (applicationId: string, decision: string) => {
    const approving = decision === "APPROVED";
    const ok = await alert.confirm({
      severity: approving ? "warning" : "critical",
      title: approving ? "Approve this partner application?" : "Reject this application?",
      message: approving
        ? "The applicant becomes an active affiliate immediately and receives their referral link."
        : `The applicant is notified${appNotes[applicationId] ? ` — "${appNotes[applicationId]}"` : ""}.`,
      confirmLabel: approving ? "Approve partner" : "Reject",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusyId(applicationId);
    try {
      await api("/api/admin/affiliate/applications", {
        method: "PATCH",
        body: { applicationId, decision, note: appNotes[applicationId] || "" },
      });
      alert.success(`Application ${decision.toLowerCase()} successfully.`);
      await loadApps(appFilter);
      setExpandedApp(null);
    } catch (err: any) {
      alert.critical(err.message, { title: "Application decision NOT applied" });
    } finally {
      setBusyId(null);
    }
  };

  const appPending = apps?.stats?.pending ?? 0;

  return (
    <div className="admin-affiliate">
      <PageHeader
        eyebrow="Growth & partnerships"
        title="Affiliate"
        highlight="Network"
        subtitle="Partners, commissions & payout management"
      />

      <div className="aff-tabs">
        <button
          className={`aff-tab ${tab === "partners" ? "active" : ""}`}
          onClick={() => setTab("partners")}
        >
          Partners
        </button>
        <button
          className={`aff-tab ${tab === "applications" ? "active" : ""}`}
          onClick={() => setTab("applications")}
        >
          Applications
          {appPending > 0 && <span className="aff-tab-badge">{appPending}</span>}
        </button>
        <button
          className={`aff-tab ${tab === "payouts" ? "active" : ""}`}
          onClick={() => setTab("payouts")}
        >
          Payouts
        </button>
      </div>

      {tab === "applications" && (
        <section className="glass" style={{ padding: 18 }}>
          <div className="row-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Affiliate Program Applications</h3>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {["PENDING", "APPROVED", "REJECTED", "ALL"].map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${appFilter === s ? "btn-gold" : "btn-ghost"}`}
                  onClick={() => {
                    setAppFilter(s);
                    loadApps(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {apps?.stats && (
            <div className="app-stats">
              <div className="app-stat">
                <span>Pending</span>
                <strong className="gold-text">{apps.stats.pending}</strong>
              </div>
              <div className="app-stat">
                <span>Approved</span>
                <strong className="up">{apps.stats.approved}</strong>
              </div>
              <div className="app-stat">
                <span>Rejected</span>
                <strong className="down">{apps.stats.rejected}</strong>
              </div>
              <div className="app-stat">
                <span>Total</span>
                <strong>{apps.stats.total}</strong>
              </div>
            </div>
          )}

          {!apps?.applications?.length && (
            <div className="empty">
              No {appFilter !== "ALL" ? appFilter.toLowerCase() + " " : ""}applications.
            </div>
          )}

          {apps?.applications?.map((app: any) => (
            <div key={app.id} className={`app-card ${expandedApp === app.id ? "expanded" : ""}`}>
              <div
                className="app-card-head"
                onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
              >
                <div>
                  <strong>{app.fullName}</strong>
                  <span className="dim">
                    {app.email} · {app.country}
                  </span>
                </div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span
                    className={`badge ${app.status === "APPROVED" ? "badge-up" : app.status === "REJECTED" ? "badge-down" : "badge-warn"}`}
                  >
                    {app.status}
                  </span>
                  <span className="dim" style={{ fontSize: 11 }}>
                    {fmtDate(app.createdAt)}
                  </span>
                  <span style={{ fontSize: 12 }}>{expandedApp === app.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {expandedApp === app.id && (
                <div className="app-card-body">
                  <div className="app-details-grid">
                    <div className="app-detail">
                      <label>Phone</label>
                      <span>{app.phone}</span>
                    </div>
                    <div className="app-detail">
                      <label>Platform</label>
                      <span>{app.platform}</span>
                    </div>
                    <div className="app-detail">
                      <label>Audience Size</label>
                      <span>{app.audienceSize || "Not specified"}</span>
                    </div>
                    <div className="app-detail">
                      <label>Experience</label>
                      <span>{app.experience}</span>
                    </div>
                  </div>
                  <div className="app-reason">
                    <label>Reason for Joining</label>
                    <p>{app.reason}</p>
                  </div>

                  {app.status === "PENDING" && (
                    <div className="app-actions">
                      <input
                        className="input"
                        placeholder="Add admin note (optional)..."
                        value={appNotes[app.id] || ""}
                        onChange={(e) => setAppNotes({ ...appNotes, [app.id]: e.target.value })}
                      />
                      <div className="row" style={{ gap: 8 }}>
                        <button
                          className="btn btn-up"
                          disabled={busyId === app.id}
                          onClick={() => decideApp(app.id, "APPROVED")}
                        >
                          ✓ Approve & Activate
                        </button>
                        <button
                          className="btn btn-down"
                          disabled={busyId === app.id}
                          onClick={() => decideApp(app.id, "REJECTED")}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {app.adminNote && (
                    <div className="app-admin-note">
                      <label>Admin Note</label>
                      <p>{app.adminNote}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {tab === "partners" && data && (
        <>
          <div className="grid-stats">
            <div className="glass aff-card">
              <span>Active Affiliates</span>
              <strong>{data.stats.totalAffiliates}</strong>
              <em>System default: {data.stats.defaultRate}% rate</em>
            </div>
            <div className="glass aff-card">
              <span>Commissions earned</span>
              <strong className="gold-text">{money(data.stats.totalCommissions)}</strong>
              <em>{data.stats.defaultRate}% default commission rate</em>
            </div>
            <div className="glass aff-card">
              <span>Pending Payout Requests</span>
              <strong className={data.stats.pendingPayoutCount > 0 ? "gold-text" : ""}>
                {data.stats.pendingPayoutCount}
              </strong>
              <em className="up mono">{money(data.stats.pendingPayoutAmount)} awaiting approval</em>
            </div>
          </div>

          <section className="glass" style={{ padding: 18, marginTop: 18 }}>
            <div className="row-between" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Affiliate Partners Directory</h3>
              <input
                className="input"
                style={{ maxWidth: 280 }}
                placeholder="Search partner…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Code</th>
                    <th>Referrals</th>
                    <th>Rate</th>
                    <th>Earned</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.partners.map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.fullName}</strong>
                        <div className="dim" style={{ fontSize: 11.5 }}>
                          {p.email}
                        </div>
                      </td>
                      <td className="mono gold-text">
                        <strong>{p.referralCode || "—"}</strong>
                      </td>
                      <td className="mono">{p.referralCount}</td>
                      <td className="mono">
                        <span className="badge badge-gold">{p.commissionRate}%</span>
                      </td>
                      <td className="mono">{money(p.totalEarned)}</td>
                      <td className="mono up">
                        <strong>{money(p.affiliateBalance)}</strong>
                      </td>
                      <td>
                        <span
                          className={`badge ${p.affiliateStatus === "ACTIVE" ? "badge-up" : "badge-down"}`}
                        >
                          {p.affiliateStatus}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => {
                            setEditingPartner(p);
                            setRateInput(String(p.commissionRate));
                            setStatusInput(p.affiliateStatus);
                          }}
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.partners.length && <div className="empty">No affiliate partners yet.</div>}
            </div>
          </section>
        </>
      )}

      {tab === "payouts" && data && (
        <section className="glass" style={{ padding: 18 }}>
          <div className="row-between" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Commission Payout Queue</h3>
            <span className="badge badge-gold">
              {data.payouts.filter((p: any) => p.status === "PENDING").length} PENDING
            </span>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Affiliate</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p: any) => (
                  <tr key={p.id}>
                    <td className="dim">{fmtDate(p.createdAt)}</td>
                    <td>
                      <strong>{p.fullName}</strong>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {p.email}
                      </div>
                    </td>
                    <td className="mono">
                      <strong>{money(p.amount)}</strong>
                    </td>
                    <td>
                      <span className="badge badge-gold">{p.method}</span>
                    </td>
                    <td
                      className="mono"
                      style={{
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.details}
                    </td>
                    <td>
                      <span
                        className={`badge ${p.status === "APPROVED" ? "badge-up" : p.status === "REJECTED" ? "badge-down" : "badge-warn"}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>
                      {p.status === "PENDING" ? (
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          <input
                            className="input"
                            style={{ width: 100, padding: "6px 10px", fontSize: 12 }}
                            placeholder="note"
                            value={payoutNotes[p.id] || ""}
                            onChange={(e) =>
                              setPayoutNotes({ ...payoutNotes, [p.id]: e.target.value })
                            }
                          />
                          <button
                            className="btn btn-sm btn-up"
                            disabled={busyId === p.id}
                            onClick={() => decidePayout(p.id, "APPROVED")}
                          >
                            ✓
                          </button>
                          <button
                            className="btn btn-sm btn-down"
                            disabled={busyId === p.id}
                            onClick={() => decidePayout(p.id, "REJECTED")}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span className="dim">{p.adminNote || "Done"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.payouts.length && <div className="empty">No payout requests.</div>}
          </div>
        </section>
      )}

      {editingPartner && (
        <div className="aff-modal-scrim" onClick={() => setEditingPartner(null)}>
          <div className="glass aff-modal-inner" onClick={(e) => e.stopPropagation()}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3>Configure: {editingPartner.fullName}</h3>
              <button className="btn btn-sm btn-ghost" onClick={() => setEditingPartner(null)}>
                ✕
              </button>
            </div>
            <p className="dim" style={{ fontSize: 12.5, marginBottom: 16 }}>
              Code: <strong className="gold-text">{editingPartner.referralCode}</strong> ·{" "}
              {editingPartner.email}
            </p>
            <div className="field">
              <label>Commission Rate (%)</label>
              <input
                className="input mono"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Status</label>
              <select
                className="select"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="LOCKED">LOCKED</option>
              </select>
            </div>
            <div className="row" style={{ gap: 10, marginTop: 18 }}>
              <button
                className="btn btn-gold btn-block"
                onClick={() => updatePartner(editingPartner.id)}
              >
                Save
              </button>
              <button className="btn btn-ghost" onClick={() => setEditingPartner(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
