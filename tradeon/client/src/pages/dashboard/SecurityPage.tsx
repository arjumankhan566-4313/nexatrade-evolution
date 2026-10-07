// @ts-nocheck

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Monitor, Smartphone, Tablet, ShieldCheck, KeyRound, X } from 'lucide-react';
import { useSession } from '@/components/dashboard/SessionProvider';
import { api, fmtDate, timeAgo } from '@/lib/apiClient';

const SEV = { INFO: 'badge badge-info', WARNING: 'badge badge-warn', CRITICAL: 'badge badge-down' };

const EVENT_LABEL = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in attempt',
  LOGOUT: 'Signed out',
  SIGNUP: 'Account created',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_CHANGE_FAILED: 'Password change failed',
  SESSIONS_REVOKED: 'All devices signed out',
  TWO_FACTOR_ENABLED: 'Two-factor enabled',
  TWO_FACTOR_DISABLED: 'Two-factor disabled',
  SELF_EXCLUSION_SET: 'Self-exclusion set',
  KYC_SUBMITTED: 'KYC submitted',
  KYC_SPOOF_ATTEMPT: 'KYC spoof attempt blocked',
  TRADE_OPEN: 'Trade opened',
  DEPOSIT_REQUESTED: 'Deposit requested',
  WITHDRAWAL_REQUESTED: 'Withdrawal requested',
};

/* Spec §6.9 — device-type icon derived from the user-agent string */
function deviceIcon(ua = '') {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return Tablet;
  if (/mobile|android|iphone/.test(s)) return Smartphone;
  return Monitor;
}

function deviceLabel(ua = '') {
  const s = ua.toLowerCase();
  const os = s.includes('android') ? 'Android' : /iphone|ipad|ios/.test(s) ? 'iOS' : s.includes('windows') ? 'Windows' : s.includes('mac os') ? 'macOS' : 'Device';
  const browser = s.includes('edg/') ? 'Edge' : s.includes('chrome') ? 'Chrome' : s.includes('safari') ? 'Safari' : s.includes('firefox') ? 'Firefox' : 'Browser';
  return `${os} · ${browser}`;
}

export default function SecurityPage() {
  const { user } = useSession();
  const [events, setEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [prefs, setPrefs] = useState({ loginAlerts: false, depositLimit: null, selfExclusionUntil: null, realityCheckMinutes: 0 });
  const [twoFa, setTwoFa] = useState(null); // { enabled, secret?, otpauthUrl?, backupCodes? }
  const [twoFaCode, setTwoFaCode] = useState('');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [depositLimit, setDepositLimit] = useState('');
  const [realityCheck, setRealityCheck] = useState('0');
  const [selfExclusion, setSelfExclusion] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, d, p, t] = await Promise.all([
        api('/api/auth/activity'),
        api('/api/auth/devices').catch(() => ({ devices: [] })),
        api('/api/auth/security').catch(() => null),
        api('/api/auth/2fa').catch(() => null),
      ]);
      setEvents(a.events || []);
      setDevices(d.devices || []);
      if (p) {
        setPrefs(p);
        setDepositLimit(p.depositLimit == null ? '' : String(p.depositLimit));
        setRealityCheck(String(p.realityCheckMinutes || 0));
        setSelfExclusion(p.selfExclusionUntil ? String(p.selfExclusionUntil).slice(0, 16) : '');
      }
      if (t) setTwoFa(t);
    } catch {
      /* session poll surfaces auth issues */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const notify = (kind, text) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4500);
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      notify('error', 'The two new passwords do not match.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await api('/api/auth/password', {
        method: 'PATCH',
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      notify('ok', res.message);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    try {
      const res = await api('/api/auth/activity', { method: 'POST' });
      notify('ok', res.message);
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const terminate = async (id) => {
    try {
      const res = await api(`/api/auth/devices?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      notify('ok', res.message);
      load();
    } catch (err) {
      notify('error', err.message);
    }
  };

  const setup2fa = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const t = await api('/api/auth/2fa');
      setTwoFa(t);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm2fa = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api('/api/auth/2fa', { method: 'POST', body: { secret: twoFa.secret, code: twoFaCode } });
      setTwoFa(res);
      setTwoFaCode('');
      notify('ok', res.message);
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const disable2fa = async () => {
    setBusy(true);
    try {
      const res = await api('/api/auth/2fa', { method: 'DELETE', body: { code: twoFaCode } });
      setTwoFa({ enabled: false });
      setTwoFaCode('');
      notify('ok', res.message);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        loginAlerts: prefs.loginAlerts,
        depositLimit: depositLimit === '' ? null : Number(depositLimit),
        realityCheckMinutes: Number(realityCheck || 0),
      };
      if (selfExclusion) body.selfExclusionUntil = new Date(selfExclusion).toISOString();
      const res = await api('/api/auth/security', { method: 'PATCH', body });
      notify('ok', res.message);
      window.dispatchEvent(new Event('nexa:security-settings'));
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const clearSelfExclusion = async () => {
    setBusy(true);
    try {
      const res = await api('/api/auth/security', { method: 'PATCH', body: { selfExclusion: 'disable' } });
      notify('ok', res.message);
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const lastLogin = events.find((e) => e.event === 'LOGIN_SUCCESS');
  const failed = events.filter((e) => e.event === 'LOGIN_FAILED').length;
  const exclusionActive = prefs.selfExclusionUntil && new Date(prefs.selfExclusionUntil).getTime() > Date.now();

  return (
    <div className="security">
      <div className="cards">
        <div className="glass card">
          <span>Session</span>
          <strong>Active</strong>
          <em className="dim">HTTP-only JWT · 7 days</em>
        </div>
        <div className="glass card">
          <span>Last sign-in</span>
          <strong>{lastLogin ? timeAgo(lastLogin.createdAt) : user?.lastLoginAt ? timeAgo(user.lastLoginAt) : '—'}</strong>
          <em className="dim">{lastLogin ? `${lastLogin.ip} · ${lastLogin.device}` : user?.lastLoginAt ? 'Latest account sign-in' : 'No record yet'}</em>
        </div>
        <div className="glass card">
          <span>Failed attempts</span>
          <strong className={failed ? 'down' : 'up'}>{failed}</strong>
          <em className="dim">In your recent activity</em>
        </div>
        <div className="glass card">
          <span>Two-factor</span>
          <strong className={twoFa?.enabled ? 'up' : ''}>{twoFa?.enabled ? 'On' : 'Off'}</strong>
          <em className="dim">{twoFa?.enabled ? 'TOTP protected' : 'Add an authenticator app'}</em>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.kind === 'ok' ? 'ok' : 'error'}`}>{msg.text}</div>}

      <div className="split">
        <div className="left">
          <section className="glass panel">
            <h3>Change password</h3>
            <p className="muted small">Changing your password signs every other device out immediately.</p>
            <form onSubmit={changePassword} style={{ marginTop: 14 }}>
              <div className="field">
                <label>Current password</label>
                <input className="input" type="password" required autoComplete="current-password"
                  value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
              </div>
              <div className="field">
                <label>New password</label>
                <input className="input" type="password" required minLength={8} autoComplete="new-password"
                  value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input className="input" type="password" required minLength={8} autoComplete="new-password"
                  value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
              </div>
              <button className="btn btn-gold btn-block" disabled={busy}>{busy ? <span className="spinner" /> : 'Update password'}</button>
            </form>
          </section>

          {/* Spec §6.9 — 2FA setup */}
          <section className="glass panel">
            <div className="row-between">
              <h3 style={{ margin: 0 }}>Two-factor authentication</h3>
              <ShieldCheck size={18} style={{ color: twoFa?.enabled ? '#10b981' : 'var(--dim)' }} />
            </div>
            {!twoFa?.enabled && (
              <p className="muted small" style={{ marginTop: 6 }}>
                Add an authenticator app (Google Authenticator, Authy, 1Password) for an extra sign-in layer.
              </p>
            )}

            {twoFa?.enabled && twoFa.backupCodes ? (
              <div className="backup-box">
                <strong>2FA is now active.</strong>
                <p className="muted small">Store these one-time backup codes somewhere safe — each works once.</p>
                <div className="backup-codes">
                  {twoFa.backupCodes.map((c) => <code key={c}>{c}</code>)}
                </div>
              </div>
            ) : twoFa?.enabled ? (
              <div style={{ marginTop: 10 }}>
                <div className="alert alert-ok">Two-factor authentication is enabled on this account.</div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Current code (to disable)</label>
                  <input className="input mono" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button className="btn btn-ghost" disabled={busy || twoFaCode.length !== 6} onClick={disable2fa}>Disable 2FA</button>
              </div>
            ) : twoFa?.secret ? (
              <div className="twofa-setup">
                <div className="qr-wrap"><QRCodeSVG value={twoFa.otpauthUrl} size={140} bgColor="#ffffff" fgColor="#080b11" /></div>
                <div className="twofa-steps">
                  <p className="muted small">1. Scan the QR with your authenticator app, or enter the key:</p>
                  <code className="secret">{twoFa.secret.match(/.{4}/g).join(' ')}</code>
                  <p className="muted small">2. Enter the 6-digit code from the app:</p>
                  <input className="input mono" inputMode="numeric" maxLength={6} placeholder="000000"
                    value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))} />
                  <div className="row" style={{ gap: 8, marginTop: 10 }}>
                    <button className="btn btn-gold" disabled={busy || twoFaCode.length !== 6} onClick={confirm2fa}>Verify & enable</button>
                    <button className="btn btn-ghost" onClick={() => { setTwoFa(null); setTwoFaCode(''); }}>Cancel</button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="btn btn-gold" style={{ marginTop: 12 }} onClick={setup2fa}><KeyRound size={15} /> Set up authenticator</button>
            )}
          </section>

          {/* Spec §6.9 — Responsible Trading */}
          <section className="glass panel">
            <h3>Responsible trading</h3>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Daily deposit limit (USD) — blank = no limit</label>
              <input className="input mono" type="number" min="0" step="1" placeholder="No limit"
                value={depositLimit} onChange={(e) => setDepositLimit(e.target.value)} />
            </div>
            <div className="field">
              <label>Reality-check reminder every (minutes) — 0 = off</label>
              <select className="select" value={realityCheck} onChange={(e) => setRealityCheck(e.target.value)}>
                {['0', '15', '30', '60', '120', '240'].map((m) => (
                  <option key={m} value={m}>{m === '0' ? 'Off' : `${m} minutes`}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Self-exclusion / cool-off until</label>
              {prefs.selfExclusionUntil ? (
                <div className="row-between" style={{ gap: 8 }}>
                  <span className={exclusionActive ? 'down' : 'muted'}>
                    {exclusionActive ? `Active until ${fmtDate(prefs.selfExclusionUntil)} · cannot be cancelled early` : `Expired ${fmtDate(prefs.selfExclusionUntil)}`}
                  </span>
                  {!exclusionActive && <button className="btn btn-sm btn-ghost" onClick={clearSelfExclusion} disabled={busy}>Clear</button>}
                </div>
              ) : (
                <input className="input" type="datetime-local" value={selfExclusion} onChange={(e) => setSelfExclusion(e.target.value)} />
              )}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <label className="switch-row">
                <input type="checkbox" checked={prefs.loginAlerts} onChange={(e) => setPrefs({ ...prefs, loginAlerts: e.target.checked })} />
                <span>Notify me in-app about new-device sign-ins</span>
              </label>
            </div>
            <button className="btn btn-gold btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={savePrefs}>Save preferences</button>
          </section>
        </div>

        <div className="right">
          {/* Spec §6.9 — device list with icons + "This device" chip */}
          <section className="glass panel">
            <h3>Devices</h3>
            <p className="muted small">Devices that have signed in to this account.</p>
            <div className="devices" style={{ marginTop: 12 }}>
              {devices.map((d) => {
                const Icon = deviceIcon(d.userAgent);
                return (
                  <div key={d.id} className={`device ${d.isCurrent ? 'current' : ''}`}>
                    <span className="dev-ic"><Icon size={18} /></span>
                    <div className="dev-meta">
                      <strong>{deviceLabel(d.userAgent)}</strong>
                      <span className="dim">{d.ip} · last seen {timeAgo(d.lastSeen)}</span>
                    </div>
                    {d.isCurrent ? (
                      <span className="chip-this">This device</span>
                    ) : (
                      <button className="dev-x" onClick={() => terminate(d.id)} aria-label="Remove device"><X size={15} /></button>
                    )}
                  </div>
                );
              })}
              {!devices.length && <div className="empty">No devices recorded yet.</div>}
            </div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={revokeAll}>
              Sign out all other devices
            </button>
          </section>

          <section className="glass panel">
            <h3>Security activity</h3>
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data">
                <thead><tr><th>When</th><th>Event</th><th>IP</th><th>Level</th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="dim">{fmtDate(e.createdAt)}</td>
                      <td><strong>{EVENT_LABEL[e.event] || e.event.replace(/_/g, ' ').toLowerCase()}</strong><div className="dim" style={{ fontSize: 10.5 }}>{e.device}</div></td>
                      <td className="mono">{e.ip}</td>
                      <td><span className={SEV[e.severity] || 'badge'}>{e.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!events.length && <div className="empty">No activity recorded yet.</div>}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .card { padding: 17px; display: grid; gap: 5px; }
        .card span { font-size: 10.5px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--dim); }
        .card strong { font-size: 20px; }
        .card em { font-style: normal; font-size: 11.5px; }
        .split { display: grid; grid-template-columns: 380px 1fr; gap: 16px; align-items: start; }
        .left, .right { display: grid; gap: 16px; }
        .panel { padding: 20px; }
        h3 { margin: 0 0 4px; font-size: 16px; }
        .small { font-size: 12.5px; line-height: 1.6; margin: 0; }

        .devices { display: grid; gap: 8px; }
        .device { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--stroke); }
        .device.current { border-color: rgba(242,184,75,0.45); background: rgba(242,184,75,0.06); }
        .dev-ic { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.05); color: var(--muted); }
        .device.current .dev-ic { color: var(--gold-1); }
        .dev-meta { flex: 1; min-width: 0; }
        .dev-meta strong { display: block; font-size: 13px; }
        .dev-meta span { font-size: 11px; }
        .chip-this { font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px; padding: 3px 9px; border-radius: 999px; background: rgba(242,184,75,0.16); color: var(--gold-1); border: 1px solid rgba(242,184,75,0.4); white-space: nowrap; }
        .dev-x { border: none; background: transparent; color: var(--dim); padding: 6px; border-radius: 8px; }
        .dev-x:hover { color: #f43f5e; background: rgba(244,63,94,0.1); }

        .twofa-setup { display: flex; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
        .qr-wrap { padding: 10px; background: #fff; border-radius: 12px; flex-shrink: 0; }
        .twofa-steps { flex: 1; min-width: 220px; display: grid; gap: 8px; align-content: start; }
        .secret { font-family: var(--mono); font-size: 12.5px; background: rgba(255,255,255,0.05); padding: 8px 10px; border-radius: 8px; color: var(--gold-1); letter-spacing: 1px; word-break: break-all; }
        .backup-box { margin-top: 12px; }
        .backup-codes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
        .backup-codes code { font-family: var(--mono); font-size: 11.5px; padding: 7px 9px; background: rgba(0,0,0,0.35); border: 1px solid var(--stroke); border-radius: 7px; text-align: center; }

        .switch-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
        .switch-row input { accent-color: #f2b84b; width: 16px; height: 16px; }

        @media (max-width: 940px) { .split { grid-template-columns: 1fr; } .backup-codes { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}
