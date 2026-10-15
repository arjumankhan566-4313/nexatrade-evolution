/**
 * AdminFinancePage — 1:1 port of legacy src/app/nexa-admin-portal/finance/page.jsx.
 * Admin finance hub: deposit/withdrawal queue, payment methods, gateway config.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useState } from "react";
import { api, money, fmtDate } from "@/tradeon-client/lib/apiClient";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";

export default function AdminFinancePage() {
  const [view, setView] = useState("queue");
  const [me, setMe] = useState<any>(null);
  const [status, setStatus] = useState("PENDING");
  const [rows, setRows] = useState<any[]>([]);
  const [methods, setMethods] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    api("/api/admin/overview")
      .then((d: any) => setMe(d.admin))
      .catch(() => {});
  }, []);
  const canApprove = me ? !["MODERATOR"].includes(me.role) : true;
  const canManage = me ? ["SUPER_ADMIN", "ADMIN", "EDITOR"].includes(me.role) : true;

  const loadQueue = useCallback(async (s: string) => {
    const d: any = await api(`/api/admin/transactions?status=${s}`);
    setRows(d.transactions);
  }, []);

  const loadMethods = useCallback(async () => {
    const d: any = await api("/api/admin/payments");
    setMethods(d.methods);
  }, []);

  useEffect(() => {
    if (view === "queue") {
      loadQueue(status).catch((e: any) =>
        alert.critical(e.message, { title: "Finance queue unavailable" }),
      );
      const t = setInterval(() => loadQueue(status).catch(() => {}), 12000);
      return () => clearInterval(t);
    }
    loadMethods().catch((e: any) =>
      alert.critical(e.message, { title: "Payment methods unavailable" }),
    );
    return undefined;
  }, [status, view, loadQueue, loadMethods]);

  useLiveEvents({
    scope: "admin",
    onEvent: useCallback(
      (ev: any) => {
        if (["finance", "payments", "balance"].includes(ev.topic)) {
          if (view === "queue") loadQueue(status).catch(() => {});
          else loadMethods().catch(() => {});
        }
      },
      [view, status, loadQueue, loadMethods],
    ),
  });

  const decide = async (id: string, decision: string) => {
    const r = rows.find((x) => x.id === id);
    const what = r
      ? `${money(r.amount)} ${r.type.toLowerCase()} for ${r.fullName || r.email || "this user"}`
      : "this request";
    const approving = decision === "APPROVED";
    const ok = await alert.confirm({
      severity: approving ? "warning" : "critical",
      title: approving ? "Approve and settle?" : "Reject this request?",
      message: approving
        ? `Approve ${what}. The balance is updated atomically and the user is notified immediately.`
        : `Reject ${what}${notes[id] ? ` — "${notes[id]}"` : ""}. ${r?.type === "WITHDRAWAL" ? "Its pending balance reservation is released; no funds are deducted." : "The user is notified immediately."}`,
      confirmLabel: approving ? "Approve & credit" : "Reject",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await api(`/api/admin/transactions/${id}`, {
        method: "PATCH",
        body: { decision, note: notes[id] || "" },
      });
      alert.success(`Request ${decision.toLowerCase()} — balance updated atomically.`);
      await loadQueue(status);
    } catch (err: any) {
      alert.critical(err.message, { title: "Decision NOT applied" });
    } finally {
      setBusyId(null);
    }
  };

  const saveMethod = async (payload: any, id: string | null) => {
    const ok = await alert.confirm({
      severity: "warning",
      title: id ? "Publish payment method changes?" : "Publish new payment method?",
      message: `${payload.name || "This rail"} ${id ? "changes" : "appears"} in every user's wallet immediately.`,
      confirmLabel: "Confirm & publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      if (id) await api(`/api/admin/payments/${id}`, { method: "PATCH", body: payload });
      else await api("/api/admin/payments", { method: "POST", body: payload });
      alert.success(id ? "Payment method updated and live." : "Payment method created and live.");
      setEditing(null);
      await loadMethods();
    } catch (err: any) {
      alert.critical(err.message, { title: "Payment method NOT saved" });
    }
  };

  const deleteMethod = async (id: string) => {
    const ok = await alert.confirm({
      severity: "critical",
      title: "Delete this payment method?",
      message:
        "It disappears from every wallet immediately. Pending requests that used it are unaffected.",
      confirmLabel: "Delete",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    try {
      await api(`/api/admin/payments/${id}`, { method: "DELETE" });
      alert.success("Payment method deleted.");
      await loadMethods();
    } catch (err: any) {
      alert.critical(err.message, { title: "Delete failed" });
    }
  };

  const toggleMethod = async (m: any) => {
    const hiding = m.isActive;
    const ok = await alert.confirm({
      severity: "warning",
      title: hiding ? `Hide ${m.name} from every wallet?` : `Show ${m.name} in every wallet?`,
      message: hiding
        ? `${m.name} stops appearing as a deposit/withdrawal option for every user immediately. Pending requests that already used it are unaffected.`
        : `${m.name} becomes available to every user's wallet immediately.`,
      confirmLabel: hiding ? "Hide & publish" : "Show & publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      await api(`/api/admin/payments/${m.id}`, {
        method: "PATCH",
        body: { isActive: !m.isActive },
      });
      alert.success(`${m.name} is now ${hiding ? "hidden from" : "visible in"} every wallet.`);
      await loadMethods();
    } catch (err: any) {
      alert.critical(err.message, { title: "Change NOT applied" });
    }
  };

  const totals = rows.reduce(
    (acc: any, r: any) => {
      if (r.type === "DEPOSIT") acc.deposits += r.amount;
      if (r.type === "WITHDRAWAL") acc.withdrawals += r.amount;
      return acc;
    },
    { deposits: 0, withdrawals: 0 },
  );

  return (
    <div className="admin-finance">
      <PageHeader
        eyebrow="Treasury"
        title="Finance &"
        highlight="Payments"
        subtitle="Deposits, withdrawals & gateway rails"
      />

      <div
        className="glass"
        style={{
          marginBottom: 16,
          borderColor: "rgba(243,186,47,.35)",
          background: "rgba(243,186,47,.06)",
          padding: 14,
        }}
      >
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong>Binance Pay Merchant</strong>
            <div className="dim" style={{ marginTop: 4 }}>
              Automatic deposits are callback-verified. Withdrawals remain pending until admin
              approval.
            </div>
          </div>
          <span className="badge badge-warn">Server configuration required</span>
        </div>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          className={`btn btn-sm ${view === "queue" ? "btn-gold" : "btn-ghost"}`}
          onClick={() => setView("queue")}
        >
          Finance queue
        </button>
        <button
          className={`btn btn-sm ${view === "methods" ? "btn-gold" : "btn-ghost"}`}
          onClick={() => setView("methods")}
        >
          Payment methods
        </button>
        <button
          className={`btn btn-sm ${view === "gateways" ? "btn-gold" : "btn-ghost"}`}
          onClick={() => setView("gateways")}
        >
          Gateways
        </button>
      </div>

      {view === "queue" && (
        <>
          <div className="row-between" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {["PENDING", "APPROVED", "REJECTED", "ALL"].map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm ${status === s ? "btn-gold" : "btn-ghost"}`}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 18, fontSize: 12.5 }}>
              <span className="dim">
                Deposits <strong className="up mono">{money(totals.deposits)}</strong>
              </span>
              <span className="dim">
                Withdrawals <strong className="down mono">{money(totals.withdrawals)}</strong>
              </span>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>TrxID / Ref</th>
                  <th>Sender</th>
                  <th>Proof</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t: any) => (
                  <tr key={t.id}>
                    <td className="dim">{fmtDate(t.createdAt)}</td>
                    <td>
                      <strong>{t.fullName}</strong>
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {t.email}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${t.type === "DEPOSIT" ? "badge-up" : "badge-down"}`}>
                        {t.type}
                      </span>
                      <div className="dim" style={{ fontSize: 10.5 }}>
                        {t.mode} · {t.kycStatus}
                      </div>
                    </td>
                    <td>{t.methodName || t.method}</td>
                    <td className="mono">
                      <strong>{money(t.amount)}</strong>
                    </td>
                    <td
                      className="mono"
                      style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {t.reference || "—"}
                    </td>
                    <td
                      className="mono"
                      style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {t.senderAccount || "—"}
                    </td>
                    <td>
                      {t.proofImage ? (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setProof(t.proofImage)}
                        >
                          View proof
                        </button>
                      ) : (
                        <span className="dim">none</span>
                      )}
                    </td>
                    <td className="mono">{money(t.userBalance)}</td>
                    <td>
                      <span
                        className={`badge ${t.status === "APPROVED" ? "badge-up" : t.status === "REJECTED" ? "badge-down" : "badge-warn"}`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td>
                      {t.status === "PENDING" ? (
                        t.type === "DEPOSIT" && t.mode === "AUTO" ? (
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <span className="dim" style={{ fontSize: 11 }}>
                              gateway-credit
                            </span>
                            <button
                              className="btn btn-sm btn-down"
                              disabled={busyId === t.id}
                              onClick={() => decide(t.id, "REJECTED")}
                              title="Reject (e.g. abandoned checkout)"
                            >
                              ✕
                            </button>
                          </div>
                        ) : canApprove ? (
                          <div className="row" style={{ gap: 6 }}>
                            <input
                              className="input"
                              style={{ width: 110, padding: "7px 10px", fontSize: 12 }}
                              placeholder="note"
                              value={notes[t.id] || ""}
                              onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })}
                            />
                            <button
                              className="btn btn-sm btn-up"
                              disabled={busyId === t.id}
                              onClick={() => decide(t.id, "APPROVED")}
                            >
                              ✓
                            </button>
                            <button
                              className="btn btn-sm btn-down"
                              disabled={busyId === t.id}
                              onClick={() => decide(t.id, "REJECTED")}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span className="dim">view-only</span>
                        )
                      ) : (
                        <span className="dim">{t.adminNote || "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="empty">Queue is empty.</div>}
          </div>
        </>
      )}

      {view === "methods" && (
        <PaymentMethods
          methods={methods}
          canManage={canManage}
          onSave={saveMethod}
          onDelete={deleteMethod}
          onToggle={toggleMethod}
          editing={editing}
          setEditing={setEditing}
        />
      )}

      {view === "gateways" && <GatewayConfig canManage={canManage} />}

      {proof && (
        <div className="proof-modal" onClick={() => setProof(null)}>
          <div className="proof-modal-inner" onClick={(e) => e.stopPropagation()}>
            <img src={proof} alt="Payment proof" />
            <button className="btn btn-sm btn-gold" onClick={() => setProof(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentMethods({
  methods,
  canManage,
  onSave,
  onDelete,
  onToggle,
  editing,
  setEditing,
}: any) {
  const empty = {
    kind: "CRYPTO",
    name: "",
    code: "USDT_TRC20",
    instructions: "",
    address: "",
    extra: "",
    qrData: "",
    isActive: true,
    sortOrder: 0,
  };
  const [form, setForm] = useState<any>(empty);

  useEffect(() => {
    if (editing) {
      const m = methods.find((x: any) => x.id === editing);
      if (m)
        setForm({
          kind: m.kind,
          name: m.name,
          code: m.code,
          instructions: m.instructions,
          address: m.address,
          extra: m.extra,
          qrData: m.qrData || "",
          isActive: m.isActive,
          sortOrder: m.sortOrder || 0,
        });
    } else {
      setForm(empty);
    }
  }, [editing, methods]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div>
      {canManage && (
        <section className="glass" style={{ padding: 18, marginBottom: 18 }}>
          <h4 style={{ margin: "0 0 12px" }}>
            {editing ? "Edit payment method" : "Add payment method"}
          </h4>
          <div className="m-grid">
            <div className="field">
              <label>Kind</label>
              <select
                className="select"
                value={form.kind}
                onChange={(e) => set("kind", e.target.value)}
              >
                <option value="CRYPTO">Crypto</option>
                <option value="LOCAL">Local rails (bKash/Nagad)</option>
                <option value="BANK">Bank</option>
                <option value="AUTO">Automatic gateway</option>
              </select>
            </div>
            <div className="field">
              <label>Code</label>
              <select
                className="select"
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                disabled={!!editing}
              >
                {[
                  "USDT_TRC20",
                  "USDT_ERC20",
                  "BITCOIN",
                  "ETHEREUM",
                  "BKASH",
                  "NAGAD",
                  "ROCKET",
                  "BANK_TRANSFER",
                  "CARD",
                ].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Display name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. USDT · TRON (TRC-20)"
              />
            </div>
            <div className="field">
              <label>{form.kind === "CRYPTO" ? "Wallet address" : "Account / number"}</label>
              <input
                className="input mono"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="TXYZ… / 01XXXXXXXXX"
              />
            </div>
            <div className="field">
              <label>Extra (network / branch / note)</label>
              <input
                className="input"
                value={form.extra}
                onChange={(e) => set("extra", e.target.value)}
              />
            </div>
            <div className="field">
              <label>QR payload (optional)</label>
              <input
                className="input mono"
                value={form.qrData}
                onChange={(e) => set("qrData", e.target.value)}
              />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Instructions shown to the user</label>
              <textarea
                className="input"
                rows={2}
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
              />
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm btn-gold" onClick={() => onSave(form, editing)}>
              {editing ? "Save changes" : "Create method"}
            </button>
            {editing && (
              <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
            )}
          </div>
        </section>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Name</th>
              <th>Code</th>
              <th>Address / Number</th>
              <th>Status</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {methods.map((m: any) => (
              <tr key={m.id}>
                <td>
                  <span className="badge">{m.kind}</span>
                </td>
                <td>
                  <strong>{m.name}</strong>
                </td>
                <td className="mono">{m.code}</td>
                <td
                  className="mono"
                  style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {m.address || "—"}
                </td>
                <td>
                  <span className={`badge ${m.isActive ? "badge-up" : "badge-down"}`}>
                    {m.isActive ? "ACTIVE" : "DISABLED"}
                  </span>
                </td>
                {canManage && (
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(m.id)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => onToggle(m)}>
                        {m.isActive ? "Disable" : "Enable"}
                      </button>
                      <button className="btn btn-sm btn-down" onClick={() => onDelete(m.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!methods.length && <div className="empty">No payment methods configured.</div>}
      </div>
    </div>
  );
}

function GatewayConfig({ canManage }: any) {
  const [providers, setProviders] = useState<any[]>([]);
  const [nowp, setNowp] = useState<any>(null);
  const [checkout, setCheckout] = useState<any>(null);
  const [control, setControl] = useState<any>({ autoDeposits: true, demo: true });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    code: "",
    type: "CRYPTO_AUTO",
    apiKey: "",
    apiSecret: "",
    webhookSecret: "",
    walletAddress: "",
    network: "",
    minAmount: 10,
    maxAmount: 100000,
    fee: 0,
    autoCredit: true,
    instructions: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gw, st] = await Promise.all([api("/api/admin/gateway"), api("/api/admin/settings")]);
      setProviders(gw.providers || []);
      setNowp(gw.nowpayments);
      setCheckout(gw.checkout);
      setControl({
        autoDeposits: st.settings.auto_deposits_enabled !== false,
        demo: st.settings.demo_gateway_enabled !== false,
      });
    } catch (err: any) {
      alert.critical(err.message, { title: "Gateway config unavailable" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveControl = async (key: string, value: boolean, label: string) => {
    const turningOff = !value;
    const ok = await alert.confirm({
      severity: turningOff ? "critical" : "warning",
      title: turningOff ? `Turn ${label} OFF for the whole site?` : `Turn ${label} ON?`,
      message: turningOff
        ? `"${label}" is disabled site-wide immediately — no new Automatic deposits can start. Manual deposits are not affected. You can switch it back on here any time.`
        : `"${label}" becomes available in every user's wallet immediately.`,
      confirmLabel: turningOff ? "Turn OFF & publish" : "Turn ON & publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d: any = await api("/api/admin/settings", { method: "PATCH", body: { [key]: value } });
      setControl({
        autoDeposits: d.settings.auto_deposits_enabled !== false,
        demo: d.settings.demo_gateway_enabled !== false,
      });
      alert.success(
        `${label} ${turningOff ? "turned OFF" : "turned ON"} — applied to the whole site now.`,
      );
      await load();
    } catch (err: any) {
      alert.critical(err.message, { title: `${label} was NOT changed` });
    }
    setBusy(false);
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    const ok = await alert.confirm({
      severity: "warning",
      title: "Add this gateway provider?",
      message: `${form.name || form.code || "The provider"} becomes an available payment rail for ALL users immediately.`,
      confirmLabel: "Confirm & publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api("/api/admin/gateway", { method: "POST", body: form });
      alert.success("Gateway provider added and live.");
      setShowForm(false);
      setForm({
        name: "",
        code: "",
        type: "CRYPTO_AUTO",
        apiKey: "",
        apiSecret: "",
        webhookSecret: "",
        walletAddress: "",
        network: "",
        minAmount: 10,
        maxAmount: 100000,
        fee: 0,
        autoCredit: true,
        instructions: "",
      });
      await load();
    } catch (err: any) {
      alert.critical(err.message, { title: "Provider NOT added" });
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    const ok = await alert.confirm({
      severity: "critical",
      title: "Remove this gateway provider?",
      message: "Users can no longer deposit through it. Keys stored for it are deleted.",
      confirmLabel: "Remove provider",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    try {
      await api(`/api/admin/gateway?id=${id}`, { method: "DELETE" });
      alert.success("Provider removed.");
      await load();
    } catch (err: any) {
      alert.critical(err.message, { title: "Remove failed" });
    }
  };

  const toggle = async (p: any) => {
    const ok = await alert.confirm({
      severity: "warning",
      title: p.enabled ? `Disable ${p.name}?` : `Enable ${p.name}?`,
      message: p.enabled
        ? "This rail disappears from every wallet immediately."
        : "This rail becomes available to every user immediately.",
      confirmLabel: p.enabled ? "Disable" : "Enable",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    try {
      await api("/api/admin/gateway", {
        method: "PATCH",
        body: { providerId: p.id, enabled: !p.enabled },
      });
      alert.success(`${p.name} ${p.enabled ? "disabled" : "enabled"} for all users.`);
      await load();
    } catch (err: any) {
      alert.critical(err.message, { title: "Change NOT applied" });
    }
  };

  return (
    <div>
      <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
          <h4 style={{ margin: 0 }}>🎛 Automatic deposits — runtime control</h4>
          <span
            className={`badge ${checkout?.demo ? "badge-gold" : checkout?.enabled ? "badge-up" : "badge-down"}`}
          >
            {checkout?.demo
              ? "DEMO CHECKOUT ACTIVE"
              : checkout?.enabled
                ? "LIVE GATEWAY ACTIVE"
                : "OFF — MANUAL ONLY"}
          </span>
        </div>
        <p className="dim" style={{ fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.6 }}>
          Decide from here which automatic path runs across the whole site — applied immediately, no
          redeploy needed. The <strong>live</strong> gateway only runs when a real{" "}
          <code className="mono">NOWPAYMENTS_API_KEY</code> exists on the server; the{" "}
          <strong>demo</strong> checkout (in-app simulated payment) only runs when no live key
          exists. The demo can
          <strong> never</strong> run at the same time as a live key — that rule is enforced
          server-side and cannot be bypassed here.
        </p>

        <div className="gw-ctrl">
          <div className="gw-ctrl-row">
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="gw-ctrl-title">
                ⚡ Automatic deposits (the "Automatic" wallet tab)
              </div>
              <div className="dim" style={{ fontSize: 12, lineHeight: 1.55 }}>
                Master switch for the whole Automatic deposit feature —{" "}
                <strong>live and demo together</strong>. OFF ⇒ the Automatic tab is disabled on the
                whole site (users see "disabled by the administrator"); only Manual deposits remain.
                Deposit discipline is unchanged either way: nothing is ever credited without a real,
                confirmed payment.
              </div>
            </div>
            {canManage ? (
              <Toggle
                checked={control.autoDeposits}
                onChange={(v: boolean) =>
                  saveControl("auto_deposits_enabled", v, "Automatic deposits")
                }
                label={control.autoDeposits ? "ON — allowed" : "OFF — disabled"}
                danger={!control.autoDeposits}
                disabled={busy}
              />
            ) : (
              <span className={`badge ${control.autoDeposits ? "badge-up" : "badge-down"}`}>
                {control.autoDeposits ? "ON" : "OFF"}
              </span>
            )}
          </div>

          <div className="gw-ctrl-row">
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="gw-ctrl-title">
                🧪 Demo checkout (in-app NexaPay simulated payment)
              </div>
              <div className="dim" style={{ fontSize: 12, lineHeight: 1.55 }}>
                The preview/staging payment path (no live key on the server). OFF ⇒ the demo
                checkout is disabled on the whole site.{" "}
                {nowp?.enabled ? (
                  <strong style={{ color: "var(--down)" }}>
                    LOCKED OFF — a live NOWPayments key is configured, so the demo can never run.
                  </strong>
                ) : (
                  "Turned on, it lets users complete a clearly-marked simulated charge before the deposit is auto-approved."
                )}
              </div>
            </div>
            {nowp?.enabled ? (
              <span className="badge badge-down">LOCKED OFF</span>
            ) : canManage ? (
              <Toggle
                checked={control.demo}
                onChange={(v: boolean) => saveControl("demo_gateway_enabled", v, "Demo checkout")}
                label={control.demo ? "ON — allowed" : "OFF — disabled"}
                danger={!control.demo}
                disabled={busy}
              />
            ) : (
              <span className={`badge ${control.demo ? "badge-up" : "badge-down"}`}>
                {control.demo ? "ON" : "OFF"}
              </span>
            )}
          </div>
        </div>

        <div className="gw-status-grid" style={{ marginTop: 14 }}>
          <div className="gw-status-item">
            <span>Live NOWPayments key</span>
            <strong className={nowp?.enabled ? "up" : "dim"}>
              {nowp?.enabled ? "✓ PRESENT" : "— none (demo allowed)"}
            </strong>
          </div>
          <div className="gw-status-item">
            <span>AUTO master switch</span>
            <strong className={control.autoDeposits ? "up" : "down"}>
              {control.autoDeposits ? "ON" : "OFF (whole site)"}
            </strong>
          </div>
          <div className="gw-status-item">
            <span>Demo checkout</span>
            <strong className={nowp?.enabled ? "dim" : control.demo ? "up" : "down"}>
              {nowp?.enabled ? "LOCKED (live key)" : control.demo ? "ON" : "OFF"}
            </strong>
          </div>
        </div>
      </section>

      <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>⚡ NOWPayments Auto-Deposit Gateway</h4>
          <span className={`badge ${nowp?.configured ? "badge-up" : "badge-warn"}`}>
            {nowp?.configured ? "CONFIGURED" : nowp?.enabled ? "PARTIAL" : "NOT CONFIGURED"}
          </span>
        </div>
        <p className="dim" style={{ fontSize: 13, margin: "0 0 12px", lineHeight: 1.6 }}>
          NOWPayments handles automatic crypto deposits. When enabled, users pay via a hosted
          invoice, and the balance is credited automatically upon blockchain confirmation.{" "}
          <strong>Webhook signature verification</strong> (HMAC-SHA512) prevents fake deposits.
        </p>
        <div className="gw-status-grid">
          <div className="gw-status-item">
            <span>API Key</span>
            <strong className={nowp?.enabled ? "up" : "down"}>
              {nowp?.enabled ? "✓ Set" : "✕ Missing"}
            </strong>
          </div>
          <div className="gw-status-item">
            <span>IPN Secret</span>
            <strong className={nowp?.configured ? "up" : "down"}>
              {nowp?.configured ? "✓ Set" : "✕ Missing"}
            </strong>
          </div>
          <div className="gw-status-item">
            <span>Security</span>
            <strong className="up">HMAC-SHA512</strong>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>
          Configure via environment variables: <code className="mono">NOWPAYMENTS_API_KEY</code> and{" "}
          <code className="mono">NOWPAYMENTS_IPN_SECRET</code>
        </p>
      </section>

      <section className="glass" style={{ padding: 18 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h4 style={{ margin: 0 }}>Custom Gateway Providers</h4>
          {canManage && (
            <button className="btn btn-sm btn-gold" onClick={() => setShowForm((v: boolean) => !v)}>
              {showForm ? "✕ Cancel" : "+ Add Provider"}
            </button>
          )}
        </div>

        {showForm && canManage && (
          <div className="gw-form">
            <div className="gw-form-grid">
              <div className="field">
                <label>Provider Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. CoinGate"
                />
              </div>
              <div className="field">
                <label>Code</label>
                <input
                  className="input mono"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value.toUpperCase())}
                  placeholder="COINGATE"
                />
              </div>
              <div className="field">
                <label>Type</label>
                <select
                  className="select"
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  <option value="CRYPTO_AUTO">Crypto (Auto-deposit)</option>
                  <option value="CRYPTO_MANUAL">Crypto (Manual review)</option>
                  <option value="LOCAL">Local Payment</option>
                  <option value="BANK">Bank Transfer</option>
                </select>
              </div>
              <div className="field">
                <label>Network</label>
                <input
                  className="input"
                  value={form.network}
                  onChange={(e) => set("network", e.target.value)}
                  placeholder="TRC-20, ERC-20, BTC..."
                />
              </div>
              <div className="field">
                <label>API Key</label>
                <input
                  className="input mono"
                  value={form.apiKey}
                  onChange={(e) => set("apiKey", e.target.value)}
                  placeholder="sk_..."
                />
              </div>
              <div className="field">
                <label>API Secret</label>
                <input
                  className="input mono"
                  value={form.apiSecret}
                  onChange={(e) => set("apiSecret", e.target.value)}
                  placeholder="secret..."
                />
              </div>
              <div className="field">
                <label>Webhook Secret</label>
                <input
                  className="input mono"
                  value={form.webhookSecret}
                  onChange={(e) => set("webhookSecret", e.target.value)}
                  placeholder="For signature verification"
                />
              </div>
              <div className="field">
                <label>Wallet Address</label>
                <input
                  className="input mono"
                  value={form.walletAddress}
                  onChange={(e) => set("walletAddress", e.target.value)}
                  placeholder="TXYZ..."
                />
              </div>
              <div className="field">
                <label>Min Amount ($)</label>
                <input
                  className="input mono"
                  type="number"
                  value={form.minAmount}
                  onChange={(e) => set("minAmount", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Max Amount ($)</label>
                <input
                  className="input mono"
                  type="number"
                  value={form.maxAmount}
                  onChange={(e) => set("maxAmount", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Fee (%)</label>
                <input
                  className="input mono"
                  type="number"
                  step="0.1"
                  value={form.fee}
                  onChange={(e) => set("fee", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>
                  <input
                    type="checkbox"
                    checked={form.autoCredit}
                    onChange={(e) => set("autoCredit", e.target.checked)}
                  />{" "}
                  Auto-credit on confirmation
                </label>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Instructions (shown to user)</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.instructions}
                  onChange={(e) => set("instructions", e.target.value)}
                />
              </div>
            </div>
            <button className="btn btn-gold" disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Add Provider"}
            </button>
          </div>
        )}

        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Type</th>
                <th>Network</th>
                <th>Auto-credit</th>
                <th>Fee</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {providers.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="dim" style={{ fontSize: 11 }}>
                      {p.code}
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-gold">{p.type}</span>
                  </td>
                  <td className="mono">{p.network || "—"}</td>
                  <td>
                    {p.autoCredit ? (
                      <span className="up">✓ Yes</span>
                    ) : (
                      <span className="dim">✕ No</span>
                    )}
                  </td>
                  <td className="mono">{p.fee}%</td>
                  <td>
                    <span className={`badge ${p.enabled ? "badge-up" : "badge-down"}`}>
                      {p.enabled ? "ACTIVE" : "DISABLED"}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => toggle(p)}>
                          {p.enabled ? "Disable" : "Enable"}
                        </button>
                        <button className="btn btn-sm btn-down" onClick={() => remove(p.id)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!providers.length && (
            <div className="empty">
              No custom gateway providers configured. Only NOWPayments auto-deposit is active.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Toggle({ checked, onChange, label, danger, disabled }: any) {
  return (
    <label
      className={`tg ${checked ? "on" : ""} ${danger ? "danger" : ""} ${disabled ? "is-off" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        hidden
        disabled={disabled}
      />
      <span className="tg-track">
        <i />
      </span>
      <span className="tg-lbl">{label}</span>
    </label>
  );
}
