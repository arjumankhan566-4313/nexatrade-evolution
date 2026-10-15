/**
 * AdminPage — 1:1 port of legacy/public/js/views/admin.js
 * Tabs: Overview, Promos, Affiliates, Support, Users, KYC, Transactions, Assets, Gateways, Risk Engine.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@/tradeon-client/compat/react-router-dom";
import {
  legacyApi,
  fmtMoney,
  fmtPrice,
  timeAgo,
  badgeClass,
  initials,
  lpToast,
} from "../../lib/legacy";
import { openLegacyModal, closeLegacyModal } from "../../components/LegacyModal";
import "../../styles/legacy-pages.css";

const TABS: [string, string, string][] = [
  ["overview", "📊", "Overview"],
  ["promos", "🎁", "Promo Codes"],
  ["affiliates", "🤝", "Affiliates"],
  ["support", "🎧", "Support"],
  ["users", "👥", "Users"],
  ["kyc", "🪪", "KYC Review"],
  ["transactions", "💰", "Transactions"],
  ["assets", "📈", "Markets"],
  ["gateways", "🏦", "Gateways"],
  ["settings", "🛡️", "Risk Engine"],
];

function errBox(e: any) {
  return (
    <div className="page">
      <div className="card card-pad">Failed to load: {e.message}</div>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="legacy-page" style={{ height: "100%", overflow: "hidden" }}>
      <div className="admin-shell">
        <aside className="admin-side">
          <div className="as-label">Administration</div>
          {TABS.map(([id, ic, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {ic} {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate("/dashboard")}>📈 Back to Terminal</button>
        </aside>
        <main className="admin-main">
          {tab === "overview" && (
            <OverviewTab key={refreshKey} onRefresh={() => setRefreshKey((k) => k + 1)} />
          )}
          {tab === "promos" && <PromosTab key={refreshKey} />}
          {tab === "affiliates" && <AffiliatesTab key={refreshKey} />}
          {tab === "support" && <SupportTab key={refreshKey} />}
          {tab === "users" && <UsersTab key={refreshKey} />}
          {tab === "kyc" && <KycTab key={refreshKey} />}
          {tab === "transactions" && <TransactionsTab key={refreshKey} />}
          {tab === "assets" && <AssetsTab key={refreshKey} />}
          {tab === "gateways" && <GatewaysTab key={refreshKey} />}
          {tab === "settings" && <SettingsTab key={refreshKey} />}
        </main>
      </div>
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────── */
function OverviewTab({ onRefresh }: { onRefresh: () => void }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void legacyApi<any>("/admin/stats")
      .then(setD)
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return errBox({ message: err });
  if (!d)
    return (
      <div className="page">
        <div className="card card-pad">Loading…</div>
      </div>
    );
  const s = d.stats;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 50);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>📊 System Monitor</h2>
          <div className="sub">Live activity, exposure and platform health.</div>
        </div>
        <button className="btn btn-ghost" onClick={onRefresh}>
          ↻ Refresh
        </button>
      </div>
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="sl">🟢 Users online</div>
          <div className="sv" id="stat-online">
            {s.online}
          </div>
        </div>
        <div className="stat-card">
          <div className="sl">👥 Registered users</div>
          <div className="sv">{s.users}</div>
        </div>
        <div className="stat-card">
          <div className="sl">⏳ Pending transactions</div>
          <div className="sv">{s.pending_tx}</div>
        </div>
        <div className="stat-card">
          <div className="sl">🪪 Pending KYC</div>
          <div className="sv">{s.pending_kyc}</div>
        </div>
        <div className="stat-card">
          <div className="sl">📈 Open positions</div>
          <div className="sv" id="stat-open">
            {s.open_trades}
          </div>
        </div>
        <div className="stat-card">
          <div className="sl">💵 Open volume</div>
          <div className="sv">{fmtMoney(s.open_volume)}</div>
        </div>
      </div>
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <div className="card card-pad">
          <div className="card-title">Volume exposure by direction</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div className="mini-stat" style={{ flex: 1 }}>
              <div className="l">LONG (CALL) exposure</div>
              <div className="v green">{fmtMoney(s.long_volume)}</div>
            </div>
            <div className="mini-stat" style={{ flex: 1 }}>
              <div className="l">SHORT (PUT) exposure</div>
              <div className="v red">{fmtMoney(s.short_volume)}</div>
            </div>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 5,
              overflow: "hidden",
              display: "flex",
              background: "#232837",
            }}
          >
            <div
              style={{
                width: `${pct(s.long_volume, s.long_volume + s.short_volume)}%`,
                background: "var(--lp-long)",
              }}
            />
            <div style={{ flex: 1, background: "var(--lp-short)" }} />
          </div>
        </div>
        <div className="card card-pad">
          <div className="card-title">Financials</div>
          {[
            [
              "House P&L (all settled trades)",
              fmtMoney(s.house_pnl),
              s.house_pnl >= 0 ? "green" : "red",
            ],
            ["Today's trade volume", fmtMoney(s.today_volume), ""],
            ["Approved deposits", fmtMoney(s.transactions?.deposits), "green"],
            ["Approved withdrawals", fmtMoney(s.transactions?.withdrawals), "red"],
            ["Users' total live balances", fmtMoney(s.total_balances), ""],
          ].map(([l, v, cls]) => (
            <div
              key={l}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 0",
                borderBottom: "1px solid var(--lp-border-soft)",
                fontSize: 13,
              }}
            >
              <span className="muted">{l}</span>
              <b className={`mono ${cls}`}>{v}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-title" style={{ padding: "14px 14px 0" }}>
          Live trade activity
        </div>
        <div className="live-feed" id="live-feed-rows">
          {d.recent_trades?.length ? (
            d.recent_trades.map((t: any, i: number) => (
              <div key={i} className="feed-row">
                <b>{t.full_name}</b>{" "}
                <span className={`lp-badge ${badgeClass(t.direction)}`}>{t.direction}</span>{" "}
                <span>{t.asset_pair}</span>
                <span className="mono">{fmtMoney(t.amount)}</span>
                {t.status === "PENDING" ? (
                  <span className="muted">open…</span>
                ) : (
                  <span className={`lp-badge ${badgeClass(t.status)}`}>{t.status}</span>
                )}
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {timeAgo(t.created_at)}
                </span>
              </div>
            ))
          ) : (
            <div className="muted" style={{ padding: 18 }}>
              No trades yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Promo Codes ─────────────────────────────────────────────── */
function PromosTab() {
  const [promos, setPromos] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await legacyApi<{ promos: any[] }>("/admin/promos");
      setPromos(r.promos);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return errBox({ message: err });

  const toggle = async (id: string, on: boolean) => {
    try {
      await legacyApi(`/admin/promos/${id}`, { method: "PUT", body: { is_active: on } });
      lpToast(on ? "Code activated" : "Code disabled", "", "success");
      void load();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  const create = () => {
    openLegacyModal(
      <PromoCreateForm
        onDone={() => {
          closeLegacyModal();
          void load();
        }}
      />,
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>🎁 Promo Codes</h2>
          <div className="sub">Bonus codes users can redeem in Affiliate page.</div>
        </div>
        <button className="btn btn-primary" onClick={create}>
          + Create code
        </button>
      </div>
      <div className="card" style={{ padding: "4px 8px 8px" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Code</th>
              <th>Credits</th>
              <th>Used</th>
              <th>Expires</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {promos.length ? (
              promos.map((pm) => (
                <tr key={pm.id}>
                  <td>
                    <b className="mono gold">{pm.code}</b>
                  </td>
                  <td className="mono">
                    {fmtMoney(pm.amount)}{" "}
                    {pm.bonus_type === "REAL" ? (
                      <span className="lp-badge lp-badge-blue">LIVE</span>
                    ) : (
                      <span className="lp-badge lp-badge-gray">DEMO</span>
                    )}
                  </td>
                  <td className="mono">
                    {pm.used_count}/{pm.max_uses}
                  </td>
                  <td className="muted">
                    {pm.expires_at ? String(pm.expires_at).slice(0, 10) : "never"}
                  </td>
                  <td>
                    <span
                      className={`lp-badge ${pm.is_active ? "lp-badge-green" : "lp-badge-gray"}`}
                    >
                      {pm.is_active ? "ACTIVE" : "OFF"}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`switch ${pm.is_active ? "on" : ""}`}
                      onClick={(e) => toggle(pm.id, !e.currentTarget.classList.contains("on"))}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="muted" style={{ padding: 26, textAlign: "center" }}>
                  No promo codes yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromoCreateForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState("DEMO");
  const [amount, setAmount] = useState("10");
  const [max, setMax] = useState("100");
  const [exp, setExp] = useState("");
  const submit = async () => {
    try {
      await legacyApi("/admin/promos", {
        method: "POST",
        body: {
          code,
          bonus_type: type,
          amount: parseFloat(amount),
          max_uses: parseInt(max),
          expires_at: exp || null,
        },
      });
      lpToast("Promo created", "", "success");
      onDone();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div>
      <h3>Create promo code</h3>
      <div className="field">
        <label>Code (A-Z, 0-9)</label>
        <input
          className="input mono"
          placeholder="SUMMER50"
          style={{ textTransform: "uppercase" }}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field">
          <label>Credits to</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="DEMO">Practice fund</option>
            <option value="REAL">Live capital</option>
          </select>
        </div>
        <div className="field">
          <label>Amount ($)</label>
          <input
            className="input mono"
            type="number"
            min={0.01}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field">
          <label>Max uses</label>
          <input
            className="input mono"
            type="number"
            min={1}
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Expires (optional)</label>
          <input
            className="input"
            type="date"
            value={exp}
            onChange={(e) => setExp(e.target.value)}
          />
        </div>
      </div>
      <button className="btn btn-primary btn-block" onClick={submit}>
        Create
      </button>
    </div>
  );
}

/* ── Affiliates ──────────────────────────────────────────────── */
function AffiliatesTab() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void legacyApi<any>("/admin/affiliates")
      .then(setD)
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return errBox({ message: err });
  if (!d)
    return (
      <div className="page">
        <div className="card card-pad">Loading…</div>
      </div>
    );
  const t2 = d.totals;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>🤝 Affiliate Program</h2>
          <div className="sub">Referral performance across the platform.</div>
        </div>
      </div>
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="stat-card">
          <div className="sl">Active referrers</div>
          <div className="sv">{t2.referrers}</div>
        </div>
        <div className="stat-card">
          <div className="sl">Total invited users</div>
          <div className="sv">{t2.total_invited}</div>
        </div>
        <div className="stat-card">
          <div className="sl">Bonus paid</div>
          <div className="sv gold">${t2.total_paid?.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="sl">Bonus per signup</div>
          <div className="sv green">${Number(t2.bonus_per_signup).toFixed(2)}</div>
        </div>
      </div>
      <div className="card" style={{ padding: "4px 8px 8px" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Code</th>
              <th>Invited</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {d.affiliates?.length ? (
              d.affiliates.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        className="avatar"
                        style={{
                          width: 26,
                          height: 26,
                          fontSize: 10,
                          background: a.avatar_color || "#2A7BF6",
                        }}
                      >
                        {initials(a.full_name)}
                      </div>
                      <div>
                        <b>{a.full_name}</b>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {a.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="lp-badge lp-badge-gold mono">{a.referral_code}</span>
                  </td>
                  <td className="mono">{a.invited}</td>
                  <td className="mono green">${a.earned?.toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 26, textAlign: "center" }}>
                  No referrals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Support ─────────────────────────────────────────────────── */
function SupportTab() {
  const [d, setD] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await legacyApi<any>(`/admin/tickets${status ? `?status=${status}` : ""}`);
      setD(r);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return errBox({ message: err });
  if (!d)
    return (
      <div className="page">
        <div className="card card-pad">Loading…</div>
      </div>
    );
  const c = d.counts;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>🎧 Support Desk</h2>
          <div className="sub">Answer tickets; users get notified instantly.</div>
        </div>
        <select
          className="input"
          style={{ width: 170 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All ({c.open + c.answered + c.closed})</option>
          <option value="OPEN">Open ({c.open})</option>
          <option value="ANSWERED">Answered ({c.answered})</option>
          <option value="CLOSED">Closed ({c.closed})</option>
        </select>
      </div>
      <div className="card" style={{ padding: "4px 8px 8px" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Subject</th>
              <th>User</th>
              <th>Category</th>
              <th>Replies</th>
              <th>Updated</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.tickets?.length ? (
              d.tickets.map((t: any) => (
                <tr key={t.id}>
                  <td>
                    <b>{t.subject}</b>
                    <div className="muted" style={{ fontSize: 10.5 }}>
                      #{t.id.slice(0, 8)}
                    </div>
                  </td>
                  <td>
                    {t.full_name}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {t.email}
                    </div>
                  </td>
                  <td>
                    <span className="lp-badge lp-badge-blue">{t.category}</span>
                  </td>
                  <td className="mono">{t.reply_count}</td>
                  <td className="muted">{timeAgo(t.updated_at)}</td>
                  <td>
                    <span className={`lp-badge ${badgeClass(t.status)}`}>{t.status}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => openAdminTicket(t.id, load)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="muted" style={{ padding: 26, textAlign: "center" }}>
                  No tickets 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function openAdminTicket(id: string, onDone: () => void) {
  try {
    const d = await legacyApi<any>(`/admin/tickets/${id}`);
    const t = d.ticket;
    openLegacyModal(
      <div>
        <h3>
          {t.subject} <span className={`lp-badge ${badgeClass(t.status)}`}>{t.status}</span>
        </h3>
        <div className="muted" style={{ fontSize: 11.5, margin: "-8px 0 14px" }}>
          {t.full_name} ({t.email}) · {t.category} · {timeAgo(t.created_at)}
        </div>
        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {d.replies.map((r: any, i: number) => (
            <div
              key={i}
              style={{
                alignSelf: r.is_admin ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: r.is_admin ? "rgba(0,192,118,.08)" : "#232837",
                border: `1px solid ${r.is_admin ? "rgba(0,192,118,.3)" : "#2A2E39"}`,
                borderRadius: 12,
                padding: "10px 13px",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: r.is_admin ? "var(--lp-long)" : "var(--lp-muted)",
                  marginBottom: 3,
                }}
              >
                {r.is_admin ? "Support" : t.full_name} · {timeAgo(r.created_at)}
              </div>
              <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{r.message}</div>
            </div>
          ))}
        </div>
        {t.status !== "CLOSED" ? (
          <AdminTicketReply
            id={id}
            onDone={() => {
              closeLegacyModal();
              onDone();
            }}
          />
        ) : (
          <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
            Closed.
          </div>
        )}
      </div>,
    );
  } catch (e: any) {
    lpToast("Failed", e.message, "error");
  }
}

function AdminTicketReply({ id, onDone }: { id: string; onDone: () => void }) {
  const [msg, setMsg] = useState("");
  const send = async () => {
    try {
      await legacyApi(`/admin/tickets/${id}/reply`, { method: "POST", body: { message: msg } });
      lpToast("Reply sent", "", "success");
      onDone();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  const close2 = async () => {
    try {
      await legacyApi(`/admin/tickets/${id}/reply`, {
        method: "POST",
        body: { close: true, message: msg },
      });
      lpToast("Ticket closed", "", "success");
      onDone();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div>
      <div className="field">
        <textarea
          className="input"
          rows={3}
          placeholder="Write a reply…"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={close2}>
          Close ticket
        </button>
        <button className="btn btn-primary" onClick={send}>
          Send reply
        </button>
      </div>
    </div>
  );
}

/* ── Users ───────────────────────────────────────────────────── */
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await legacyApi<{ users: any[] }>(
        `/admin/users?search=${encodeURIComponent(search)}`,
      );
      setUsers(r.users);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [search]);
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);
  if (err) return errBox({ message: err });
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>👥 User Directory</h2>
          <div className="sub">Balances, risk profiles and account controls.</div>
        </div>
        <input
          className="input"
          placeholder="Search name or email…"
          style={{ width: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="card" style={{ padding: "4px 8px 8px" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Practice</th>
              <th>Live</th>
              <th>Trades</th>
              <th>Net P&L</th>
              <th>KYC</th>
              <th>Risk ratio</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      className="avatar"
                      style={{
                        width: 26,
                        height: 26,
                        fontSize: 10,
                        background: u.avatar_color || "#2A7BF6",
                      }}
                    >
                      {initials(u.full_name)}
                    </div>
                    <b>{u.full_name}</b>
                  </div>
                </td>
                <td className="muted">{u.email}</td>
                <td className="mono gold">{fmtMoney(u.demo_balance)}</td>
                <td className="mono green">{fmtMoney(u.real_balance)}</td>
                <td className="mono">{u.total_trades}</td>
                <td className={`mono ${u.net_pnl >= 0 ? "green" : "red"}`}>
                  {fmtMoney(u.net_pnl)}
                </td>
                <td>
                  <span className={`lp-badge ${badgeClass(u.kyc_status)}`}>{u.kyc_status}</span>
                </td>
                <td>
                  {u.custom_yield_ratio != null ? (
                    <span className="lp-badge lp-badge-gold">{u.custom_yield_ratio}%</span>
                  ) : (
                    <span className="muted">global</span>
                  )}
                </td>
                <td>
                  <span className={`lp-badge ${u.is_blocked ? "lp-badge-red" : "lp-badge-green"}`}>
                    {u.is_blocked ? "FROZEN" : "ACTIVE"}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm btn-ghost" onClick={() => manageUser(u.id, load)}>
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function manageUser(id: string, onDone: () => void) {
  try {
    const d = await legacyApi<any>(`/admin/users/${id}`);
    const u = d.user;
    openLegacyModal(
      <ManageUserModal
        u={u}
        d={d}
        id={id}
        onDone={() => {
          closeLegacyModal();
          onDone();
        }}
      />,
    );
  } catch (e: any) {
    lpToast("Failed", e.message, "error");
  }
}

function ManageUserModal({ u, d, id, onDone }: { u: any; d: any; id: string; onDone: () => void }) {
  const [yieldVal, setYieldVal] = useState(String(u.custom_yield_ratio ?? ""));
  const [acct, setAcct] = useState("REAL");
  const [dir, setDir] = useState("credit");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const saveYield = async () => {
    try {
      await legacyApi(`/admin/users/${id}/flags`, {
        method: "PUT",
        body: { custom_yield_ratio: yieldVal === "" ? null : parseFloat(yieldVal) },
      });
      lpToast("Risk profile updated", "", "success");
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  const adjust = async () => {
    try {
      await legacyApi(`/admin/users/${id}/balance`, {
        method: "POST",
        body: { account_type: acct, direction: dir, amount: parseFloat(amt), note },
      });
      lpToast("Balance adjusted", "Ledger entry created.", "success");
      onDone();
    } catch (e: any) {
      lpToast("Adjustment failed", e.message, "error");
    }
  };
  const block = async () => {
    try {
      await legacyApi(`/admin/users/${id}/flags`, {
        method: "PUT",
        body: { is_blocked: !u.is_blocked },
      });
      lpToast(u.is_blocked ? "Account unfrozen" : "Account frozen", "", "success");
      onDone();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div>
      <h3>Managing {u.full_name}</h3>
      <div className="muted" style={{ margin: "-8px 0 14px", fontSize: 12.5 }}>
        {u.email} • joined {String(u.created_at).slice(0, 10)}
      </div>
      <div className="mini-stats">
        <div className="mini-stat">
          <div className="l">Practice</div>
          <div className="v gold">{fmtMoney(u.demo_balance)}</div>
        </div>
        <div className="mini-stat">
          <div className="l">Live</div>
          <div className="v green">{fmtMoney(u.real_balance)}</div>
        </div>
        <div className="mini-stat">
          <div className="l">Win rate</div>
          <div className="v">{d.analytics.win_rate}%</div>
        </div>
        <div className="mini-stat">
          <div className="l">Net P&L</div>
          <div className={`v ${d.analytics.net_pnl >= 0 ? "green" : "red"}`}>
            {fmtMoney(d.analytics.net_pnl)}
          </div>
        </div>
      </div>
      <div className="field">
        <label>Custom execution yield ratio (%) — leave empty to use global</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input mono"
            type="number"
            min={0}
            max={100}
            step={1}
            value={yieldVal}
            placeholder="global"
            onChange={(e) => setYieldVal(e.target.value)}
          />
          <button className="btn" onClick={saveYield}>
            Save
          </button>
        </div>
      </div>
      <div className="field">
        <label>Manual balance adjustment (recorded on ledger)</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8 }}>
          <select className="input" value={acct} onChange={(e) => setAcct(e.target.value)}>
            <option value="REAL">Live</option>
            <option value="DEMO">Practice</option>
          </select>
          <select className="input" value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="credit">Credit +</option>
            <option value="debit">Debit −</option>
          </select>
          <input
            className="input mono"
            type="number"
            min={0.01}
            step={0.01}
            placeholder="0.00"
            style={{ width: 110 }}
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
          />
          <button className="btn btn-primary" onClick={adjust}>
            Apply
          </button>
        </div>
        <input
          className="input"
          placeholder="Audit note (optional)"
          style={{ marginTop: 8 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className={`btn ${u.is_blocked ? "btn-long" : "btn-short"}`} onClick={block}>
          {u.is_blocked ? "🔓 Unfreeze account" : "🧊 Freeze account"}
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={closeLegacyModal}>
          Close
        </button>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="card-title">Recent trades</div>
        <div style={{ maxHeight: 180, overflowY: "auto" }}>
          <table className="tbl">
            {d.trades?.slice(0, 15).map((t: any, i: number) => (
              <tr key={i}>
                <td>{t.asset_pair}</td>
                <td>
                  <span className={`lp-badge ${badgeClass(t.direction)}`}>{t.direction}</span>
                </td>
                <td className="mono">{fmtMoney(t.amount)}</td>
                <td>
                  <span className={`lp-badge ${badgeClass(t.status)}`}>{t.status}</span>
                </td>
                <td className={`mono ${t.result_profit >= 0 ? "green" : "red"}`}>
                  {fmtMoney(t.result_profit)}
                </td>
                <td className="muted">{timeAgo(t.expired_at || t.created_at)}</td>
              </tr>
            )) || (
              <tr>
                <td className="muted">No trades</td>
              </tr>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── KYC Review ───────────────────────────────────────────────── */
function KycTab() {
  const [queue, setQueue] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await legacyApi<{ queue: any[] }>("/admin/kyc");
      setQueue(r.queue);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return errBox({ message: err });
  const review = async (id: string, decision: string, reason: string) => {
    try {
      await legacyApi(`/admin/kyc/${id}/review`, { method: "POST", body: { decision, reason } });
      lpToast(`KYC ${decision.toLowerCase()}`, "", "success");
      void load();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>🪪 KYC Verification</h2>
          <div className="sub">Identity document review portal.</div>
        </div>
      </div>
      {queue.length ? (
        queue.map((k) => <KycReviewCard key={k.id} k={k} onReview={review} />)
      ) : (
        <div className="card card-pad muted" style={{ textAlign: "center", padding: 40 }}>
          No pending KYC submissions 🎉
        </div>
      )}
    </div>
  );
}

function KycReviewCard({
  k,
  onReview,
}: {
  k: any;
  onReview: (id: string, decision: string, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <b style={{ fontSize: 14.5 }}>{k.full_name}</b> <span className="muted">({k.email})</span>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            🌍 {k.country || "—"} • {k.kyc_doc_type || "NID"} • ID: {k.kyc_national_id || "—"} •
            DOB: {k.kyc_dob || "—"}
            <br />
            {k.kyc_address || "—"} • submitted {timeAgo(k.kyc_submitted_at)}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <a
              href={k.kyc_doc_path}
              target="_blank"
              rel="noopener"
              style={{
                border: "1px solid var(--lp-border)",
                borderRadius: 10,
                overflow: "hidden",
                width: 150,
                height: 100,
                display: "block",
                background: "var(--lp-panel-2)",
                position: "relative",
              }}
            >
              <img
                src={k.kyc_doc_path}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  e.currentTarget.parentElement!.innerHTML =
                    "<span style='position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:#848E9C'>PDF document</span>";
                }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(0,0,0,.65)",
                  fontSize: 10,
                  padding: "3px 6px",
                }}
              >
                📄 ID document ↗
              </span>
            </a>
            <a
              href={k.kyc_selfie_path}
              target="_blank"
              rel="noopener"
              style={{
                border: "1px solid var(--lp-border)",
                borderRadius: 10,
                overflow: "hidden",
                width: 150,
                height: 100,
                display: "block",
                background: "var(--lp-panel-2)",
                position: "relative",
              }}
            >
              <img
                src={k.kyc_selfie_path}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(0,0,0,.65)",
                  fontSize: 10,
                  padding: "3px 6px",
                }}
              >
                🤳 Face selfie ↗
              </span>
            </a>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="input"
            placeholder="Rejection reason (optional)"
            style={{ width: 200 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="btn btn-long" onClick={() => onReview(k.id, "APPROVED", reason)}>
            ✓ Approve
          </button>
          <button className="btn btn-short" onClick={() => onReview(k.id, "REJECTED", reason)}>
            ✗ Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Transactions ────────────────────────────────────────────── */
function TransactionsTab() {
  const [queue, setQueue] = useState<any[]>([]);
  const [status, setStatus] = useState("PENDING");
  const [type, setType] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await legacyApi<{ queue: any[] }>(
        `/admin/transactions?status=${status}${type ? `&type=${type}` : ""}`,
      );
      setQueue(r.queue);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [status, type]);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return errBox({ message: err });
  const reviewTx = async (id: string, decision: string) => {
    try {
      await legacyApi(`/admin/transactions/${id}/review`, { method: "POST", body: { decision } });
      lpToast(`Transaction ${decision.toLowerCase()}`, "", "success");
      void load();
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>💰 Deposit & Withdrawal Queue</h2>
          <div className="sub">One-click review with audit notes.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select
            className="input"
            style={{ width: 150 }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["PENDING", "APPROVED", "REJECTED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 150 }}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {["DEPOSIT", "WITHDRAWAL"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="card" style={{ padding: "4px 8px 8px" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Type</th>
              <th>Method</th>
              <th>Amount</th>
              <th>TrxID / Account</th>
              <th>Requested</th>
              <th>Status</th>
              <th>Note</th>
              {status === "PENDING" && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {queue.length ? (
              queue.map((t) => (
                <tr key={t.id}>
                  <td>
                    <b>{t.full_name}</b>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {t.email}
                    </div>
                  </td>
                  <td>
                    <span className={`lp-badge ${badgeClass(t.type)}`}>{t.type}</span>
                  </td>
                  <td>{t.payment_method}</td>
                  <td className="mono" style={{ fontWeight: 700 }}>
                    {fmtMoney(t.amount)}
                  </td>
                  <td className="mono muted">{t.trx_id}</td>
                  <td className="muted">{timeAgo(t.created_at)}</td>
                  <td>
                    <span className={`lp-badge ${badgeClass(t.status)}`}>{t.status}</span>
                  </td>
                  <td
                    className="muted"
                    style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {t.admin_note || ""}
                  </td>
                  {status === "PENDING" && (
                    <td style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-sm btn-long"
                        onClick={() => reviewTx(t.id, "APPROVED")}
                      >
                        ✓
                      </button>
                      <button
                        className="btn btn-sm btn-short"
                        onClick={() => reviewTx(t.id, "REJECTED")}
                      >
                        ✗
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="muted" style={{ padding: 30, textAlign: "center" }}>
                  Queue is clear 🎉
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Assets / Markets ────────────────────────────────────────── */
function AssetsTab() {
  const [assets, setAssets] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await legacyApi<{ assets: any[] }>("/admin/assets");
      setAssets(r.assets);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return errBox({ message: err });
  const toggle = async (id: string, on: boolean) => {
    try {
      await legacyApi(`/admin/assets/${id}`, { method: "PUT", body: { is_active: on } });
      lpToast(on ? "Market enabled" : "Market disabled", "", "success");
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
      void load();
    }
  };
  const save = async (a: any) => {
    try {
      await legacyApi(`/admin/assets/${a.id}`, {
        method: "PUT",
        body: {
          display_name: a.display_name,
          payout_percentage: a.payout_percentage,
          volatility: a.volatility,
        },
      });
      lpToast("Asset updated", "", "success");
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>📈 Market Asset Control</h2>
          <div className="sub">Enable/disable pairs and set custom yield payout rates.</div>
        </div>
      </div>
      <div className="card" style={{ padding: "4px 8px 8px" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Display name</th>
              <th>Category</th>
              <th>Feed</th>
              <th>Base price</th>
              <th>Payout %</th>
              <th>Vol factor</th>
              <th>Trading</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td>
                  <b className="mono">{a.symbol}</b>
                </td>
                <td>
                  <input
                    className="input"
                    style={{ width: 170, padding: "5px 8px" }}
                    defaultValue={a.display_name}
                    onChange={(e) => (a.display_name = e.target.value)}
                  />
                </td>
                <td>
                  <span className="lp-badge lp-badge-blue">{a.category}</span>
                </td>
                <td className="mono muted">
                  {a.feed_type ? `${a.feed_type} · ${a.feed_symbol}` : "synthetic"}
                </td>
                <td className="mono">{fmtPrice(a.base_price)}</td>
                <td>
                  <input
                    className="input mono"
                    style={{ width: 80, padding: "5px 8px" }}
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    defaultValue={a.payout_percentage}
                    onChange={(e) => (a.payout_percentage = parseFloat(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    className="input mono"
                    style={{ width: 70, padding: "5px 8px" }}
                    type="number"
                    min={0.1}
                    max={5}
                    step={0.1}
                    defaultValue={a.volatility}
                    onChange={(e) => (a.volatility = parseFloat(e.target.value))}
                  />
                </td>
                <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className={`switch ${a.is_active ? "on" : ""}`}
                    onClick={(e) => toggle(a.id, !e.currentTarget.classList.contains("on"))}
                  />
                  <button className="btn btn-sm btn-ghost" onClick={() => save(a)}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Gateways ────────────────────────────────────────────────── */
function GatewaysTab() {
  const [gw, setGw] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void legacyApi<{ settings: { gateways: any } }>("/admin/settings")
      .then((r) => setGw(r.settings.gateways))
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return errBox({ message: err });
  if (!gw)
    return (
      <div className="page">
        <div className="card card-pad">Loading…</div>
      </div>
    );
  const fields: [string, string][] = [
    ["bkash_agent", "bKash agent number"],
    ["nagad_agent", "Nagad agent number"],
    ["rocket_agent", "Rocket agent number"],
    ["usdt_trc20_address", "USDT TRC20 address"],
    ["usdt_bep20_address", "USDT BEP20 address"],
  ];
  const save = async () => {
    const body: any = {};
    fields.forEach(
      ([k]) => (body[k] = (document.getElementById(`gw-${k}`) as HTMLInputElement)?.value || ""),
    );
    body.deposit_instructions =
      (document.getElementById("gw-deposit_instructions") as HTMLTextAreaElement)?.value || "";
    try {
      await legacyApi("/admin/gateways", { method: "PUT", body });
      lpToast("Gateways saved", "", "success");
    } catch (e: any) {
      lpToast("Failed", e.message, "error");
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>🏦 Gateway Configuration</h2>
          <div className="sub">
            Agent numbers and crypto wallet addresses shown to users on the deposit page.
          </div>
        </div>
      </div>
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        {fields.map(([k, label]) => (
          <div key={k} className="field">
            <label>{label}</label>
            <input className="input mono" id={`gw-${k}`} defaultValue={gw[k] || ""} />
          </div>
        ))}
        <div className="field">
          <label>Deposit instructions</label>
          <textarea
            className="input"
            id="gw-deposit_instructions"
            rows={3}
            defaultValue={gw.deposit_instructions || ""}
          />
        </div>
        <button className="btn btn-primary" onClick={save}>
          Save gateway config
        </button>
      </div>
    </div>
  );
}

/* ── Risk Engine Settings ────────────────────────────────────── */
function SettingsTab() {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void legacyApi<{ settings: any }>("/admin/settings")
      .then((r) => setS(r.settings))
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return errBox({ message: err });
  if (!s)
    return (
      <div className="page">
        <div className="card card-pad">Loading…</div>
      </div>
    );

  const save = async (body: any) => {
    try {
      await legacyApi("/admin/settings", { method: "PUT", body });
      lpToast("Settings applied", "Risk engine updated globally.", "success");
    } catch (e: any) {
      lpToast("Update failed", e.message, "error");
    }
  };
  const saveAll = async () => {
    await save({
      global_probability_rate: parseFloat(
        (document.getElementById("set-prob") as HTMLInputElement)?.value,
      ),
      circuit_breaker_factor: parseFloat(
        (document.getElementById("set-cbf") as HTMLInputElement)?.value,
      ),
      spread_percentage: parseFloat(
        (document.getElementById("set-spread") as HTMLInputElement)?.value,
      ),
      slippage_percentage: parseFloat(
        (document.getElementById("set-slip") as HTMLInputElement)?.value,
      ),
      min_deposit_limit: parseFloat(
        (document.getElementById("set-mindep") as HTMLInputElement)?.value,
      ),
      min_withdrawal_limit: parseFloat(
        (document.getElementById("set-minwd") as HTMLInputElement)?.value,
      ),
      referral_bonus: parseFloat(
        (document.getElementById("set-refbonus") as HTMLInputElement)?.value,
      ),
      cashback_percentage: parseFloat(
        (document.getElementById("set-cashback") as HTMLInputElement)?.value,
      ),
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>🛡️ Risk Management Engine</h2>
          <div className="sub">
            Global execution parameters, volatility protection and synthetic spread controls.
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 18 }}>
        <div className="card-title">Market data feed</div>
        <div className="setting-row">
          <div>
            <div className="st">Price data source</div>
            <div className="sd">
              LIVE streams real market prices. If a provider is unreachable, that asset falls back
              to the synthetic engine.
            </div>
          </div>
          <div className="sc">
            <div className="segmented">
              <button
                className={s.market_data_source === "LIVE" ? "active" : ""}
                onClick={() => {
                  setS({ ...s, market_data_source: "LIVE" });
                  void save({ market_data_source: "LIVE" });
                }}
              >
                LIVE
              </button>
              <button
                className={s.market_data_source === "SYNTHETIC" ? "active" : ""}
                onClick={() => {
                  setS({ ...s, market_data_source: "SYNTHETIC" });
                  void save({ market_data_source: "SYNTHETIC" });
                }}
              >
                SYNTHETIC
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 18 }}>
        <div className="card-title">Execution</div>
        <div className="setting-row">
          <div>
            <div className="st">Execution mode</div>
            <div className="sd">
              SIMULATION resolves outcomes via the probability coefficient. REAL_MARKET resolves
              strictly against live price movement.
            </div>
          </div>
          <div className="sc">
            <div className="segmented">
              <button
                className={s.execution_mode === "SIMULATION" ? "active" : ""}
                onClick={() => {
                  setS({ ...s, execution_mode: "SIMULATION" });
                  void save({ execution_mode: "SIMULATION" });
                }}
              >
                SIMULATION
              </button>
              <button
                className={s.execution_mode === "REAL_MARKET" ? "active" : ""}
                onClick={() => {
                  setS({ ...s, execution_mode: "REAL_MARKET" });
                  void save({ execution_mode: "REAL_MARKET" });
                }}
              >
                REAL_MARKET
              </button>
            </div>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">Target return rate — global win rate %</div>
            <div className="sd">Baseline execution success threshold in SIMULATION mode.</div>
          </div>
          <div className="sc">
            <input
              type="range"
              id="set-prob"
              min={0}
              max={95}
              step={1}
              defaultValue={s.global_probability_rate}
            />
            <span className="range-val">{s.global_probability_rate}%</span>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 18 }}>
        <div className="card-title">Volatility protection</div>
        <div className="setting-row">
          <div>
            <div className="st">Circuit breaker (global override)</div>
            <div className="sd">
              When ON: new position expiries are auto-extended ×1.5 and win probability is scaled.
            </div>
          </div>
          <div className="sc">
            <button
              className={`switch ${s.enable_circuit_breaker ? "on" : ""}`}
              onClick={(e) => {
                const on = !e.currentTarget.classList.contains("on");
                setS({ ...s, enable_circuit_breaker: on });
                void save({ enable_circuit_breaker: on });
              }}
            />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">Circuit breaker factor</div>
            <div className="sd">
              Multiplier applied to the win probability while the breaker is active.
            </div>
          </div>
          <div className="sc">
            <input
              type="range"
              id="set-cbf"
              min={0.05}
              max={1}
              step={0.05}
              defaultValue={s.circuit_breaker_factor}
            />
            <span className="range-val">{s.circuit_breaker_factor}</span>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">🚨 Emergency force-loss override</div>
            <div className="sd">When ON, every SIMULATION-mode position expires as a LOSS.</div>
          </div>
          <div className="sc">
            <button
              className={`switch ${s.force_loss_mode ? "on" : ""}`}
              onClick={(e) => {
                const on = !e.currentTarget.classList.contains("on");
                setS({ ...s, force_loss_mode: on });
                void save({ force_loss_mode: on });
              }}
            />
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 18 }}>
        <div className="card-title">Synthetic pricing layer</div>
        <div className="setting-row">
          <div>
            <div className="st">Spread adjuster</div>
            <div className="sd">Half-spread offset (%) applied against the trader at entry.</div>
          </div>
          <div className="sc">
            <input
              className="input mono"
              id="set-spread"
              type="number"
              step={0.01}
              min={0}
              max={1}
              defaultValue={s.spread_percentage}
              style={{ width: 100 }}
            />
            <span className="range-val">%</span>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">Slippage adjuster</div>
            <div className="sd">Random entry/exit jitter (%) layered on top of the spread.</div>
          </div>
          <div className="sc">
            <input
              className="input mono"
              id="set-slip"
              type="number"
              step={0.01}
              min={0}
              max={1}
              defaultValue={s.slippage_percentage}
              style={{ width: 100 }}
            />
            <span className="range-val">%</span>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 760, marginBottom: 18 }}>
        <div className="card-title">Limits & platform</div>
        <div className="setting-row">
          <div className="st">Minimum deposit</div>
          <div className="sc">
            <input
              className="input mono"
              id="set-mindep"
              type="number"
              step={1}
              min={1}
              defaultValue={s.min_deposit_limit}
              style={{ width: 110 }}
            />
          </div>
        </div>
        <div className="setting-row">
          <div className="st">Minimum withdrawal</div>
          <div className="sc">
            <input
              className="input mono"
              id="set-minwd"
              type="number"
              step={1}
              min={1}
              defaultValue={s.min_withdrawal_limit}
              style={{ width: 110 }}
            />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">Referral bonus per signup ($)</div>
            <div className="sd">
              Practice-fund bonus credited to the inviter when a new user registers with their code.
            </div>
          </div>
          <div className="sc">
            <input
              className="input mono"
              id="set-refbonus"
              type="number"
              step={0.5}
              min={0}
              defaultValue={s.referral_bonus}
              style={{ width: 110 }}
            />
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">Loss cashback (%)</div>
            <div className="sd">
              Automatic refund of this % of the stake on every losing position (0 = off).
            </div>
          </div>
          <div className="sc">
            <input
              className="input mono"
              id="set-cashback"
              type="number"
              step={0.5}
              min={0}
              max={50}
              defaultValue={s.cashback_percentage}
              style={{ width: 110 }}
            />
            <span className="range-val">%</span>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="st">Maintenance mode</div>
            <div className="sd">Blocks all non-admin API activity platform-wide.</div>
          </div>
          <div className="sc">
            <button
              className={`switch ${s.maintenance_mode ? "on" : ""}`}
              onClick={(e) => {
                const on = !e.currentTarget.classList.contains("on");
                setS({ ...s, maintenance_mode: on });
                void save({ maintenance_mode: on });
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={saveAll}>
            Save all settings
          </button>
        </div>
      </div>
    </div>
  );
}
