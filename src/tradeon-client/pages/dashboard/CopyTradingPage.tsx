// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "@/tradeon-client/lib/nextDynamic";
import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp } from "lucide-react";

// Recharts is only needed for the trader profile equity curve — lazy-load it so
// the leaderboard ships without the charting package.
const EquityArea = dynamic(() => import("@/tradeon-client/components/charts/EquityArea"), {
  ssr: false,
  loading: () => <div className="chart-empty" aria-hidden="true" />,
});
import { useSession } from "@/tradeon-client/components/dashboard/SessionProvider";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";
import { api, money, timeAgo } from "@/tradeon-client/lib/apiClient";
import { useCachedApi } from "@/tradeon-client/lib/useCachedApi";
import { getCached, setCached } from "@/tradeon-client/lib/apiCache";

/* Spec §6.3 — foil rank medals for #1–#3 (gold / silver / bronze) */
const MEDALS = { 1: "foil-gold", 2: "foil-vip", 3: "foil-bronze" };
function RankMedal({ rank }) {
  const foil = MEDALS[rank];
  if (!foil) return <div className="rank-num">#{rank}</div>;
  return (
    <div className={`rank-medal ${foil}`}>
      <span className="medal-inner">#{rank}</span>
    </div>
  );
}

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/**
 * Social trading (Module 3.1): a live leaderboard of real platform
 * performance, and one-tap auto-copy of any trader on it.
 */
export default function CopyTradingPage() {
  const { user } = useSession();
  const [days, setDays] = useState(30);
  const boardKey = `/api/social/leaderboard?days=${days}&limit=50`;
  const { data: board, refresh: refreshBoard } = useCachedApi(boardKey, () => api(boardKey), {
    deps: [days],
  });
  const safeBoard = board || {
    traders: [],
    following: [],
    enabled: true,
    copyTradingEnabled: true,
  };
  const copyKey = "/api/social/copy";
  const { data: copyData, refresh: refreshCopy } = useCachedApi(copyKey, () => api(copyKey));
  const [links, setLinks] = useState([]);
  const [target, setTarget] = useState(null);
  const [profile, setProfile] = useState(null); // { trader, loading } — profile drawer
  const [form, setForm] = useState({
    mode: "RATIO",
    ratio: 50,
    fixedStake: 5,
    maxStake: 50,
    accountType: "DEMO",
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  /* Spec §6.3 — trader profile drawer with real equity curve (7d/30d/90d) */
  const openProfile = useCallback(async (t, range = 30) => {
    const profileKey = `/api/social/trader?id=${t.userId}&days=${range}`;
    // Show cached data instantly if available
    const cached = getCached(profileKey);
    if (cached?.trader) {
      setProfile({ trader: { ...t, ...cached.trader }, range, loading: false });
    } else {
      setProfile({ trader: t, range, loading: true });
    }
    try {
      const d = await api(profileKey);
      setProfile({ trader: { ...t, ...(d.trader || {}) }, range, loading: false });
      setCached(profileKey, d, 60_000);
    } catch {
      setProfile({ trader: t, range, loading: false });
    }
  }, []);

  // Sync copy links from cached data
  useEffect(() => {
    if (copyData?.following) setLinks(copyData.following);
  }, [copyData]);

  const load = refreshBoard;

  useEffect(() => {
    const t = setInterval(() => {
      refreshBoard();
    }, 30_000);
    return () => clearInterval(t);
  }, [refreshBoard]);

  useLiveEvents({
    onEvent: (e) => {
      if (["trade", "copy", "leaderboard", "settings"].includes(e.topic)) refreshBoard();
      if (e.topic === "copy") refreshCopy();
    },
  });

  const followingMap = useMemo(
    () => Object.fromEntries(links.map((l) => [l.leaderId, l])),
    [links],
  );

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await api("/api/social/copy", {
        method: "POST",
        body: {
          leaderId: target.userId,
          mode: form.mode,
          ratio: Number(form.ratio),
          fixedStake: Number(form.fixedStake),
          maxStake: Number(form.maxStake),
          accountType: form.accountType,
        },
      });
      setCached(copyKey, res);
      setLinks(res.following);
      setToast({
        kind: "ok",
        text: `Now auto-copying ${target.name}. New positions mirror instantly.`,
      });
      setTarget(null);
      load();
    } catch (err) {
      setToast({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 4500);
    }
  };

  const stop = async (leaderId) => {
    try {
      const res = await api(`/api/social/copy?leaderId=${leaderId}`, { method: "DELETE" });
      setCached(copyKey, res);
      setLinks(res.following);
      setToast({ kind: "ok", text: "Copy trading stopped." });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ kind: "error", text: err.message });
    }
  };

  const toggle = async (link) => {
    const res = await api("/api/social/copy", {
      method: "PATCH",
      body: { leaderId: link.leaderId, isActive: !link.isActive },
    });
    setCached(copyKey, res);
    setLinks(res.following);
  };

  return (
    <div className="social">
      <header className="glass head">
        <div>
          <h1>Social &amp; copy trading</h1>
          <p className="muted">
            Rankings are computed from settled trades on this platform — nothing is simulated.
            Follow a trader and every position they open is mirrored into your account within a
            second.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              className={`tf ${days === w.days ? "active" : ""}`}
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      {!safeBoard.copyTradingEnabled && (
        <div className="alert alert-warn">
          Copy trading is temporarily disabled by the platform.
        </div>
      )}

      {links.length > 0 && (
        <section className="glass card">
          <h2>
            You are copying {links.length} trader{links.length > 1 ? "s" : ""}
          </h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Trader</th>
                  <th>Sizing</th>
                  <th>Account</th>
                  <th>Copied</th>
                  <th>P/L</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.leaderName || l.leaderId.slice(0, 8)}</strong>
                    </td>
                    <td className="mono">
                      {l.mode === "FIXED" ? `${money(l.fixedStake)} fixed` : `${l.ratio}% of stake`}{" "}
                      · max {money(l.maxStake)}
                    </td>
                    <td>
                      <span className="badge">{l.accountType}</span>
                    </td>
                    <td className="mono">{l.copied}</td>
                    <td className={`mono ${l.pnl >= 0 ? "up" : "down"}`}>{money(l.pnl)}</td>
                    <td>
                      <span className={`badge ${l.isActive ? "badge-up" : ""}`}>
                        {l.isActive ? "ACTIVE" : "PAUSED"}
                      </span>
                    </td>
                    <td className="right">
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(l)}>
                        {l.isActive ? "Pause" : "Resume"}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => stop(l.leaderId)}>
                        Stop
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="glass card">
        <h2>Global leaderboard</h2>
        {!safeBoard.traders.length && (
          <div className="empty">No trader has enough settled trades in this window yet.</div>
        )}
        <div className="board">
          {safeBoard.traders.map((t) => {
            const link = followingMap[t.userId];
            return (
              <motion.article
                key={t.userId}
                className={`trader ${t.rank <= 3 ? "podium" : ""}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(t.rank * 0.02, 0.3) }}
              >
                <RankMedal rank={t.rank} />
                <div className="who">
                  <strong>
                    {t.name} {t.isMe && <em className="me">you</em>}
                  </strong>
                  <span className="dim">
                    {t.country || "—"} · {t.tier} · {t.followers} follower
                    {t.followers === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="metric">
                  <span>Win rate</span>
                  <strong className={t.winRate >= 50 ? "up" : ""}>{t.winRate}%</strong>
                </div>
                <div className="metric">
                  <span>Net P/L</span>
                  <strong className={t.pnl >= 0 ? "up" : "down"}>{money(t.pnl)}</strong>
                </div>
                <div className="metric hide-sm">
                  <span>Volume</span>
                  <strong className="mono">{money(t.volume)}</strong>
                </div>
                <div className="metric hide-sm">
                  <span>Trades</span>
                  <strong className="mono">{t.trades}</strong>
                </div>
                <div className="metric hide-sm">
                  <span>Last</span>
                  <strong className="mono sm">{timeAgo(t.lastTrade)}</strong>
                </div>
                <div className="act">
                  {t.isMe ? (
                    <span className="badge badge-gold">YOUR RANK</span>
                  ) : link ? (
                    <button className="btn btn-sm btn-ghost" onClick={() => stop(t.userId)}>
                      Copying ✓
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-gold"
                      disabled={!safeBoard.copyTradingEnabled}
                      onClick={() => openProfile(t)}
                    >
                      Copy
                    </button>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* Spec §6.3 — trader profile drawer (real equity curve) */}
      <AnimatePresence>
        {profile && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProfile(null)}
          >
            <motion.div
              className="glass modal profile-modal"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="profile-head">
                <div>
                  <h3>{profile.trader.name}</h3>
                  <span className="dim">
                    {profile.trader.country || "—"} · {profile.trader.tier} tier
                  </span>
                </div>
                <button className="icon-btn" onClick={() => setProfile(null)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="profile-chips">
                <div>
                  <span>Win rate</span>
                  <strong className="up">{profile.trader.winRate}%</strong>
                </div>
                <div>
                  <span>Net P/L</span>
                  <strong className={profile.trader.pnl >= 0 ? "up" : "down"}>
                    {money(profile.trader.pnl)}
                  </strong>
                </div>
                <div>
                  <span>Trades</span>
                  <strong className="mono">{profile.trader.trades}</strong>
                </div>
                <div>
                  <span>Volume</span>
                  <strong className="mono">{money(profile.trader.volume)}</strong>
                </div>
              </div>

              <div className="profile-range">
                {[7, 30, 90].map((r) => (
                  <button
                    key={r}
                    className={`tf ${profile.range === r ? "active" : ""}`}
                    onClick={() => openProfile(profile.trader, r)}
                  >
                    {r}d
                  </button>
                ))}
              </div>

              <div className="profile-chart">
                {profile.loading ? (
                  <div className="chart-empty">
                    <span className="spinner" />
                  </div>
                ) : profile.trader.equity && profile.trader.equity.length >= 2 ? (
                  <EquityArea
                    data={profile.trader.equity}
                    up={profile.trader.pnl >= 0}
                    domain={["dataMin", "dataMax"]}
                    gradientId="traderFill"
                    fillOpacity={0.3}
                  />
                ) : (
                  <div className="chart-empty">No settled-trade history in this window yet.</div>
                )}
              </div>

              <button
                className="btn btn-gold btn-block"
                style={{ marginTop: 14 }}
                onClick={() => {
                  setTarget(profile.trader);
                  setProfile(null);
                  setForm((f) => ({
                    ...f,
                    accountType: user?.kycStatus === "VERIFIED" ? f.accountType : "DEMO",
                  }));
                }}
              >
                <TrendingUp size={15} /> Start copying
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {target && (
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setTarget(null)}
          >
            <motion.div
              className="glass modal"
              initial={{ scale: 0.94, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Copy {target.name}</h3>
              <p className="muted" style={{ fontSize: 12.5 }}>
                {target.winRate}% win rate · {target.trades} trades · {money(target.pnl)} net over
                the window.
              </p>

              <div className="field">
                <label>Sizing mode</label>
                <div className="row" style={{ gap: 6 }}>
                  {["RATIO", "FIXED"].map((m) => (
                    <button
                      key={m}
                      className={`tf ${form.mode === m ? "active" : ""}`}
                      onClick={() => setForm({ ...form, mode: m })}
                    >
                      {m === "RATIO" ? "% of their stake" : "Fixed amount"}
                    </button>
                  ))}
                </div>
              </div>

              {form.mode === "RATIO" ? (
                <div className="field">
                  <label>Copy ratio — {form.ratio}% of every position they open</label>
                  <input
                    type="range"
                    min="5"
                    max="200"
                    step="5"
                    value={form.ratio}
                    onChange={(e) => setForm({ ...form, ratio: e.target.value })}
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Fixed stake per copied trade (USD)</label>
                  <input
                    className="input mono"
                    type="number"
                    min="1"
                    value={form.fixedStake}
                    onChange={(e) => setForm({ ...form, fixedStake: e.target.value })}
                  />
                </div>
              )}

              <div className="grid2">
                <div className="field">
                  <label>Max stake per trade</label>
                  <input
                    className="input mono"
                    type="number"
                    min="1"
                    value={form.maxStake}
                    onChange={(e) => setForm({ ...form, maxStake: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Account</label>
                  <select
                    className="input"
                    value={form.accountType}
                    onChange={(e) => setForm({ ...form, accountType: e.target.value })}
                  >
                    <option value="DEMO">Demo</option>
                    <option value="REAL" disabled={user?.kycStatus !== "VERIFIED"}>
                      Real {user?.kycStatus !== "VERIFIED" ? "(KYC required)" : ""}
                    </option>
                  </select>
                </div>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-gold btn-block" disabled={busy} onClick={submit}>
                  {busy ? "Starting…" : "Start copying"}
                </button>
                <button className="btn btn-ghost" onClick={() => setTarget(null)}>
                  Cancel
                </button>
              </div>
              <p className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>
                Copied positions are opened with your own balance and follow the same market
                conditions. You can pause or stop at any time; open positions run to expiry.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast ${toast.kind}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .social { display: grid; gap: 14px; }
        .head { display: flex; justify-content: space-between; gap: 18px; padding: 18px; flex-wrap: wrap; }
        .head h1 { margin: 0 0 4px; font-size: 21px; }
        .head p { margin: 0; max-width: 620px; font-size: 12.8px; }
        .card { padding: 18px; }
        .card h2 { margin: 0 0 14px; font-size: 15.5px; }
        .tf { padding: 7px 13px; border-radius: 9px; font-size: 12px; font-weight: 700; color: var(--muted); background: rgba(255,255,255,0.04); border: 1px solid var(--stroke); }
        .tf.active { background: rgba(245,197,66,0.18); color: var(--gold-1); border-color: rgba(245,197,66,0.45); }
        .board { display: grid; gap: 8px; }
        .trader {
          display: grid; grid-template-columns: 48px minmax(140px, 1.4fr) repeat(5, minmax(70px, 0.7fr)) 110px;
          align-items: center; gap: 10px; padding: 12px 14px; border-radius: 13px;
          background: rgba(255,255,255,0.03); border: 1px solid var(--stroke);
        }
        .trader.podium { border-color: rgba(245,197,66,0.32); background: linear-gradient(90deg, rgba(245,197,66,0.09), rgba(255,255,255,0.02)); }
        .rank-num { font-family: var(--mono); font-size: 15px; font-weight: 700; color: var(--muted); width: 48px; text-align: center; }
        .rank-medal {
          width: 48px; height: 32px; border-radius: 999px; display: grid; place-items: center;
          font-family: var(--mono); font-size: 14px; font-weight: 800; padding: 1px;
        }
        .rank-medal.foil-gold { background: linear-gradient(135deg, #caa153, #f2d38a, #caa153); box-shadow: 0 0 18px -4px rgba(242,184,75,0.6); }
        .rank-medal.foil-vip { background: linear-gradient(135deg, #6b7280, #e5e7eb, #6b7280); box-shadow: 0 0 14px -4px rgba(203,213,225,0.5); }
        .rank-medal.foil-bronze { background: linear-gradient(135deg, #8a5a3b, #c98a5e, #8a5a3b); box-shadow: 0 0 14px -4px rgba(201,138,94,0.5); }
        .rank-medal .medal-inner { background: rgba(8,11,17,0.85); border-radius: 999px; width: 100%; height: 100%; display: grid; place-items: center; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.4); }

        .profile-modal { width: min(460px, 100%); padding: 22px; }
        .profile-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .profile-head h3 { margin: 0 0 3px; font-size: 18px; }
        .profile-head span { font-size: 12px; }
        .icon-btn { border: 1px solid var(--stroke); background: rgba(255,255,255,0.04); color: var(--muted); border-radius: 9px; padding: 7px; display: grid; place-items: center; }
        .profile-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }
        .profile-chips div { padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--stroke); }
        .profile-chips span { display: block; font-size: 10px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--dim); }
        .profile-chips strong { font-size: 16px; font-family: var(--mono); }
        .profile-range { display: inline-flex; gap: 4px; }
        .profile-range .tf { padding: 6px 12px; font-size: 11.5px; }
        .profile-chart { height: 160px; margin-top: 12px; }
        .chart-empty { height: 160px; display: grid; place-items: center; color: var(--dim); font-size: 13px; }
        .who strong { display: block; font-size: 13.5px; }
        .who span { font-size: 10.8px; }
        .me { font-style: normal; font-size: 9.5px; background: rgba(245,197,66,0.2); color: var(--gold-1); padding: 1px 5px; border-radius: 5px; margin-left: 5px; }
        .metric span { display: block; font-size: 9.6px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--dim); }
        .metric strong { font-size: 13.5px; }
        .metric .sm { font-size: 11.5px; }
        .act { text-align: right; }
        .scrim { position: fixed; inset: 0; background: rgba(3,6,12,0.72); backdrop-filter: blur(6px); display: grid; place-items: center; z-index: 120; padding: 18px; }
        .modal { width: min(460px, 100%); padding: 22px; }
        .modal h3 { margin: 0 0 4px; font-size: 18px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .field { margin-top: 12px; }
        .field label { display: block; font-size: 11.5px; color: var(--muted); margin-bottom: 6px; }
        input[type='range'] { width: 100%; accent-color: #f5c542; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 200; padding: 13px 22px; border-radius: 12px; font-size: 13.5px; font-weight: 600; backdrop-filter: blur(14px); border: 1px solid; }
        .toast.ok { background: rgba(22,199,132,0.16); border-color: rgba(22,199,132,0.5); color: #7cf0c0; }
        .toast.error { background: rgba(234,57,67,0.16); border-color: rgba(234,57,67,0.5); color: #ff9aa0; }
        @media (max-width: 1080px) {
          .trader { grid-template-columns: 40px 1fr 80px 90px 100px; }
        }
        @media (max-width: 620px) {
          .trader { grid-template-columns: 34px 1fr 90px; row-gap: 6px; }
          .act { grid-column: 1 / -1; text-align: left; }
          .grid2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
