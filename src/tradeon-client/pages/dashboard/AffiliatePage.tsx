// @ts-nocheck

import { useCallback, useEffect, useState } from "react";
import dynamic from "@/tradeon-client/lib/nextDynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Handshake, Clock, XCircle, Percent, Repeat, Zap } from "lucide-react";

// Recharts analytics chart is lazy-loaded off the initial Affiliate bundle.
const ReferralChart = dynamic(() => import("@/tradeon-client/components/charts/ReferralChart"), {
  ssr: false,
  loading: () => <div className="chart-empty" aria-hidden="true" />,
});
import { useSession } from "@/tradeon-client/components/dashboard/SessionProvider";
import { api, money, fmtDate } from "@/tradeon-client/lib/apiClient";
import { COUNTRIES } from "@/tradeon-client/lib/countries";
import { useCachedApi } from "@/tradeon-client/lib/useCachedApi";

export default function AffiliatePage() {
  const { user } = useSession();
  const {
    data,
    isLoading: loading,
    error: fetchError,
    refresh,
  } = useCachedApi("/api/affiliate", () => api("/api/affiliate"));
  const {
    data: appStatus,
    isLoading: applicationLoading,
    refresh: refreshApp,
  } = useCachedApi("/api/affiliate/apply", () => api("/api/affiliate/apply"));
  const [error, setError] = useState("");
  const [tab, setTab] = useState("REFERRALS");
  const [copied, setCopied] = useState(false);
  const [payoutModal, setPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ amount: "", method: "USDT_TRC20", details: "" });
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Application form state
  const [appForm, setAppForm] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    phone: "",
    country: user?.country || "",
    experience: "",
    platform: "",
    audienceSize: "",
    reason: "",
  });
  const [appBusy, setAppBusy] = useState(false);

  useEffect(() => {
    if (fetchError) setError(fetchError.message || "Failed to load affiliate dashboard");
  }, [fetchError]);

  // Lighter polling — the cache serves stale data instantly, this just refreshes
  useEffect(() => {
    const t = setInterval(() => {
      refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const load = refresh;
  const checkApplication = refreshApp;

  const submitApplication = async (e) => {
    e.preventDefault();
    setAppBusy(true);
    setMsg(null);
    try {
      await api("/api/affiliate/apply", { method: "POST", body: appForm });
      setMsg({ kind: "ok", text: "Application submitted! We will review it within 24-48 hours." });
      await checkApplication();
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setAppBusy(false);
    }
  };

  if (loading || (data?.affiliateStatus !== "ACTIVE" && applicationLoading)) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: 350 }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  // If user is not an active affiliate, show application form or pending status
  const isAffiliate = data?.affiliateStatus === "ACTIVE";
  const hasApplied = appStatus?.applied;
  const isPending = appStatus?.status === "PENDING";
  const isRejected = appStatus?.status === "REJECTED";

  if (!isAffiliate && !isPending && !hasApplied) {
    return (
      <div className="affiliate">
        {msg && (
          <div className={`alert alert-${msg.kind === "ok" ? "ok" : "error"}`}>{msg.text}</div>
        )}

        <div className="perk-grid">
          {[
            {
              icon: Percent,
              title: "40% commission",
              text: "Earn on every deposit your referrals make — one of the highest rates in the industry.",
            },
            {
              icon: Repeat,
              title: "Lifetime earnings",
              text: "Your referral link is yours forever. Every trader you bring keeps earning for you.",
            },
            {
              icon: Zap,
              title: "Fast weekly payouts",
              text: "Commissions settle weekly to your real balance — withdraw anytime after KYC.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="glass perk">
              <div className="perk-icon">
                <Icon size={18} />
              </div>
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          ))}
        </div>

        <section className="glass" style={{ padding: 28, maxWidth: 600 }}>
          <div
            className="badge badge-gold"
            style={{ marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Handshake size={14} /> Affiliate Partner Program
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 24 }}>Apply to Become an Affiliate</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Join our affiliate program and earn{" "}
            <strong className="gold-text">40% commission</strong> on every referral. Fill out the
            form below and our team will review your application within 24-48 hours.
          </p>

          <form onSubmit={submitApplication} className="app-form">
            <div className="form-grid">
              <div className="field">
                <label>Full Name *</label>
                <input
                  className="input"
                  required
                  value={appForm.fullName}
                  onChange={(e) => setAppForm({ ...appForm, fullName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Email *</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={appForm.email}
                  onChange={(e) => setAppForm({ ...appForm, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Phone Number *</label>
                <input
                  className="input"
                  required
                  placeholder="+880..."
                  value={appForm.phone}
                  onChange={(e) => setAppForm({ ...appForm, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Country *</label>
                <select
                  className="select"
                  required
                  value={appForm.country}
                  onChange={(e) => setAppForm({ ...appForm, country: e.target.value })}
                >
                  <option value="">Select country...</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Trading / Marketing Experience *</label>
              <select
                className="select"
                required
                value={appForm.experience}
                onChange={(e) => setAppForm({ ...appForm, experience: e.target.value })}
              >
                <option value="">Select experience level...</option>
                <option value="Beginner (0-1 years)">Beginner (0-1 years)</option>
                <option value="Intermediate (1-3 years)">Intermediate (1-3 years)</option>
                <option value="Experienced (3-5 years)">Experienced (3-5 years)</option>
                <option value="Expert (5+ years)">Expert (5+ years)</option>
              </select>
            </div>

            <div className="field">
              <label>Primary Platform / Channel *</label>
              <select
                className="select"
                required
                value={appForm.platform}
                onChange={(e) => setAppForm({ ...appForm, platform: e.target.value })}
              >
                <option value="">Select platform...</option>
                <option value="YouTube">YouTube</option>
                <option value="Telegram">Telegram</option>
                <option value="Instagram">Instagram</option>
                <option value="Twitter/X">Twitter/X</option>
                <option value="Facebook">Facebook</option>
                <option value="TikTok">TikTok</option>
                <option value="WhatsApp Groups">WhatsApp Groups</option>
                <option value="Blog / Website">Blog / Website</option>
                <option value="Trading Communities">Trading Communities</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="field">
              <label>Audience Size</label>
              <select
                className="select"
                value={appForm.audienceSize}
                onChange={(e) => setAppForm({ ...appForm, audienceSize: e.target.value })}
              >
                <option value="">Select audience size...</option>
                <option value="Under 500">Under 500</option>
                <option value="500 - 2,000">500 - 2,000</option>
                <option value="2,000 - 10,000">2,000 - 10,000</option>
                <option value="10,000 - 50,000">10,000 - 50,000</option>
                <option value="50,000+">50,000+</option>
              </select>
            </div>

            <div className="field">
              <label>Why do you want to join? *</label>
              <textarea
                className="input"
                rows={4}
                required
                placeholder="Tell us about your marketing strategy and why you'd be a great affiliate partner..."
                value={appForm.reason}
                onChange={(e) => setAppForm({ ...appForm, reason: e.target.value })}
              />
            </div>

            <button
              type="submit"
              className="btn btn-gold btn-block btn-lg"
              disabled={appBusy}
              style={{ marginTop: 8 }}
            >
              {appBusy ? (
                <>
                  <span className="spinner" /> Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </button>
          </form>
        </section>

        <style>{`
          .affiliate { display: grid; gap: 16px; max-width: 700px; }
          .perk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
          .perk { padding: 18px; display: grid; gap: 8px; border-radius: 14px; transition: transform 0.18s ease, box-shadow 0.18s ease; }
          .perk:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35); }
          .perk-icon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: rgba(245, 197, 66, 0.12); border: 1px solid rgba(245, 197, 66, 0.35); color: var(--gold-1); }
          .perk strong { font-size: 14.5px; }
          .perk span { font-size: 12.5px; line-height: 1.6; color: var(--muted); }
          .app-form { display: grid; gap: 14px; }
          .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
          @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
        `}</style>
      </div>
    );
  }

  // Pending application status
  if (isPending) {
    return (
      <div className="affiliate">
        <section className="glass" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ marginBottom: 16, color: "var(--gold-1)" }}>
            <Clock size={44} />
          </div>
          <h2 style={{ margin: "0 0 10px" }}>Application Under Review</h2>
          <p className="muted" style={{ fontSize: 15, maxWidth: 480, margin: "0 auto" }}>
            Your affiliate application is being reviewed by our team. We will notify you within
            24-48 hours.
          </p>
          <div className="badge badge-warn" style={{ marginTop: 20 }}>
            Status: PENDING
          </div>
        </section>
      </div>
    );
  }

  // Rejected but can re-apply
  if (isRejected) {
    return (
      <div className="affiliate">
        <section className="glass" style={{ padding: 40, textAlign: "center" }}>
          <div style={{ marginBottom: 16, color: "#f43f5e" }}>
            <XCircle size={44} />
          </div>
          <h2 style={{ margin: "0 0 10px" }}>Application Not Approved</h2>
          <p className="muted" style={{ fontSize: 15, maxWidth: 480, margin: "0 auto" }}>
            {appStatus?.application?.adminNote || "Your application was not approved at this time."}
          </p>
          <p className="dim" style={{ fontSize: 13, marginTop: 12 }}>
            You can re-apply after 7 days.
          </p>
        </section>
      </div>
    );
  }

  // Full affiliate dashboard
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const refLink = `${origin}/signup?ref=${data.referralCode}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked (insecure origin or denied permission) — nothing to copy */
    }
  };

  const submitPayout = async (e) => {
    e.preventDefault();
    setPayoutBusy(true);
    setMsg(null);
    try {
      await api("/api/affiliate", {
        method: "POST",
        body: {
          amount: Number(payoutForm.amount),
          payoutMethod: payoutForm.method,
          payoutDetails: payoutForm.details,
        },
      });
      setMsg({ kind: "ok", text: "Payout request submitted!" });
      setPayoutForm({ amount: "", method: "USDT_TRC20", details: "" });
      setPayoutModal(false);
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: err.message });
    } finally {
      setPayoutBusy(false);
    }
  };

  const stats = data.stats;

  return (
    <div className="affiliate">
      {msg && <div className={`alert alert-${msg.kind === "ok" ? "ok" : "error"}`}>{msg.text}</div>}

      {/* Hero Header */}
      <section className="glass head">
        <div
          className="badge badge-gold"
          style={{ marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Handshake size={14} /> {data.commissionRate}% COMMISSION
        </div>
        <h1>Affiliate Partner Hub</h1>
        <p className="muted">
          Earn <strong>{data.commissionRate}% commission</strong> on every deposit from your
          referrals.
        </p>
        <div className="link-box">
          <span className="dim">Your Referral Link</span>
          <div className="link-row">
            <code className="mono link-text">{refLink}</code>
            <button className="btn btn-gold btn-sm" onClick={copyLink}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          <div className="code-badge">
            Code: <strong className="gold-text">{data.referralCode}</strong>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="cards-grid">
        <div className="glass stat-card">
          <span>Clicks</span>
          <strong className="mono">{stats.clicks}</strong>
        </div>
        <div className="glass stat-card">
          <span>Referrals</span>
          <strong className="mono">{stats.totalReferred}</strong>
        </div>
        <div className="glass stat-card">
          <span>Earned</span>
          <strong className="mono gold-text">{money(stats.totalEarned)}</strong>
        </div>
        <div className="glass stat-card gold-border">
          <span>Available</span>
          <strong className="mono up">{money(stats.availableBalance)}</strong>
          <button
            className="btn btn-sm btn-gold"
            style={{ marginTop: 8 }}
            disabled={stats.availableBalance < 10}
            onClick={() => {
              setPayoutForm({ ...payoutForm, amount: String(stats.availableBalance) });
              setPayoutModal(true);
            }}
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Spec §6.5 — mini combo chart: clicks (bars) · referrals (line) · commission (line) */}
      <section className="glass panel">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Performance — last 30 days</h3>
          <div className="legend">
            <span>
              <i className="dot click" /> Clicks
            </span>
            <span>
              <i className="dot ref" /> Referrals
            </span>
            <span>
              <i className="dot comm" /> Commission
            </span>
          </div>
        </div>
        <div className="chart-frame">
          {(() => {
            const hasData = (data.analytics || []).some(
              (a) => a.clicks || a.referrals || a.commission,
            );
            if (!hasData) {
              return (
                <div className="chart-empty">
                  <p>No clicks yet.</p>
                  <span>
                    Share your referral link and your clicks, sign-ups and commissions will chart
                    here in real time.
                  </span>
                </div>
              );
            }
            return <ReferralChart data={data.analytics} />;
          })()}
        </div>
      </section>

      {/* Tabs */}
      <section className="glass panel">
        <div className="tabs">
          <button
            className={`tab ${tab === "REFERRALS" ? "active" : ""}`}
            onClick={() => setTab("REFERRALS")}
          >
            Referrals ({data.referredUsers.length})
          </button>
          <button
            className={`tab ${tab === "COMMISSIONS" ? "active" : ""}`}
            onClick={() => setTab("COMMISSIONS")}
          >
            Commissions ({data.commissions.length})
          </button>
          <button
            className={`tab ${tab === "PAYOUTS" ? "active" : ""}`}
            onClick={() => setTab("PAYOUTS")}
          >
            Payouts ({data.payouts.length})
          </button>
        </div>

        {tab === "REFERRALS" && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Country</th>
                  <th>Deposits</th>
                  <th>Total</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                {data.referredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <div className="dim" style={{ fontSize: 11 }}>
                        {u.email}
                      </div>
                    </td>
                    <td>{u.country || "—"}</td>
                    <td className="mono">{u.depositCount}</td>
                    <td className="mono">{money(u.totalDeposited)}</td>
                    <td className="mono gold-text">
                      <strong>{money(u.commissionGenerated)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.referredUsers.length && (
              <div className="empty">No referrals yet. Share your link!</div>
            )}
          </div>
        )}

        {tab === "COMMISSIONS" && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trader</th>
                  <th>Source</th>
                  <th>Amount</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c) => (
                  <tr key={c.id}>
                    <td className="dim">{fmtDate(c.createdAt)}</td>
                    <td>{c.referredName}</td>
                    <td>
                      <span className="badge badge-info">{c.sourceType}</span>
                    </td>
                    <td className="mono">{money(c.grossAmount)}</td>
                    <td className="mono up">
                      <strong>+{money(c.amount)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.commissions.length && <div className="empty">No commissions yet.</div>}
          </div>
        )}

        {tab === "PAYOUTS" && (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id}>
                    <td className="dim">{fmtDate(p.createdAt)}</td>
                    <td className="mono">
                      <strong>{money(p.amount)}</strong>
                    </td>
                    <td>{p.method}</td>
                    <td
                      className="mono"
                      style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
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
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.payouts.length && <div className="empty">No payouts yet.</div>}
          </div>
        )}
      </section>

      {/* Payout Modal */}
      <AnimatePresence>
        {payoutModal && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPayoutModal(false)}
          >
            <motion.div
              className="glass modal"
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Request Payout</h3>
              <form onSubmit={submitPayout}>
                <div className="field">
                  <label>Amount (USD)</label>
                  <input
                    className="input mono"
                    type="number"
                    min="10"
                    max={stats.availableBalance}
                    step="0.01"
                    required
                    value={payoutForm.amount}
                    onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Method</label>
                  <select
                    className="select"
                    value={payoutForm.method}
                    onChange={(e) => setPayoutForm({ ...payoutForm, method: e.target.value })}
                  >
                    <option value="USDT_TRC20">USDT (TRC-20)</option>
                    <option value="USDT_ERC20">USDT (ERC-20)</option>
                    <option value="BITCOIN">Bitcoin</option>
                    <option value="BKASH">bKash</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>
                <div className="field">
                  <label>Wallet / Account</label>
                  <input
                    className="input mono"
                    required
                    placeholder="Address or account number"
                    value={payoutForm.details}
                    onChange={(e) => setPayoutForm({ ...payoutForm, details: e.target.value })}
                  />
                </div>
                <div className="row" style={{ gap: 10, marginTop: 18 }}>
                  <button type="submit" className="btn btn-gold btn-block" disabled={payoutBusy}>
                    {payoutBusy ? "..." : "Submit"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setPayoutModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .affiliate { display: grid; gap: 16px; }
        .head { padding: 24px; }
        .head h1 { margin: 0 0 8px; font-size: clamp(20px, 3vw, 28px); }
        .head p { margin: 0 0 18px; font-size: 14px; }
        .link-box { padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.4); border: 1px solid var(--stroke); display: grid; gap: 8px; }
        .link-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .link-text { flex: 1; padding: 8px 12px; background: rgba(255,255,255,0.04); border-radius: 8px; font-size: 13px; color: var(--gold-1); overflow-x: auto; white-space: nowrap; }
        .code-badge { font-size: 12px; color: var(--dim); }
        .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .stat-card { padding: 18px; display: grid; gap: 5px; }
        .stat-card span { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
        .stat-card strong { font-size: 22px; }
        .gold-border { border-color: rgba(245,197,66,0.35); }
        .panel { padding: 18px; }
        .legend { display: flex; gap: 14px; font-size: 11px; color: var(--muted); flex-wrap: wrap; }
        .legend span { display: inline-flex; align-items: center; gap: 5px; }
        .legend .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
        .dot.click { background: #00f2fe; }
        .dot.ref { background: #f2b84b; }
        .dot.comm { background: #10b981; }
        .chart-frame { height: 220px; }
        .chart-empty { height: 220px; display: grid; place-items: center; align-content: center; gap: 6px; text-align: center; border: 1.5px dashed rgba(255,255,255,0.08); border-radius: 12px; }
        .chart-empty p { margin: 0; font-size: 14px; font-weight: 600; color: var(--text); }
        .chart-empty span { font-size: 12px; color: var(--dim); max-width: 360px; line-height: 1.6; }
        .tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--stroke); padding-bottom: 12px; margin-bottom: 14px; flex-wrap: wrap; }
        .tab { padding: 7px 14px; border-radius: 9px; border: 1px solid var(--stroke); background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 600; }
        .tab.active { background: rgba(245,197,66,0.16); color: var(--gold-1); border-color: rgba(245,197,66,0.45); }
        .scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); display: grid; place-items: center; z-index: 120; padding: 18px; }
        .modal { width: min(420px, 100%); padding: 22px; }
        .modal h3 { margin: 0 0 14px; }
        @media (max-width: 600px) { .link-row { flex-direction: column; } .cards-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}
