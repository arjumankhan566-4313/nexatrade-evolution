/**
 * AdminPromosPage — Promo code management.
 * List, create, toggle and edit promo codes. Backend: /api/admin/promos.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, money, fmtDate } from '@/tradeon-client/lib/apiClient';
import { alert } from '@/tradeon-client/lib/useAlertStore';
import { useLiveEvents } from '@/tradeon-client/lib/realtimeClient';
import PageHeader from '@/tradeon-client/components/admin/PageHeader';

const BLANK = { code: '', bonus_type: 'DEMO', amount: '', max_uses: '100', expires_at: '' };

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>(BLANK);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d: any = await api('/api/admin/promos');
      setPromos(d.promos || []);
    } catch (err: any) {
      alert.critical(err.message, { title: 'Promos unavailable' });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useLiveEvents({ scope: 'admin', onEvent: (e: any) => { if (e.topic === 'settings') load(); } });

  const create = async () => {
    const ok = await alert.confirm({
      severity: 'warning',
      title: 'Create this promo code?',
      message: `${String(form.code).toUpperCase()} — ${form.bonus_type} bonus of $${form.amount} — becomes redeemable immediately.`,
      confirmLabel: 'Confirm & publish',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api('/api/admin/promos', {
        method: 'POST',
        body: {
          code: form.code,
          bonus_type: form.bonus_type,
          amount: Number(form.amount),
          max_uses: Number(form.max_uses),
          expires_at: form.expires_at || null,
        },
      });
      alert.success('Promo code created and live.');
      setForm(BLANK);
      setShowForm(false);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: 'Promo NOT created' });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: any) => {
    const hiding = p.is_active;
    const ok = await alert.confirm({
      severity: hiding ? 'critical' : 'warning',
      title: hiding ? `Deactivate ${p.code}?` : `Activate ${p.code}?`,
      message: hiding
        ? 'This promo code can no longer be redeemed. Existing redemptions are unaffected.'
        : 'This promo code becomes redeemable immediately.',
      confirmLabel: hiding ? 'Deactivate' : 'Activate',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/promos/${p.id}`, { method: 'PUT', body: { is_active: !p.is_active } });
      alert.success(`${p.code} ${hiding ? 'deactivated' : 'activated'}.`);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: 'Change NOT applied' });
    }
  };

  const updateMaxUses = async (p: any, val: string) => {
    try {
      await api(`/api/admin/promos/${p.id}`, { method: 'PUT', body: { max_uses: Number(val) } });
      alert.success(`${p.code} max uses updated to ${val}.`);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: 'Update failed' });
    }
  };

  return (
    <div className="admin-promos">
      <PageHeader eyebrow="Marketing" title="Promo" highlight="Codes" subtitle="Deposit bonuses & promotional campaigns" />

      <section className="glass promos-panel promos-head">
        <div>
          <h3>Promo codes</h3>
          <p className="muted promos-small">Create bonus codes for deposits. Codes are redeemable until max uses or expiry.</p>
        </div>
        <button className="btn btn-gold" onClick={() => { setForm(BLANK); setShowForm(true); }}>+ New promo</button>
      </section>

      <AnimatePresence>
        {showForm && (
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)}>
            <motion.div className="glass promos-modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h3>New promo code</h3>
              <div className="promos-grid2">
                <div className="field">
                  <label>Code</label>
                  <input className="input mono" value={form.code} placeholder="e.g. WELCOME50" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
                </div>
                <div className="field">
                  <label>Bonus type</label>
                  <select className="input" value={form.bonus_type} onChange={(e) => setForm({ ...form, bonus_type: e.target.value })}>
                    <option value="DEMO">Demo (practice fund)</option>
                    <option value="REAL">Real (live capital)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Amount ($)</label>
                  <input className="input mono" type="number" min="0.01" max="10000" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label>Max uses</label>
                  <input className="input mono" type="number" min="1" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Expires at (optional)</label>
                  <input className="input" type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
                </div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-gold btn-block" disabled={busy || !form.code || !form.amount} onClick={create}>{busy ? 'Saving…' : 'Create promo'}</button>
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="glass promos-panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th><th>Type</th><th>Amount</th><th>Used / Max</th><th>Status</th><th>Expires</th><th>Created</th><th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p: any) => (
                <tr key={p.id} className={p.is_active ? '' : 'off'}>
                  <td className="mono"><strong>{p.code}</strong></td>
                  <td><span className={`badge ${p.bonus_type === 'REAL' ? 'badge-up' : 'badge-gold'}`}>{p.bonus_type}</span></td>
                  <td className="mono gold-text">{money(p.amount)}</td>
                  <td className="mono">{p.used_count} / {p.max_uses}</td>
                  <td><span className={`badge ${p.is_active ? 'badge-up' : 'badge-down'}`}>{p.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                  <td className="dim">{p.expires_at ? fmtDate(p.expires_at) : '—'}</td>
                  <td className="dim">{fmtDate(p.created_at)}</td>
                  <td className="right nowrap">
                    <button className="btn btn-sm btn-ghost" onClick={() => toggle(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
              {!promos.length && <tr><td colSpan={8} className="empty">No promo codes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
