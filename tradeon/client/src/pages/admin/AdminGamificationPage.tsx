/**
 * AdminGamificationPage — 1:1 port of legacy src/app/nexa-admin-portal/gamification/page.jsx.
 * Tournaments and VIP tiers: full CRUD.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, money, fmtDate } from '@/lib/apiClient';
import { useLiveEvents } from '@/lib/realtimeClient';
import { alert } from '@/lib/useAlertStore';
import PageHeader from '@/components/admin/PageHeader';

const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const BLANK_T = () => ({
  name: '', description: '', entryFee: 10, guaranteed: 100, accountType: 'DEMO',
  maxPlayers: 0, prizeSplit: '50,30,20',
  startsAt: isoLocal(new Date()), endsAt: isoLocal(new Date(Date.now() + 7 * 864e5)),
});

const BLANK_TIER = { name: '', minVolume: 0, payoutBonus: 0, cashbackPct: 0, color: '#00f2fe', perks: '', sortOrder: 10 };

export default function AdminGamificationPage() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [tForm, setTForm] = useState<any>(null);
  const [tierForm, setTierForm] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, v] = await Promise.all([api('/api/admin/tournaments'), api('/api/admin/tiers')]);
      setTournaments(t.tournaments || []);
      setTiers(v.tiers || []);
    } catch (err: any) {
      alert.critical(err.message, { title: 'Gamification data unavailable' });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useLiveEvents({ scope: 'admin', onEvent: (e: any) => { if (['tournaments', 'tiers'].includes(e.topic)) load(); } });

  const flash = (kind: string, text: string) => (kind === 'ok' ? alert.success(text) : alert.critical(text));

  const saveTournament = async () => {
    const ok = await alert.confirm({
      severity: 'warning',
      title: tForm.id ? 'Publish tournament changes?' : 'Publish this tournament?',
      message: `"${tForm.name || 'Untitled'}" · entry ${money(Number(tForm.entryFee))} · ${tForm.accountType} — ${tForm.id ? 'changes are' : 'it is'} visible in every lobby immediately.`,
      confirmLabel: 'Confirm & publish',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const payload = {
        ...tForm,
        entryFee: Number(tForm.entryFee),
        guaranteed: Number(tForm.guaranteed),
        maxPlayers: Number(tForm.maxPlayers),
        prizeSplit: String(tForm.prizeSplit).split(',').map((n: string) => Number(n.trim())).filter((n: number) => n > 0),
      };
      if (tForm.id) {
        await api(`/api/admin/tournaments/${tForm.id}`, { method: 'PATCH', body: payload });
        flash('ok', 'Tournament updated and broadcast.');
      } else {
        await api('/api/admin/tournaments', { method: 'POST', body: payload });
        flash('ok', 'Tournament created — it is already visible in every lobby.');
      }
      setTForm(null);
      load();
    } catch (err: any) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (t: any, action: string, confirmText: string) => {
    if (confirmText) {
      const ok = await alert.confirm({
        severity: action === 'delete' || action === 'cancel' ? 'critical' : 'warning',
        title: `${action.charAt(0).toUpperCase() + action.slice(1)} "${t.name}"?`,
        message: confirmText,
        confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
        cancelLabel: 'Back',
      });
      if (!ok) return;
    }
    try {
      if (action === 'delete') await api(`/api/admin/tournaments/${t.id}`, { method: 'DELETE' });
      else await api(`/api/admin/tournaments/${t.id}`, { method: 'PATCH', body: { action } });
      flash('ok', `Tournament ${action === 'delete' ? 'deleted' : action + 'ed'}.`);
      load();
    } catch (err: any) {
      flash('error', err.message);
    }
  };

  const saveTier = async () => {
    const ok = await alert.confirm({
      severity: 'warning',
      title: tierForm.id ? `Publish ${tierForm.name} tier changes?` : 'Create this VIP tier?',
      message: `Payout bonus +${Number(tierForm.payoutBonus)}% · cashback ${Number(tierForm.cashbackPct)}% · from ${money(Number(tierForm.minVolume), 0)} volume — applies to every member's NEXT trade, live.`,
      confirmLabel: 'Confirm & publish',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const payload = {
        ...tierForm,
        minVolume: Number(tierForm.minVolume),
        payoutBonus: Number(tierForm.payoutBonus),
        cashbackPct: Number(tierForm.cashbackPct),
        sortOrder: Number(tierForm.sortOrder),
      };
      if (tierForm.id) {
        await api(`/api/admin/tiers/${tierForm.id}`, { method: 'PATCH', body: payload });
        flash('ok', 'Tier updated — new payout bonus applies to the next trade.');
      } else {
        await api('/api/admin/tiers', { method: 'POST', body: payload });
        flash('ok', 'Tier created.');
      }
      setTierForm(null);
      load();
    } catch (err: any) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteTier = async (tier: any) => {
    const ok = await alert.confirm({
      severity: 'critical',
      title: `Delete the ${tier.name} tier?`,
      message: 'Members drop to the lowest remaining tier immediately. This cannot be undone.',
      confirmLabel: 'Delete tier',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/tiers/${tier.id}`, { method: 'DELETE' });
      flash('ok', 'Tier deleted.');
      load();
    } catch (err: any) {
      flash('error', err.message);
    }
  };

  const toggleTier = async (tier: any) => {
    const enabling = !tier.isActive;
    const ok = await alert.confirm({
      severity: 'warning',
      title: enabling ? `Enable the ${tier.name} tier?` : `Disable the ${tier.name} tier?`,
      message: enabling
        ? `Members on ${tier.name} immediately get +${Number(tier.payoutBonus)}% payout bonus and ${Number(tier.cashbackPct)}% cashback — live on their next trade.`
        : `Members currently on ${tier.name} drop to the next available tier immediately and lose their payout bonus on the next trade.`,
      confirmLabel: enabling ? 'Enable & publish' : 'Disable & publish',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/tiers/${tier.id}`, { method: 'PATCH', body: { isActive: enabling } });
      flash('ok', `${tier.name} is now ${enabling ? 'LIVE' : 'OFF'} for all users.`);
      load();
    } catch (err: any) {
      flash('error', err.message);
    }
  };

  return (
    <div className="gami">
      <PageHeader eyebrow="Engagement" title="Tournaments &" highlight="VIP" subtitle="Competitions, prize pools & loyalty tiers" />

      <section className="glass gami-panel gami-head">
        <div>
          <h3>Tournaments</h3>
          <p className="muted gami-small">Entry fees accumulate into the pool automatically; finishing pays the split out to the standings.</p>
        </div>
        <button className="btn btn-gold" onClick={() => setTForm(BLANK_T())}>+ New tournament</button>
      </section>

      <section className="glass gami-panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Entry</th><th>Pool</th><th>Players</th><th>Window</th><th className="right">Actions</th></tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong><br /><span className="dim">{t.accountType} · split {t.prizeSplit.join('/')}</span></td>
                  <td><span className={`badge ${t.status === 'LIVE' ? 'badge-up' : t.status === 'CANCELLED' ? 'badge-down' : 'badge-gold'}`}>{t.status}</span></td>
                  <td className="mono">{t.entryFee > 0 ? money(t.entryFee) : 'Free'}</td>
                  <td className="mono gold-text">{money(t.prizePool + t.guaranteed)}</td>
                  <td className="mono">{t.players}{t.maxPlayers > 0 ? `/${t.maxPlayers}` : ''}</td>
                  <td className="dim gami-sm">{fmtDate(t.startsAt)}<br />→ {fmtDate(t.endsAt)}</td>
                  <td className="right nowrap">
                    <button className="btn btn-sm btn-ghost" onClick={async () => setDetail(await api(`/api/admin/tournaments/${t.id}`))}>Standings</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setTForm({ ...t, prizeSplit: t.prizeSplit.join(','), startsAt: isoLocal(new Date(t.startsAt)), endsAt: isoLocal(new Date(t.endsAt)) })}>Edit</button>
                    {t.status !== 'FINISHED' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => act(t, 'finish', `Finish ${t.name} now and pay out ${money(t.prizePool + t.guaranteed)}?`)}>Finish & pay</button>
                    )}
                    <button className="btn btn-sm btn-ghost gami-danger" onClick={() => act(t, 'delete', `Delete ${t.name}? Entry fees are refunded.`)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!tournaments.length && <tr><td colSpan={7} className="empty">No tournaments yet — create the first one.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass gami-panel gami-head">
        <div>
          <h3>VIP tiers</h3>
          <p className="muted gami-small">Volume-based ladder. The payout bonus is added to every market's base payout for members of the tier.</p>
        </div>
        <button className="btn btn-gold" onClick={() => setTierForm({ ...BLANK_TIER })}>+ New tier</button>
      </section>

      <section className="glass gami-panel">
        <div className="tier-grid">
          {tiers.map((t) => (
            <div key={t.id} className="tier" style={{ borderColor: `${t.color}55` }}>
              <div className="row-between">
                <strong style={{ color: t.color }}>{t.name}</strong>
                <span className={`badge ${t.isActive ? 'badge-up' : 'badge-down'}`}>{t.isActive ? 'ACTIVE' : 'OFF'}</span>
              </div>
              <div className="mono big">+{t.payoutBonus}% payout</div>
              <span className="dim">from {money(t.minVolume)} 30-day volume · {t.cashbackPct}% cashback</span>
              <p className="dim gami-sm">{t.perks || '—'}</p>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setTierForm({ ...t })}>Edit</button>
                <button className="btn btn-sm btn-ghost" onClick={() => toggleTier(t)}>{t.isActive ? 'Disable' : 'Enable'}</button>
                <button className="btn btn-sm btn-ghost gami-danger" onClick={() => deleteTier(t)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {tForm && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTForm(null)}>
            <motion.div className="glass gami-modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h3>{tForm.id ? 'Edit tournament' : 'New tournament'}</h3>
              <div className="field"><label>Name</label><input className="input" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} /></div>
              <div className="field"><label>Description</label><input className="input" value={tForm.description} onChange={(e) => setTForm({ ...tForm, description: e.target.value })} /></div>
              <div className="gami-grid2">
                <div className="field"><label>Entry fee ($)</label><input className="input mono" type="number" min="0" value={tForm.entryFee} onChange={(e) => setTForm({ ...tForm, entryFee: e.target.value })} /></div>
                <div className="field"><label>Guaranteed pool ($)</label><input className="input mono" type="number" min="0" value={tForm.guaranteed} onChange={(e) => setTForm({ ...tForm, guaranteed: e.target.value })} /></div>
                <div className="field"><label>Account type</label>
                  <select className="input" value={tForm.accountType} onChange={(e) => setTForm({ ...tForm, accountType: e.target.value })}>
                    <option value="DEMO">Demo</option><option value="REAL">Real</option>
                  </select>
                </div>
                <div className="field"><label>Max players (0 = unlimited)</label><input className="input mono" type="number" min="0" value={tForm.maxPlayers} onChange={(e) => setTForm({ ...tForm, maxPlayers: e.target.value })} /></div>
                <div className="field"><label>Prize split (%)</label><input className="input mono" value={tForm.prizeSplit} onChange={(e) => setTForm({ ...tForm, prizeSplit: e.target.value })} /></div>
                <div className="field"><label>Starts</label><input className="input" type="datetime-local" value={tForm.startsAt} onChange={(e) => setTForm({ ...tForm, startsAt: e.target.value })} /></div>
                <div className="field"><label>Ends</label><input className="input" type="datetime-local" value={tForm.endsAt} onChange={(e) => setTForm({ ...tForm, endsAt: e.target.value })} /></div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-gold btn-block" disabled={busy} onClick={saveTournament}>{busy ? 'Saving…' : 'Save & broadcast'}</button>
                <button className="btn btn-ghost" onClick={() => setTForm(null)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tierForm && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTierForm(null)}>
            <motion.div className="glass gami-modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h3>{tierForm.id ? `Edit ${tierForm.name}` : 'New VIP tier'}</h3>
              <div className="gami-grid2">
                <div className="field"><label>Name</label><input className="input" value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} /></div>
                <div className="field"><label>Colour</label><input className="input" type="color" value={tierForm.color} onChange={(e) => setTierForm({ ...tierForm, color: e.target.value })} /></div>
                <div className="field"><label>Minimum 30-day volume ($)</label><input className="input mono" type="number" min="0" value={tierForm.minVolume} onChange={(e) => setTierForm({ ...tierForm, minVolume: e.target.value })} /></div>
                <div className="field"><label>Payout bonus (points)</label><input className="input mono" type="number" min="0" max="30" value={tierForm.payoutBonus} onChange={(e) => setTierForm({ ...tierForm, payoutBonus: e.target.value })} /></div>
                <div className="field"><label>Cashback (%)</label><input className="input mono" type="number" min="0" value={tierForm.cashbackPct} onChange={(e) => setTierForm({ ...tierForm, cashbackPct: e.target.value })} /></div>
                <div className="field"><label>Sort order</label><input className="input mono" type="number" value={tierForm.sortOrder} onChange={(e) => setTierForm({ ...tierForm, sortOrder: e.target.value })} /></div>
              </div>
              <div className="field"><label>Perks</label><input className="input" value={tierForm.perks} onChange={(e) => setTierForm({ ...tierForm, perks: e.target.value })} /></div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-gold btn-block" disabled={busy} onClick={saveTier}>{busy ? 'Saving…' : 'Save tier'}</button>
                <button className="btn btn-ghost" onClick={() => setTierForm(null)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detail && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetail(null)}>
            <motion.div className="glass gami-modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="row-between"><h3>{detail.tournament.name}</h3><button className="btn btn-sm btn-ghost" onClick={() => setDetail(null)}>Close</button></div>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>#</th><th>Player</th><th>P/L</th><th>Trades</th><th>Win rate</th><th>Prize</th></tr></thead>
                  <tbody>
                    {detail.standings.map((s: any) => (
                      <tr key={s.userId}>
                        <td className="mono">{s.rank}</td><td>{s.name}</td>
                        <td className={`mono ${s.pnl >= 0 ? 'up' : 'down'}`}>{money(s.pnl)}</td>
                        <td className="mono">{s.trades}</td><td className="mono">{s.winRate}%</td>
                        <td className="mono gold-text">{s.prize > 0 ? money(s.prize) : '—'}</td>
                      </tr>
                    ))}
                    {!detail.standings.length && <tr><td colSpan={6} className="empty">No entries yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
