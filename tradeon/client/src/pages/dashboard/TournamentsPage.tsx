// @ts-nocheck

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '@/components/dashboard/SessionProvider';
import { useLiveEvents } from '@/lib/realtimeClient';
import { api, money, fmtDate } from '@/lib/apiClient';
import { useCachedApi } from '@/lib/useCachedApi';

const STATUS_BADGE = { LIVE: 'badge-up', SCHEDULED: 'badge-gold', FINISHED: '', CANCELLED: 'badge-down' };

/* Spec §2.3 — tier names use foil gradients, never a new solid hue */
const tierFoil = (name) => {
  const n = String(name || '').toUpperCase();
  if (n === 'GOLD') return 'foil-gold';
  if (n === 'VIP' || n === 'PLATINUM') return 'foil-vip';
  return null;
};
const tierBorder = (name) => {
  const n = String(name || '').toUpperCase();
  if (n === 'GOLD') return 'foil-border-gold';
  if (n === 'VIP' || n === 'PLATINUM') return 'foil-border-vip';
  return null;
};

/**
 * Tournaments & VIP ladder (Module 3.2) — entry fees feed an automated prize
 * pool that is paid out to the top of the standings when the clock runs out.
 */
export default function TournamentsPage() {
  const { user, refresh } = useSession();
  const { data: tData, refresh: refreshT } = useCachedApi('/api/tournaments', () => api('/api/tournaments'));
  const { data: vData, refresh: refreshV } = useCachedApi('/api/vip', () => api('/api/vip'));
  const [tournaments, setTournaments] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [vip, setVip] = useState({ tiers: [], me: null });
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (tData) { setTournaments(tData.tournaments || []); setEnabled(tData.enabled); }
  }, [tData]);
  useEffect(() => { if (vData) setVip(vData); }, [vData]);

  useEffect(() => {
    const t = setInterval(() => { refreshT(); refreshV(); }, 30_000);
    return () => clearInterval(t);
  }, [refreshT, refreshV]);

  useLiveEvents({
    onEvent: (e) => {
      if (['tournaments', 'tiers', 'tier', 'balance'].includes(e.topic)) { refreshT(); refreshV(); }
    },
  });

  const openDetail = async (id) => {
    setOpenId(id);
    setDetail(null);
    try {
      setDetail(await api(`/api/tournaments/${id}`));
    } catch (err) {
      setToast({ kind: 'error', text: err.message });
    }
  };

  useEffect(() => {
    if (!openId) return undefined;
    const t = setInterval(() => api(`/api/tournaments/${openId}`).then(setDetail).catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, [openId]);

  const join = async (t) => {
    setBusy(t.id);
    try {
      await api('/api/tournaments', { method: 'POST', body: { tournamentId: t.id } });
      setToast({ kind: 'ok', text: `You are in — ${t.name}. Every trade you place now counts.` });
      refresh();
      load();
    } catch (err) {
      setToast({ kind: 'error', text: err.message });
    } finally {
      setBusy('');
      setTimeout(() => setToast(null), 4500);
    }
  };

  const me = vip.me;

  return (
    <div className="tour">
      <header className="glass head">
        <div>
          <h1>Tournaments &amp; VIP</h1>
          <p className="muted">
            Compete for automated prize pools and climb the volume ladder for permanently higher payouts.
          </p>
        </div>
      </header>

      {/* ── VIP ladder (Spec §2.5 — the ONE animated conic border on this screen) ── */}
      <section className="glass card vip-status conic-border">
        <h2>Your VIP status</h2>
        {me?.tier ? (
          <>
            <div className="vip-now">
              <div className={`tier-badge ${tierFoil(me.tier.name) || ''}`}>
                <span className={tierFoil(me.tier.name) ? 'foil-text' : ''}>{me.tier.name}</span>
              </div>
              <div className="grow">
                <div className="row-between">
                  <span className="dim">30-day volume</span>
                  <strong className="mono">{money(me.volume)}</strong>
                </div>
                <div className="vip-progress">
                  <motion.div
                    className="fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, me.progress || 0)}%` }}
                    transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                  />
                </div>
                <span className="dim sm">
                  {me.next
                    ? `${money(Math.max(0, me.next.minVolume - me.volume))} more volume to reach ${me.next.name} (+${me.next.payoutBonus}% payout)`
                    : 'Top tier reached — maximum payout bonus active.'}
                </span>
              </div>
              <div className="bonus">
                <span>Payout bonus</span>
                <strong className="gold-text">+{me.tier.payoutBonus}%</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="empty">Place your first trade to enter the VIP ladder.</div>
        )}

        <div className="tiers">
          {vip.tiers.map((t) => {
            const foil = tierFoil(t.name);
            const border = tierBorder(t.name);
            const current = me?.tier?.id === t.id;
            return (
              <div key={t.id} className={`tier ${border || ''} ${current ? 'current' : ''}`}>
                <strong className={`${foil ? `${foil} foil-text` : ''}`}>{t.name}</strong>
                <span className="dim">from {money(t.minVolume)} volume</span>
                <div className="perk">+{t.payoutBonus}% payout · {t.cashbackPct}% cashback</div>
                <p className="dim sm">{t.perks}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── tournaments ── */}
      <section className="glass card">
        <h2>Tournament lobby</h2>
        {!enabled && <div className="alert alert-warn">Tournaments are currently disabled by the platform.</div>}
        {!tournaments.length && <div className="empty">No tournaments scheduled right now — check back soon.</div>}

        <div className="lobby">
          {tournaments.map((t) => (
            <motion.article key={t.id} className="event" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="event-top">
                <div>
                  <strong>{t.name}</strong>
                  <span className="dim">{t.description || 'Highest net P/L wins.'}</span>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
              </div>

              <div className="event-grid">
                <div><span>Prize pool</span><strong className="gold-text">{money(t.prizePool + t.guaranteed)}</strong></div>
                <div><span>Entry</span><strong>{t.entryFee > 0 ? money(t.entryFee) : 'Free'}</strong></div>
                <div><span>Account</span><strong>{t.accountType}</strong></div>
                <div><span>Players</span><strong className="mono">{t.players}{t.maxPlayers > 0 ? ` / ${t.maxPlayers}` : ''}</strong></div>
                <div><span>Ends</span><strong className="sm">{fmtDate(t.endsAt)}</strong></div>
              </div>

              <div className="event-act">
                <button className="btn btn-sm btn-ghost" onClick={() => openDetail(t.id)}>Standings</button>
                {t.joined ? (
                  <span className="badge badge-up">JOINED</span>
                ) : (
                  <button
                    className="btn btn-sm btn-gold"
                    disabled={!enabled || busy === t.id || !['LIVE', 'SCHEDULED'].includes(t.status)}
                    onClick={() => join(t)}
                  >
                    {busy === t.id ? 'Joining…' : t.entryFee > 0 ? `Join · ${money(t.entryFee)}` : 'Join free'}
                  </button>
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {openId && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpenId(null)}>
            <motion.div className="glass modal" initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="row-between">
                <h3>{detail?.tournament?.name || 'Standings'}</h3>
                <button className="btn btn-sm btn-ghost" onClick={() => setOpenId(null)}>Close</button>
              </div>
              {!detail && <div className="empty">Loading standings…</div>}
              {detail && (
                <>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    Prize pool {money(detail.tournament.prizePool + detail.tournament.guaranteed)} · split{' '}
                    {detail.tournament.prizeSplit.map((s) => `${s}%`).join(' / ')} · ends {fmtDate(detail.tournament.endsAt)}
                  </p>
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>#</th><th>Player</th><th>P/L</th><th>Win rate</th><th>Trades</th><th>Prize</th></tr></thead>
                      <tbody>
                        {detail.standings.map((s) => (
                          <tr key={s.userId} className={s.userId === user?.id ? 'me-row' : ''}>
                            <td className="mono">{s.rank}</td>
                            <td>{s.name}{s.userId === user?.id && <em className="me"> you</em>}</td>
                            <td className={`mono ${s.pnl >= 0 ? 'up' : 'down'}`}>{money(s.pnl)}</td>
                            <td className="mono">{s.winRate}%</td>
                            <td className="mono">{s.trades}</td>
                            <td className="mono gold-text">{s.prize > 0 ? money(s.prize) : '—'}</td>
                          </tr>
                        ))}
                        {!detail.standings.length && <tr><td colSpan={6} className="empty">No entries yet.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div className={`toast ${toast.kind}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .tour { display: grid; gap: 14px; }
        .head { padding: 18px; }
        .head h1 { margin: 0 0 4px; font-size: 21px; }
        .head p { margin: 0; font-size: 12.8px; }
        .card { padding: 18px; }
        .card h2 { margin: 0 0 14px; font-size: 15.5px; }
        .vip-now { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 14px; border-radius: 13px; background: rgba(0,0,0,0.28); border: 1px solid var(--stroke); }
        .tier-badge { padding: 9px 16px; border-radius: 11px; font-weight: 800; letter-spacing: 1.5px; font-size: 13px; padding: 2px; }
        .tier-badge > span { display: block; padding: 8px 14px; border-radius: 10px; background: rgba(8,11,17,0.6); font-size: 13px; font-weight: 800; letter-spacing: 1.5px; }
        .tier-badge.foil-gold { background: linear-gradient(135deg, #caa153, #f2d38a, #caa153); }
        .tier-badge.foil-vip { background: linear-gradient(135deg, #6b7280, #e5e7eb, #6b7280); }
        .grow { flex: 1; min-width: 220px; }
        .vip-progress { margin: 8px 0 6px; }
        .sm { font-size: 11.2px; }
        .bonus { text-align: right; }
        .bonus span { display: block; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
        .bonus strong { font-size: 21px; }
        .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 14px; }
        .tier { padding: 13px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--stroke); }
        .tier.current { box-shadow: 0 0 0 1px rgba(242,184,75,0.45), 0 0 26px -8px rgba(242,184,75,0.5); }
        .tier strong { display: block; font-size: 14px; letter-spacing: 1px; }
        .tier span { font-size: 11px; }
        .tier strong.foil-text { color: transparent; }
        .perk { font-size: 12px; margin: 7px 0 4px; }
        .tier p { margin: 0; font-size: 11px; line-height: 1.5; }
        .lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
        .event { padding: 15px; border-radius: 13px; background: rgba(255,255,255,0.03); border: 1px solid var(--stroke); display: grid; gap: 12px; }
        .event-top { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
        .event-top strong { display: block; font-size: 14.5px; }
        .event-top span { font-size: 11.5px; }
        .event-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(86px, 1fr)); gap: 10px; }
        .event-grid span { display: block; font-size: 9.6px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--dim); }
        .event-grid strong { font-size: 14px; }
        .event-grid .sm { font-size: 11.5px; }
        .event-act { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .scrim { position: fixed; inset: 0; background: rgba(3,6,12,0.72); backdrop-filter: blur(6px); display: grid; place-items: center; z-index: 120; padding: 18px; }
        .modal { width: min(680px, 100%); max-height: 84vh; overflow-y: auto; padding: 20px; }
        .modal h3 { margin: 0; font-size: 17px; }
        .me { font-style: normal; color: var(--gold-1); font-size: 10.5px; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 200; padding: 13px 22px; border-radius: 12px; font-size: 13.5px; font-weight: 600; backdrop-filter: blur(14px); border: 1px solid; }
        .toast.ok { background: rgba(22,199,132,0.16); border-color: rgba(22,199,132,0.5); color: #7cf0c0; }
        .toast.error { background: rgba(234,57,67,0.16); border-color: rgba(234,57,67,0.5); color: #ff9aa0; }
      `}</style>
    </div>
  );
}
