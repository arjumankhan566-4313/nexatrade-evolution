/**
 * AdminKycPage — 1:1 port of legacy src/app/nexa-admin-portal/kyc/page.jsx.
 * Manual KYC review: ID card and live face capture, side-by-side.
 *
 * Adaptations for V2:
 *   • 'use client' removed (Vite, not Next.js)
 *   • <style jsx> removed (CSS in admin-module-utils.css)
 */
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '@/lib/apiClient';
import { DOC_LABELS, getCountry } from '@/lib/countries';
import { alert } from '@/lib/useAlertStore';
import PageHeader from '@/components/admin/PageHeader';
import { useLiveEvents } from '@/lib/realtimeClient';

const KYC_TOPICS = ['admin', 'kyc'];

const privateKycImage = (pathname: string) => pathname
  ? `/api/admin/kyc/file?pathname=${encodeURIComponent(pathname)}`
  : '';

export default function AdminKycPage() {
  const [filter, setFilter] = useState('UNDER_REVIEW');
  const [items, setItems] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    const d: any = await api(`/api/admin/kyc?status=${status}`);
    setItems(d.submissions);
    setActive((prev: any) => d.submissions.find((s: any) => s.id === prev?.id) || d.submissions[0] || null);
  }, []);

  useEffect(() => {
    load(filter).catch((e: any) => alert.critical(e.message, { title: 'KYC queue unavailable' }));
    const timer = setInterval(() => load(filter).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [filter, load]);

  useLiveEvents({ scope: 'admin', topics: KYC_TOPICS, onEvent: () => load(filter).catch(() => {}) });
  useEffect(() => { setNote(''); }, [active?.id]);

  const decide = async (decision: string) => {
    if (!active) return;
    const approving = decision === 'VERIFIED';
    const who = active.fullName || active.accountName || active.email;
    const ok = await alert.confirm({
      severity: approving ? 'warning' : 'critical',
      title: approving ? `Approve ${who}?` : `Reject ${who}?`,
      message: approving
        ? 'Real-money trading and withdrawals unlock for this account immediately.'
        : `The trader is told their documents could not be verified${note ? ` — "${note}"` : ''}.`,
      confirmLabel: approving ? 'Approve KYC' : 'Reject KYC',
      cancelLabel: 'Back',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/admin/kyc/${active.id}`, { method: 'PATCH', body: { decision, note } });
      alert.success(`Case ${decision.toLowerCase()} — ${who} has been notified.`);
      setNote('');
      await load(filter);
    } catch (err: any) {
      alert.critical(err.message, { title: 'Decision NOT applied' });
    } finally {
      setBusy(false);
    }
  };

  const risk = active?.livenessReport?.risk;

  return (
    <div className="kyc-admin">
      <PageHeader eyebrow="Identity verification" title="KYC" highlight="Review" subtitle="Document & liveness checks with fraud scoring" />

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'ALL'].map((s) => (
          <button key={s} className={`btn btn-sm ${filter === s ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setFilter(s)}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="kyc-split">
        <aside className="glass kyc-list">
          {items.map((s: any) => (
            <button key={s.id} className={`kyc-case ${active?.id === s.id ? 'active' : ''}`} onClick={() => setActive(s)}>
              <div className="row-between">
                <strong>{s.fullName || s.accountName}</strong>
                <span className={`badge ${s.status === 'VERIFIED' ? 'badge-up' : s.status === 'REJECTED' ? 'badge-down' : 'badge-warn'}`}>{s.status}</span>
              </div>
              <span className="dim">{s.email}</span>
              <span className="dim">{getCountry(s.country).name} · {DOC_LABELS[s.docType] || s.docType}</span>
              <div className="row" style={{ gap: 8, marginTop: 5 }}>
                <span className={`kyc-mini ${s.faceMatchScore >= 55 ? 'up' : 'down'}`}>match {s.faceMatchScore}%</span>
                <span className={`kyc-mini ${s.livenessScore >= 60 ? 'up' : 'down'}`}>live {s.livenessScore}%</span>
              </div>
            </button>
          ))}
          {!items.length && <div className="empty">No cases in this queue.</div>}
        </aside>

        {active ? (
          <section className="glass kyc-detail" key={active.id}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3>{active.fullName}</h3>
                <p className="dim" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
                  {active.email} · submitted {fmtDate(active.createdAt)} · IP {active.submittedIp || 'n/a'}
                </p>
              </div>
              {risk && <span className={`badge ${risk === 'LOW' ? 'badge-up' : risk === 'HIGH' ? 'badge-down' : 'badge-warn'}`}>RISK {risk}</span>}
            </div>

            <div className="kyc-compare">
              <figure>
                <img src={privateKycImage(active.docFrontPath)} alt="ID front" onClick={() => setZoom(privateKycImage(active.docFrontPath))} />
                <figcaption>ID document · front</figcaption>
              </figure>
              {active.docBackPath && (
                <figure>
                  <img src={privateKycImage(active.docBackPath)} alt="ID back" onClick={() => setZoom(privateKycImage(active.docBackPath))} />
                  <figcaption>ID document · back</figcaption>
                </figure>
              )}
              <figure>
                <img src={privateKycImage(active.selfiePath)} alt="Live capture" onClick={() => setZoom(privateKycImage(active.selfiePath))} />
                <figcaption>Live face capture</figcaption>
              </figure>
            </div>

            <div className="kyc-facts">
              <Fact label="Country" value={getCountry(active.country).name} />
              <Fact label="Document" value={DOC_LABELS[active.docType] || active.docType} />
              <Fact label="Document no." value={active.docNumber} mono />
              <Fact label="Date of birth" value={active.dateOfBirth} mono />
              <Fact label="Address" value={active.address || '—'} />
              <Fact label="Face match" value={`${active.faceMatchScore}%`} tone={active.faceMatchScore >= 55 ? 'up' : 'down'} />
              <Fact label="Liveness" value={`${active.livenessScore}%`} tone={active.livenessScore >= 60 ? 'up' : 'down'} />
              <Fact label="Detector" value={active.livenessReport?.detector || 'heuristic'} />
            </div>

            <div className="alert alert-warn" style={{ marginTop: 14 }}>
              Biometric scores are client-generated screening signals, not proof of identity. Compare the live capture and document manually before approving.
            </div>

            {Array.isArray(active.livenessReport?.checks) && active.livenessReport.checks.length > 0 && (
              <div className="kyc-checks">
                {active.livenessReport.checks.map((c: any) => (
                  <span key={c.id} className={`badge ${c.passed ? 'badge-up' : 'badge-down'}`}>
                    {c.passed ? '✓' : '✕'} {c.id.replace('_', ' ')}
                  </span>
                ))}
              </div>
            )}
            {Array.isArray(active.livenessReport?.flags) && active.livenessReport.flags.length > 0 && (
              <div className="kyc-checks">
                {active.livenessReport.flags.map((f: any) => <span key={f} className="badge badge-warn">{f.replace(/_/g, ' ')}</span>)}
              </div>
            )}

            {active.status === 'UNDER_REVIEW' ? (
              <div className="kyc-decide">
                <textarea className="input" rows={2} placeholder="Reviewer note (sent to the user when rejecting)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="row" style={{ gap: 10, marginTop: 10 }}>
                  <button className="btn btn-up grow" disabled={busy} onClick={() => decide('VERIFIED')}>✓ Approve verification</button>
                  <button className="btn btn-down grow" disabled={busy} onClick={() => decide('REJECTED')}>✕ Reject</button>
                </div>
              </div>
            ) : (
              <div className="alert alert-info" style={{ marginTop: 16 }}>
                Case already decided ({active.status}) {active.reviewedAt ? `on ${fmtDate(active.reviewedAt)}` : ''}
                {active.reviewerNote ? ` — ${active.reviewerNote}` : ''}
              </div>
            )}
          </section>
        ) : (
          <section className="glass kyc-detail"><div className="empty">Select a case to review.</div></section>
        )}
      </div>

      {zoom && (
        <div className="kyc-lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Zoom" />
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, tone, mono }: any) {
  return (
    <div className="kyc-fact">
      <span>{label}</span>
      <strong className={`${tone === 'up' ? 'up' : tone === 'down' ? 'down' : ''} ${mono ? 'mono' : ''}`}>{value}</strong>
    </div>
  );
}
