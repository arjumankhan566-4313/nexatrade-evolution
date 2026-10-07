/**
 * AdminFraudPage — 1:1 port of legacy src/app/nexa-admin-portal/fraud/page.jsx.
 * Fraud & risk monitor: multi-account detection by device fingerprint and IP,
 * plus sharp-trader alerts with one-click risk overrides.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useState } from 'react';
import { api, money, timeAgo } from '@/tradeon-client/lib/apiClient';
import { useLiveEvents } from '@/tradeon-client/lib/realtimeClient';
import { alert } from '@/tradeon-client/lib/useAlertStore';
import PageHeader from '@/tradeon-client/components/admin/PageHeader';

export default function AdminFraudPage() {
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setData(await api('/api/admin/fraud'));
    } catch (err: any) {
      alert.critical(err.message, { title: 'Fraud monitor unavailable' });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  useLiveEvents({ scope: 'admin', onEvent: (e: any) => { if (e.topic === 'settings') load(); } });

  const applyOverride = async (id: string, body: any, label: string) => {
    const ok = await alert.confirm({
      severity: body.forceLossUser || body.isBlocked ? 'critical' : 'warning',
      title: `Apply "${label}"?`,
      message: 'This override takes effect on the trader\'s very next settlement and stays until you clear it.',
      confirmLabel: 'Apply override',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', body });
      alert.success(`${label} applied — live on the trader's next settlement.`);
      load();
    } catch (err: any) {
      alert.critical(err.message, { title: 'Override NOT applied' });
    }
  };

  if (!data) return (
    <div className="fraud">
      <PageHeader eyebrow="Security & abuse" title="Fraud" highlight="Monitor" subtitle="Multi-account, device & payment abuse signals" />
      <div style={{ display: 'grid', placeItems: 'center', height: 240 }}><span className="spinner" /></div>
    </div>
  );

  return (
    <div className="fraud">
      <PageHeader eyebrow="Security & abuse" title="Fraud" highlight="Monitor" subtitle="Multi-account, device & payment abuse signals" />

      <div className="fraud-cards">
        {[
          ['Multi-account devices', data.deviceClusters.length, 'One browser fingerprint, several accounts'],
          ['Shared IP clusters', data.ipClusters.length, 'Several accounts, one login IP'],
          ['Sharp traders', data.sharpTraders.length, `Real-money win rate ≥ ${data.threshold}%`],
          ['Rapid-fire accounts', data.rapidFire.length, '30+ trades in the last hour'],
        ].map(([label, value, hint]: any) => (
          <div key={label} className="glass fraud-kpi">
            <span>{label}</span>
            <strong className={value > 0 ? 'down' : ''}>{value}</strong>
            <em>{hint}</em>
          </div>
        ))}
      </div>

      <section className="glass fraud-panel">
        <h3>Sharp trader alerts</h3>
        <p className="muted fraud-small">
          Consistently profitable real-money accounts. Apply a per-user yield override or force-loss flag directly from
          here — the risk engine picks it up on the next expiry.
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Trader</th><th>Trades</th><th>Win rate</th><th>Net P/L</th><th>Volume</th><th>Override</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {data.sharpTraders.map((s: any) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><br /><span className="dim">{s.email}</span></td>
                  <td className="mono">{s.trades}</td>
                  <td className="mono down">{s.winRate}%</td>
                  <td className={`mono ${s.pnl >= 0 ? 'down' : 'up'}`}>{money(s.pnl)}</td>
                  <td className="mono">{money(s.volume)}</td>
                  <td className="mono">{s.customYieldRatio === null ? '—' : `${s.customYieldRatio}%`}</td>
                  <td className="right nowrap">
                    <button className="btn btn-sm btn-ghost" onClick={() => applyOverride(s.id, { customYieldRatio: 20 }, 'Yield override 20%')}>Yield 20%</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => applyOverride(s.id, { customYieldRatio: 10 }, 'Yield override 10%')}>Yield 10%</button>
                    <button className="btn btn-sm btn-ghost fraud-danger" onClick={() => applyOverride(s.id, { forceLossUser: true }, 'Force-loss')}>Force loss</button>
                  </td>
                </tr>
              ))}
              {!data.sharpTraders.length && <tr><td colSpan={7} className="empty">No account is above the alert threshold.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass fraud-panel">
        <h3>Device fingerprint clusters</h3>
        <p className="muted fraud-small">The same physical browser signing into more than one account — the strongest multi-account signal.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Fingerprint</th><th>Accounts</th><th>Emails</th><th>IPs</th><th>Last seen</th></tr></thead>
            <tbody>
              {data.deviceClusters.map((d: any) => (
                <tr key={d.fingerprint}>
                  <td className="mono">{d.fingerprint}</td>
                  <td><span className="badge badge-down">{d.accounts}</span></td>
                  <td className="fraud-wrap">{d.emails}</td>
                  <td className="mono dim">{d.ips}</td>
                  <td className="dim">{timeAgo(d.lastSeen)}</td>
                </tr>
              ))}
              {!data.deviceClusters.length && <tr><td colSpan={5} className="empty">No shared devices detected.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass fraud-panel">
        <h3>Shared IP clusters</h3>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>IP</th><th>Accounts</th><th>Emails</th><th>Last login</th></tr></thead>
            <tbody>
              {data.ipClusters.map((r: any) => (
                <tr key={r.ip}>
                  <td className="mono">{r.ip}</td>
                  <td><span className="badge">{r.accounts}</span></td>
                  <td className="fraud-wrap">{r.emails}</td>
                  <td className="dim">{timeAgo(r.lastSeen)}</td>
                </tr>
              ))}
              {!data.ipClusters.length && <tr><td colSpan={4} className="empty">No shared IPs detected.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass fraud-panel">
        <h3>Rapid-fire activity (last hour)</h3>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Trader</th><th>Trades</th><th>Volume</th></tr></thead>
            <tbody>
              {data.rapidFire.map((r: any) => (
                <tr key={r.id}><td>{r.email}</td><td className="mono">{r.trades}</td><td className="mono">{money(r.volume)}</td></tr>
              ))}
              {!data.rapidFire.length && <tr><td colSpan={3} className="empty">Nothing unusual in the last hour.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
