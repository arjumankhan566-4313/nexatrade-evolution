/**
 * AdminUsersPage — 1:1 port of legacy src/app/nexa-admin-portal/users/page.jsx.
 * User management: accounts, roles & trading behaviour with drawer panel.
 * Enhanced with trade history, win/loss analytics and 3D card effects.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, money, fmtDate, timeAgo } from "@/tradeon-client/lib/apiClient";
import { alert } from "@/tradeon-client/lib/useAlertStore";
import PageHeader from "@/tradeon-client/components/admin/PageHeader";

function describeSignificant(user: any, body: any) {
  if (body.balanceAdjust) {
    const a = body.balanceAdjust;
    const sign = a.amount >= 0 ? "+" : "-";
    return {
      severity: "warning",
      title: "Confirm balance adjustment",
      message: `${sign}${money(Math.abs(a.amount))} on ${user.fullName}'s ${a.account} balance${a.note ? ` — "${a.note}"` : ""}. This is credited/debited immediately.`,
      confirmLabel: "Apply adjustment",
    };
  }
  if (body.isBlocked === true) {
    return {
      severity: "critical",
      title: `Block ${user.fullName}?`,
      message:
        "The account is signed out everywhere immediately and cannot log in until unblocked.",
      confirmLabel: "Block account",
    };
  }
  if (body.revokeSessions) {
    return {
      severity: "warning",
      title: "Revoke all sessions?",
      message: `${user.fullName} is signed out on every device right now and must log in again.`,
      confirmLabel: "Revoke sessions",
    };
  }
  if (body.role) {
    return {
      severity: body.role === "USER" ? "warning" : "critical",
      title: `Change role to ${body.role.replace("_", " ")}?`,
      message:
        body.role === "USER"
          ? `${user.fullName} loses all admin-portal access immediately.`
          : `${user.fullName} gains ${body.role.replace("_", " ")} access to the control center immediately.`,
      confirmLabel: "Change role",
    };
  }
  if (body.kycStatus) {
    return {
      severity: "warning",
      title: `Set KYC to ${body.kycStatus.replace("_", " ")}?`,
      message:
        body.kycStatus === "VERIFIED"
          ? `${user.fullName} unlocks real-money trading and withdrawals immediately.`
          : `${user.fullName}'s real-money trading/withdrawal rights change immediately.`,
      confirmLabel: "Apply",
    };
  }
  return null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async (query = "") => {
    const d: any = await api(`/api/admin/users?q=${encodeURIComponent(query)}`);
    setUsers(d.users);
  }, []);

  useEffect(() => {
    load().catch((e: any) => alert.critical(e.message, { title: "Users unavailable" }));
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(q).catch(() => {}), 320);
    return () => clearTimeout(t);
  }, [q, load]);

  const patch = async (id: string, body: any, label: string) => {
    const target = users.find((u) => u.id === id) || selected || { fullName: "this account" };
    const significant = describeSignificant(target, body);
    if (significant) {
      const ok = await alert.confirm({ ...significant, cancelLabel: "Cancel" });
      if (!ok) return false;
    }
    try {
      const res: any = await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      const updated = res.user;
      alert.success(`${label} applied.`);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
      setSelected((s: any) => (s && s.id === id ? { ...s, ...updated } : s));
      return true;
    } catch (err: any) {
      alert.critical(err.message, { title: `${label} failed` });
      return false;
    }
  };

  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    api("/api/admin/overview")
      .then((d: any) => setMe(d.admin))
      .catch(() => {});
  }, []);
  const canAssignRoles = me?.role === "SUPER_ADMIN";
  const isProtected = (u: any) =>
    u.role === "SUPER_ADMIN" || u.email === "arjumankhan181@gmail.com";

  const assignRole = (id: string, role: string) => patch(id, { role }, `Role changed to ${role}`);

  return (
    <div className="admin-users">
      <PageHeader
        eyebrow="Access control"
        title="User"
        highlight="Management"
        subtitle="Accounts, roles & trading behaviour"
      />

      <div className="row-between" style={{ marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="dim" style={{ fontSize: 12.5 }}>
          {users.length} accounts
        </span>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Country</th>
              <th>KYC</th>
              <th>Real</th>
              <th>Demo</th>
              <th>Trades</th>
              <th>Win rate</th>
              <th>Risk override</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.fullName}</strong>
                  <div className="dim" style={{ fontSize: 11.5 }}>
                    {u.email}
                  </div>
                </td>
                <td>
                  {u.role === "SUPER_ADMIN" ? (
                    <span className="badge badge-gold">Super Admin</span>
                  ) : u.role === "ADMIN" ? (
                    <span className="badge badge-info">Admin</span>
                  ) : u.role === "EDITOR" ? (
                    <span className="badge badge-warn">Editor</span>
                  ) : u.role === "MODERATOR" ? (
                    <span className="badge">Moderator</span>
                  ) : (
                    <span className="dim">Trader</span>
                  )}
                </td>
                <td>{u.country || "—"}</td>
                <td>
                  <span
                    className={`badge ${u.kycStatus === "VERIFIED" ? "badge-up" : u.kycStatus === "REJECTED" ? "badge-down" : "badge-warn"}`}
                  >
                    {u.kycStatus}
                  </span>
                </td>
                <td className="mono">{money(u.balanceReal)}</td>
                <td className="mono">{money(u.balanceDemo)}</td>
                <td>{u.tradeCount}</td>
                <td className="mono">{u.winRate}%</td>
                <td>
                  {u.forceLossUser ? (
                    <span className="badge badge-down">FORCE LOSS</span>
                  ) : u.customYieldRatio != null ? (
                    <span className="badge badge-gold">{u.customYieldRatio}%</span>
                  ) : (
                    <span className="dim">global</span>
                  )}
                </td>
                <td>
                  {u.isBlocked ? (
                    <span className="badge badge-down">Blocked</span>
                  ) : (
                    <span className="badge badge-up">Active</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => setSelected(u)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <div className="empty">No accounts found.</div>}
      </div>

      <AnimatePresence>
        {selected && (
          <UserDrawer
            user={selected}
            onClose={() => setSelected(null)}
            onPatch={patch}
            onAssignRole={assignRole}
            canAssignRoles={canAssignRoles}
            protectedAccount={isProtected(selected)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const ROLE_OPTIONS = ["USER", "MODERATOR", "EDITOR", "ADMIN", "SUPER_ADMIN"];
const ROLE_NAMES: Record<string, string> = {
  USER: "Trader",
  MODERATOR: "Moderator",
  EDITOR: "Editor",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

function UserDrawer({
  user,
  onClose,
  onPatch,
  onAssignRole,
  canAssignRoles,
  protectedAccount,
}: any) {
  const [adjust, setAdjust] = useState({ amount: "", account: "REAL", note: "" });
  const [yieldVal, setYieldVal] = useState<string>(
    user.customYieldRatio != null ? String(user.customYieldRatio) : "",
  );
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch full user detail with trade history
  useEffect(() => {
    if (!user?.id) return;
    setLoadingDetail(true);
    api(`/api/admin/users/${user.id}`)
      .then((d: any) => setDetail(d))
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [user?.id]);

  const tradeStats = detail?.trades;
  const recentTrades = detail?.recentTrades || [];
  const winRate = tradeStats?.total
    ? Math.round((tradeStats.wins / tradeStats.total) * 1000) / 10
    : 0;

  return (
    <>
      <motion.div
        className="user-drawer-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="drawer glass user-drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
      >
        <div className="row-between" style={{ marginBottom: 6 }}>
          <h3>{user.fullName}</h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="dim" style={{ fontSize: 12.5, margin: "0 0 16px" }}>
          {user.email} · joined {fmtDate(user.createdAt)}
        </p>

        {/* 3D Stats Cards */}
        <div className="ud-mini">
          <motion.div
            whileHover={{ rotateY: 6, scale: 1.03 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div>
              <span>Real</span>
              <strong className="mono">{money(user.balanceReal)}</strong>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ rotateY: 6, scale: 1.03 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div>
              <span>Demo</span>
              <strong className="mono">{money(user.balanceDemo)}</strong>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ rotateY: 6, scale: 1.03 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div>
              <span>Win rate</span>
              <strong className="mono">{winRate}%</strong>
            </div>
          </motion.div>
          <motion.div
            whileHover={{ rotateY: 6, scale: 1.03 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div>
              <span>Net P/L</span>
              <strong className={`mono ${(tradeStats?.pnl ?? user.pnl) >= 0 ? "up" : "down"}`}>
                {money(tradeStats?.pnl ?? user.pnl)}
              </strong>
            </div>
          </motion.div>
        </div>

        {/* Trade analytics bar */}
        {tradeStats && (
          <div className="ud-analytics-bar">
            <div className="ud-ab-item">
              <span className="ud-ab-val">{tradeStats.total}</span>
              <span className="ud-ab-lbl">Total</span>
            </div>
            <div className="ud-ab-item up">
              <span className="ud-ab-val">{tradeStats.wins}</span>
              <span className="ud-ab-lbl">Wins</span>
            </div>
            <div className="ud-ab-item down">
              <span className="ud-ab-val">{tradeStats.losses}</span>
              <span className="ud-ab-lbl">Losses</span>
            </div>
            <div className="ud-ab-item">
              <span className="ud-ab-val">{winRate}%</span>
              <span className="ud-ab-lbl">Win rate</span>
            </div>
          </div>
        )}

        {protectedAccount && (
          <div className="alert alert-info" style={{ marginBottom: 14 }}>
            This is the protected <strong>Super Admin owner</strong> account. It cannot be deleted,
            demoted, blocked or have its sessions revoked by any role.
          </div>
        )}

        <div className="ud-block">
          <h4>Role & access (RBAC)</h4>
          <p className="dim ud-small">
            Super Admin · Admin · Editor · Moderator · Trader. Roles inherit weaker permissions.
          </p>
          {canAssignRoles && !protectedAccount ? (
            <select
              className="select"
              style={{ maxWidth: 240 }}
              value={user.role || "USER"}
              onChange={(e) => onAssignRole(user.id, e.target.value)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_NAMES[r]}
                </option>
              ))}
            </select>
          ) : (
            <span className={`badge ${user.role === "SUPER_ADMIN" ? "badge-gold" : ""}`}>
              {ROLE_NAMES[user.role] || "Trader"}
            </span>
          )}
        </div>

        <div className="ud-block">
          <h4>Balance adjustment</h4>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select
              className="select"
              style={{ width: 110 }}
              value={adjust.account}
              onChange={(e) => setAdjust({ ...adjust, account: e.target.value })}
            >
              <option value="REAL">Real</option>
              <option value="DEMO">Demo</option>
            </select>
            <input
              className="input mono"
              style={{ width: 120 }}
              type="number"
              step="0.01"
              placeholder="±0.00"
              value={adjust.amount}
              onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })}
            />
            <input
              className="input"
              style={{ flex: 1, minWidth: 140 }}
              placeholder="Note (optional)"
              value={adjust.note}
              onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
            />
          </div>
          <button
            className="btn btn-sm btn-gold"
            style={{ marginTop: 10 }}
            disabled={!Number(adjust.amount)}
            onClick={async () => {
              const ok = await onPatch(
                user.id,
                { balanceAdjust: { ...adjust, amount: Number(adjust.amount) } },
                "Balance adjustment",
              );
              if (ok) setAdjust({ ...adjust, amount: "", note: "" });
            }}
          >
            Apply adjustment
          </button>
        </div>

        <div className="ud-block">
          <h4>Trading risk override</h4>
          <p className="dim ud-small">
            Control this trader's individual win rate and settlement outcome. Leave yield empty to
            use the global setting.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
              Custom win rate %
            </label>
            <input
              className="input mono"
              type="number"
              min={0}
              max={100}
              step={1}
              style={{ width: 90 }}
              placeholder="global"
              value={yieldVal}
              onChange={(e) => setYieldVal(e.target.value)}
            />
            <button
              className="btn btn-sm btn-gold"
              disabled={protectedAccount}
              onClick={async () => {
                const val = yieldVal === "" ? null : Number(yieldVal);
                const ok = await onPatch(user.id, { customYieldRatio: val }, "Yield override");
                if (ok && val === null) setYieldVal("");
              }}
            >
              Save
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={protectedAccount || yieldVal === ""}
              onClick={() => {
                setYieldVal("");
                onPatch(user.id, { customYieldRatio: null }, "Yield reset to global");
              }}
            >
              Reset
            </button>
          </div>
          <div
            className="row"
            style={{ gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}
          >
            <label style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
              Force every trade to LOSS
            </label>
            <button
              className={`btn btn-sm ${user.forceLossUser ? "btn-up" : "btn-down"}`}
              disabled={protectedAccount}
              onClick={() =>
                onPatch(
                  user.id,
                  { forceLossUser: !user.forceLossUser },
                  user.forceLossUser ? "Force-loss cleared" : "Force-loss enabled",
                )
              }
            >
              {user.forceLossUser ? "Force-loss ACTIVE — click to clear" : "Enable force-loss"}
            </button>
          </div>
          {user.customYieldRatio !== null && user.customYieldRatio !== undefined && (
            <p className="dim ud-small" style={{ marginTop: 8 }}>
              Current override:{" "}
              <strong style={{ color: "#F0B90B" }}>{user.customYieldRatio}%</strong>
            </p>
          )}
        </div>

        {/* Recent trades history */}
        <div className="ud-block">
          <h4>Recent trade history</h4>
          {loadingDetail ? (
            <p className="dim ud-small">Loading trades…</p>
          ) : recentTrades.length === 0 ? (
            <p className="dim ud-small">No trades yet.</p>
          ) : (
            <div className="ud-trades-scroll">
              <table className="data ud-trades-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Dir</th>
                    <th>Stake</th>
                    <th>Status</th>
                    <th>P/L</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((t: any) => (
                    <tr key={t.id}>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {t.symbol}
                      </td>
                      <td>
                        <span
                          className={`badge ${t.direction === "CALL" ? "badge-up" : "badge-down"}`}
                          style={{ fontSize: 10, padding: "2px 6px" }}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>
                        {money(t.stake)}
                      </td>
                      <td>
                        <span
                          className={`badge ${t.status === "WON" ? "badge-up" : t.status === "LOST" ? "badge-down" : "badge-warn"}`}
                          style={{ fontSize: 10, padding: "2px 6px" }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td
                        className={`mono ${t.profit >= 0 ? "up" : "down"}`}
                        style={{ fontSize: 11.5 }}
                      >
                        {t.profit >= 0 ? "+" : ""}
                        {money(t.profit)}
                      </td>
                      <td className="dim" style={{ fontSize: 10.5 }}>
                        {timeAgo(t.expiredAt || t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ud-block">
          <h4>Account controls</h4>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn btn-sm ${user.isBlocked ? "btn-up" : "btn-down"}`}
              disabled={protectedAccount}
              onClick={() =>
                onPatch(
                  user.id,
                  { isBlocked: !user.isBlocked },
                  user.isBlocked ? "Account unblocked" : "Account blocked",
                )
              }
            >
              {user.isBlocked ? "Unblock account" : "Block account"}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              disabled={protectedAccount}
              onClick={() => onPatch(user.id, { revokeSessions: true }, "Sessions revoked")}
            >
              Revoke sessions
            </button>
            <select
              className="select"
              style={{ width: 160 }}
              value={user.kycStatus}
              disabled={protectedAccount && user.kycStatus === "VERIFIED"}
              onChange={(e) => onPatch(user.id, { kycStatus: e.target.value }, "KYC status")}
            >
              {["NONE", "PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {protectedAccount && (
            <p className="dim ud-small" style={{ marginTop: 8 }}>
              Destructive controls are disabled for the owner account.
            </p>
          )}
        </div>
      </motion.aside>
    </>
  );
}
