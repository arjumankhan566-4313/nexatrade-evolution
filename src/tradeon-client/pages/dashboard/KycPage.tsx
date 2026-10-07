// @ts-nocheck

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, CheckCircle2, FileImage } from 'lucide-react';
import { useSession } from '@/tradeon-client/components/dashboard/SessionProvider';
import Stepper from '@/tradeon-client/components/kyc/Stepper';
import { COUNTRIES, DOC_LABELS, getCountry } from '@/tradeon-client/lib/countries';
import { api, fmtDate } from '@/tradeon-client/lib/apiClient';
import {
  fileToDataUrl, drawToCanvas, detectFace, matchFaces, pickChallenges, runChallenge, scoreLiveness,
} from '@/tradeon-client/lib/biometrics';

const STEPS = ['Country & document', 'Upload ID', 'Live face check', 'Review & submit'];

const STATUS_UI = {
  NONE: ['badge', 'Not started'],
  PENDING: ['badge badge-warn', 'Pending'],
  UNDER_REVIEW: ['badge badge-warn', 'Under review'],
  VERIFIED: ['badge badge-up', 'Verified'],
  REJECTED: ['badge badge-down', 'Rejected'],
};

/* Flag from ISO 3166-1 alpha-2 → regional-indicator flag glyph */
const flagFor = (code) => {
  if (!code || code === 'OTHER' || code.length !== 2) return '🌐';
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
};

/* Spec §6.7 — custom searchable combobox (replaces the native <select>) */
function SearchSelect({ value, onChange, options, placeholder, disabled, renderLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = options.filter((o) => {
    const label = renderLabel ? renderLabel(o) : o.label;
    return String(label).toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="combo" ref={rootRef}>
      <button
        type="button"
        className={`combo-trigger ${open ? 'open' : ''}`}
        disabled={disabled}
        onClick={() => { setOpen((v) => !v); setQuery(''); }}
      >
        <span className={selected ? '' : 'combo-ph'}>{selected ? (renderLabel ? renderLabel(selected) : selected.label) : placeholder}</span>
        <span className={`combo-chev ${open ? 'rot' : ''}`} style={{ display: 'grid', placeItems: 'center' }}>
          <ChevronDown size={15} />
        </span>
      </button>
      {open && (
        <div className="combo-menu">
          <div className="combo-search">
            <Search size={14} />
            <input autoFocus placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="combo-list">
            {filtered.length === 0 && <div className="combo-empty">No match</div>}
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                className={`combo-opt ${o.value === value ? 'sel' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {renderLabel ? renderLabel(o) : o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <style>{`
        .combo { position: relative; }
        .combo-trigger {
          display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
          padding: 11px 13px; border-radius: 11px; border: 1px solid var(--stroke);
          background: rgba(255,255,255,0.03); color: var(--text); font-size: 13.5px; text-align: left;
        }
        .combo-trigger.open { border-color: rgba(242,184,75,0.5); }
        .combo-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
        .combo-ph { color: var(--dim); }
        .combo-chev { color: var(--muted); transition: transform 0.16s; }
        .combo-chev.rot { transform: rotate(180deg); }
        .combo-menu {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30;
          border-radius: 12px; border: 1px solid var(--stroke-strong); background: #10151f;
          box-shadow: 0 18px 44px rgba(0,0,0,0.5); overflow: hidden;
        }
        .combo-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--stroke); color: var(--dim); }
        .combo-search input { flex: 1; background: transparent; border: none; outline: none; color: var(--text); font-size: 13px; }
        .combo-list { max-height: 240px; overflow-y: auto; padding: 6px; }
        .combo-opt { display: block; width: 100%; text-align: left; padding: 9px 10px; border-radius: 8px; border: none; background: transparent; color: var(--muted); font-size: 13px; }
        .combo-opt:hover { background: rgba(255,255,255,0.05); color: var(--text); }
        .combo-opt.sel { background: rgba(242,184,75,0.14); color: var(--gold-1); }
        .combo-empty { padding: 14px; text-align: center; color: var(--dim); font-size: 12.5px; }
      `}</style>
    </div>
  );
}

export default function KycPage() {
  const { user, kyc, refresh } = useSession();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    country: '', docType: '', docNumber: '', fullName: '', dateOfBirth: '', address: '',
  });
  const [docFront, setDocFront] = useState('');
  const [docBack, setDocBack] = useState('');
  const [selfie, setSelfie] = useState('');
  const [biometrics, setBiometrics] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const country = form.country ? getCountry(form.country) : null;

  useEffect(() => {
    if (user?.country && !form.country) setForm((f) => ({ ...f, country: user.country }));
    if (user?.fullName && !form.fullName) setForm((f) => ({ ...f, fullName: user.fullName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const status = user?.kycStatus || 'NONE';
  const [badgeClass, badgeText] = STATUS_UI[status] || STATUS_UI.NONE;
  const locked = ['UNDER_REVIEW', 'VERIFIED'].includes(status) || submitted;

  const uploadDoc = (side) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file, 1280, 0.85);
      if (side === 'front') setDocFront(dataUrl);
      else setDocBack(dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/kyc', {
        method: 'POST',
        body: {
          ...form,
          docFront,
          docBack,
          selfie,
          biometrics: biometrics
            ? {
                faceMatchScore: biometrics.faceMatchScore,
                livenessScore: biometrics.livenessScore,
                framesAnalysed: biometrics.framesAnalysed,
                checks: biometrics.checks,
                detector: biometrics.detector,
              }
            : {},
        },
      });
      setSubmitted(true);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (locked) {
    return (
      <div className="glass" style={{ padding: 30, maxWidth: 720 }}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Identity verification</h1>
          <span className={badgeClass}>{badgeText}</span>
        </div>
        {status === 'VERIFIED' ? (
          <div className="alert alert-ok">
            <CheckCircle2 size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
            Your identity is verified. Real-money trading and withdrawals are unlocked.
          </div>
        ) : (
          <div className="alert alert-warn">
            Your documents are in the compliance queue. Reviews are usually completed within a few hours.
          </div>
        )}
        {kyc && (
          <div className="scores">
            <div><span>Face match</span><strong>{kyc.faceMatchScore}%</strong></div>
            <div><span>Liveness</span><strong>{kyc.livenessScore}%</strong></div>
            <div><span>Submitted</span><strong>{fmtDate(kyc.createdAt)}</strong></div>
          </div>
        )}
        {kyc?.reviewerNote && <p className="muted" style={{ marginTop: 14 }}>Reviewer note: {kyc.reviewerNote}</p>}
        <style>{`
          .scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-top: 20px; }
          .scores div { padding: 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--stroke); }
          .scores span { display: block; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); }
          .scores strong { font-size: 17px; font-family: var(--mono); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="kyc">
      <header className="row-between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>Identity verification</h1>
          <p className="muted">Country-specific documents, a live face check and a manual compliance review.</p>
        </div>
        <span className={badgeClass}>{badgeText}</span>
      </header>

      <div style={{ marginBottom: 18, overflowX: 'auto' }}>
        <Stepper steps={STEPS} currentStep={step + 1} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {status === 'REJECTED' && kyc?.reviewerNote && (
        <div className="alert alert-warn">Previous attempt rejected: {kyc.reviewerNote}</div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="glass card"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -25 }}
          transition={{ duration: 0.28 }}
        >
          {step === 0 && (
            <>
              <h3>Where are you resident?</h3>
              <p className="muted small">Accepted documents change per country — pick yours to see the exact requirements.</p>
              <div className="grid2">
                <div className="field">
                  <label>Country</label>
                  <SearchSelect
                    value={form.country}
                    onChange={(v) => setForm({ ...form, country: v, docType: '' })}
                    options={COUNTRIES.map((c) => ({ value: c.code, label: `${flagFor(c.code)} ${c.name}` }))}
                    placeholder="Search country…"
                  />
                </div>
                <div className="field">
                  <label>Document type</label>
                  <SearchSelect
                    value={form.docType}
                    onChange={(v) => setForm({ ...form, docType: v })}
                    disabled={!country}
                    options={(country?.docs || []).map((d) => ({ value: d, label: DOC_LABELS[d] || d }))}
                    placeholder={country ? 'Select document…' : 'Select a country first'}
                  />
                </div>
                <div className="field">
                  <label>Full legal name (as printed on the document)</label>
                  <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Date of birth</label>
                  <input className="input" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
                </div>
                <div className="field">
                  <label>Document number</label>
                  <input className="input mono" value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value })} placeholder="e.g. 1990123456789" />
                </div>
                <div className="field">
                  <label>Residential address</label>
                  <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city, postcode" />
                </div>
              </div>
              {country && (
                <div className="alert alert-info">
                  <strong>{country.name}</strong> requires: {country.docs.map((d) => DOC_LABELS[d] || d).join(' · ')}
                  {country.backRequired ? ' — both sides of the document.' : ' — front side is sufficient.'}
                </div>
              )}
              <button
                className="btn btn-gold"
                disabled={!form.country || !form.docType || !form.fullName || !form.dateOfBirth || !form.docNumber}
                onClick={() => setStep(1)}
              >
                Continue →
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <h3>Upload your {DOC_LABELS[form.docType] || 'document'}</h3>
              <p className="muted small">Clear, uncropped photos. All four corners visible, no glare on the portrait.</p>
              <div className="uploads">
                <UploadTile label="Front side" required value={docFront} onChange={uploadDoc('front')} />
                <UploadTile
                  label={`Back side${country?.backRequired ? '' : ' (optional)'}`}
                  required={country?.backRequired}
                  value={docBack}
                  onChange={uploadDoc('back')}
                />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
                <button className="btn btn-gold" disabled={!docFront || (country?.backRequired && !docBack)} onClick={() => setStep(2)}>
                  Continue to face check →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <LivenessStep
              docFront={docFront}
              onDone={({ selfie: shot, ...bio }) => {
                setSelfie(shot);
                setBiometrics(bio);
                setStep(3);
              }}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <>
              <h3>Review & submit</h3>
              <div className="review">
                <div className="review-imgs">
                  <figure>
                    <img src={docFront} alt="Document front" />
                    <figcaption>Document · front</figcaption>
                  </figure>
                  {docBack && (
                    <figure>
                      <img src={docBack} alt="Document back" />
                      <figcaption>Document · back</figcaption>
                    </figure>
                  )}
                  <figure>
                    <img src={selfie} alt="Live capture" />
                    <figcaption>Live capture</figcaption>
                  </figure>
                </div>
                <div className="review-data">
                  <Row label="Country" value={getCountry(form.country).name} />
                  <Row label="Document" value={DOC_LABELS[form.docType] || form.docType} />
                  <Row label="Number" value={form.docNumber} />
                  <Row label="Name" value={form.fullName} />
                  <Row label="Date of birth" value={form.dateOfBirth} />
                  <Row label="Face match" value={`${biometrics?.faceMatchScore ?? 0}%`} tone={(biometrics?.faceMatchScore ?? 0) >= 55 ? 'up' : 'warn'} />
                  <Row label="Liveness" value={`${biometrics?.livenessScore ?? 0}%`} tone={(biometrics?.livenessScore ?? 0) >= 60 ? 'up' : 'warn'} />
                </div>
              </div>
              <div className="alert alert-info small">
                Submitting sends your case to the compliance queue, where an officer compares your ID photo and live
                capture side-by-side before approving.
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Retake face check</button>
                <button className="btn btn-gold" disabled={busy} onClick={submit}>
                  {busy ? <span className="spinner" /> : 'Submit for verification'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <style>{`
        .kyc { max-width: 940px; }
        h1 { margin: 0 0 4px; font-size: 23px; }
        h3 { margin: 0 0 6px; font-size: 18px; }
        .small { font-size: 13px; }
        .card { padding: 26px; }
        .stepper { display: flex; gap: 0; margin-bottom: 22px; flex-wrap: wrap; align-items: center; }
        .stepper-item { display: flex; align-items: center; }
        .stepper-connector { width: 34px; height: 2px; margin: 0 8px; border-radius: 2px; background: rgba(255, 255, 255, 0.1); }
        .stepper-connector.done { background: linear-gradient(90deg, var(--up), rgba(22, 199, 132, 0.55)); }
        .stp { display: flex; align-items: center; gap: 9px; padding: 9px 14px; border-radius: 11px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--stroke); }
        .stp-no { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; background: rgba(255, 255, 255, 0.08); color: var(--muted); }
        .stp-label { font-size: 12.5px; color: var(--muted); }
        .stp.active { border-color: rgba(245, 197, 66, 0.45); background: rgba(245, 197, 66, 0.1); }
        .stp.active .stp-no { background: var(--gold-grad); color: #17130a; }
        .stp.active .stp-label { color: var(--gold-1); }
        .stp.done .stp-no { background: rgba(22, 199, 132, 0.25); color: var(--up); }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; margin: 18px 0 4px; }
        .uploads { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; }
        .review { display: grid; grid-template-columns: 1.1fr 1fr; gap: 22px; margin: 18px 0; }
        .review-imgs { display: grid; gap: 12px; }
        .review-imgs figure { margin: 0; }
        .review-imgs img { width: 100%; border-radius: 12px; border: 1px solid var(--stroke); display: block; }
        .review-imgs figcaption { font-size: 11.5px; color: var(--dim); margin-top: 6px; letter-spacing: 0.6px; text-transform: uppercase; }
        @media (max-width: 780px) {
          .grid2, .uploads, .review { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="rw">
      <span>{label}</span>
      <strong className={tone === 'up' ? 'up' : tone === 'warn' ? 'badge badge-warn' : ''}>{value}</strong>
      <style>{`
        .rw { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--stroke); font-size: 13.5px; }
        .rw span { color: var(--muted); }
      `}</style>
    </div>
  );
}

function UploadTile({ label, value, onChange, required }) {
  return (
    <label className={`tile ${value ? 'filled' : ''}`}>
      <input type="file" accept="image/*" capture="environment" onChange={onChange} hidden />
      {value ? <img src={value} alt={label} /> : <span className="tile-icon"><FileImage size={30} style={{ color: 'var(--gold-1)' }} /></span>}
      <span className="tile-label">{label}{required ? ' *' : ''}</span>
      <span className="tile-hint">{value ? 'Tap to replace' : 'Tap to upload or capture'}</span>
      <style>{`
        .tile {
          display: grid; place-items: center; gap: 8px; padding: 22px; border-radius: 14px; cursor: pointer;
          border: 1.5px dashed var(--stroke-strong); background: rgba(255, 255, 255, 0.02); text-align: center; transition: 0.18s;
        }
        .tile:hover { border-color: rgba(245, 197, 66, 0.5); background: rgba(245, 197, 66, 0.05); }
        .tile.filled { border-style: solid; border-color: rgba(22, 199, 132, 0.4); }
        .tile img { width: 100%; max-height: 160px; object-fit: contain; border-radius: 10px; }
        .tile-icon { font-size: 30px; }
        .tile-label { font-size: 13.5px; font-weight: 600; }
        .tile-hint { font-size: 11.5px; color: var(--dim); }
      `}</style>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Live face capture + liveness challenge sequence
 * ------------------------------------------------------------------ */
function LivenessStep({ docFront, onDone, onBack }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camera, setCamera] = useState('idle');
  const [prompt, setPrompt] = useState('');
  const [hint, setHint] = useState('');
  const [progress, setProgress] = useState(0);
  const [faceOk, setFaceOk] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamera('ready');
    } catch (err) {
      setCamera('error');
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser and try again.'
          : 'No camera could be started on this device.'
      );
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Idle face framing feedback
  useEffect(() => {
    if (camera !== 'ready' || running) return undefined;
    let alive = true;
    const loop = async () => {
      while (alive) {
        if (videoRef.current?.readyState >= 2) {
          // eslint-disable-next-line no-await-in-loop
          const face = await detectFace(videoRef.current, 200);
          if (alive) setFaceOk(Boolean(face));
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    loop();
    return () => { alive = false; };
  }, [camera, running]);

  const run = async () => {
    if (!videoRef.current) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const challenges = pickChallenges(3);
      const results = [];
      for (const challenge of challenges) {
        setPrompt(challenge.prompt);
        setHint(challenge.hint);
        setProgress(0);
        // eslint-disable-next-line no-await-in-loop
        const r = await runChallenge(videoRef.current, challenge, {
          durationMs: 2800,
          onProgress: (p, face) => { setProgress(p); setFaceOk(Boolean(face)); },
        });
        results.push(r);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, 350));
      }

      setPrompt('Hold still — capturing');
      const canvas = drawToCanvas(videoRef.current, 720);
      const shot = canvas.toDataURL('image/jpeg', 0.9);
      const liveness = scoreLiveness(results);
      const match = await matchFaces(docFront, shot);

      setResult({
        selfie: shot,
        livenessScore: liveness.score,
        framesAnalysed: liveness.framesAnalysed,
        checks: liveness.checks,
        faceMatchScore: match.score,
        detector: match.detector || 'n/a',
        matchError: match.error || '',
      });
      setPrompt('');
    } catch (err) {
      setError(err.message || 'The face check could not be completed.');
    } finally {
      setRunning(false);
      setProgress(0);
    }
  };

  const accept = () => {
    stopCamera();
    onDone(result);
  };

  return (
    <>
      <h3>Live face verification</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        We run a randomised challenge sequence to prove a real person is present, then compare your face with the
        portrait on your document.
      </p>

      {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}

      <div className="cam-wrap">
        <div className={`cam ${faceOk ? 'ok' : ''}`}>
          <video ref={videoRef} playsInline muted />
          <div className="oval" />
          {camera !== 'ready' && (
            <div className="cam-overlay">
              {camera === 'starting' ? <span className="spinner" /> : <button className="btn btn-gold" onClick={startCamera}>Enable camera</button>}
            </div>
          )}
          {prompt && (
            <div className="prompt">
              <strong>{prompt}</strong>
              <span>{hint}</span>
              <div className="bar"><i style={{ width: `${progress * 100}%` }} /></div>
            </div>
          )}
          {camera === 'ready' && !running && !prompt && (
            <div className={`framing ${faceOk ? 'ok' : ''}`}>{faceOk ? 'Face detected' : 'Center your face in the oval'}</div>
          )}
        </div>

        <div className="cam-side">
          {result ? (
            <>
              <div className="score-card">
                <span>Liveness</span>
                <strong className={result.livenessScore >= 60 ? 'up' : 'down'}>{result.livenessScore}%</strong>
              </div>
              <div className="score-card">
                <span>Face match vs ID</span>
                <strong className={result.faceMatchScore >= 55 ? 'up' : 'down'}>{result.faceMatchScore}%</strong>
              </div>
              {result.matchError && <div className="alert alert-warn small">{result.matchError} Your case will still be reviewed manually.</div>}
              <ul className="checks">
                {result.checks.map((c) => (
                  <li key={c.id} className={c.passed ? 'pass' : 'fail'}>
                    {c.passed ? '✓' : '✕'} {c.id.replace('_', ' ').toLowerCase()} <em>({c.frames} frames)</em>
                  </li>
                ))}
              </ul>
              <img className="shot" src={result.selfie} alt="Live capture" />
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm btn-ghost" onClick={run}>Retry</button>
                <button className="btn btn-sm btn-gold grow" onClick={accept}>Use this capture →</button>
              </div>
            </>
          ) : (
            <>
              <ol className="tips">
                <li>Find even, front-facing lighting.</li>
                <li>Remove hats, sunglasses and masks.</li>
                <li>Follow each on-screen instruction until it completes.</li>
              </ol>
              <button className="btn btn-gold btn-block" disabled={camera !== 'ready' || running} onClick={run}>
                {running ? <span className="spinner" /> : 'Start liveness check'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={() => { stopCamera(); onBack(); }}>← Back</button>
      </div>

      <style>{`
        .cam-wrap { display: grid; grid-template-columns: 1.15fr 1fr; gap: 18px; margin: 18px 0; }
        .cam { position: relative; border-radius: 16px; overflow: hidden; background: #05070b; border: 2px solid var(--stroke); aspect-ratio: 4 / 3; }
        .cam.ok { border-color: rgba(22, 199, 132, 0.55); }
        .cam video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); display: block; }
        .oval {
          position: absolute; inset: 12% 22%; border: 2px dashed rgba(245, 197, 66, 0.5);
          border-radius: 50% / 42%; pointer-events: none;
        }
        .cam-overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(5, 7, 11, 0.75); }
        .prompt {
          position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 12px 14px; border-radius: 12px;
          background: rgba(8, 11, 17, 0.88); backdrop-filter: blur(8px); border: 1px solid rgba(245, 197, 66, 0.35);
        }
        .prompt strong { display: block; font-size: 14.5px; color: var(--gold-1); }
        .prompt span { font-size: 11.5px; color: var(--muted); }
        .bar { height: 3px; background: rgba(255, 255, 255, 0.12); border-radius: 3px; margin-top: 8px; overflow: hidden; }
        .bar i { display: block; height: 100%; background: var(--gold-grad); transition: width 0.12s linear; }
        .framing {
          position: absolute; top: 12px; left: 50%; transform: translateX(-50%); padding: 6px 14px; border-radius: 999px;
          font-size: 12px; background: rgba(8, 11, 17, 0.8); border: 1px solid var(--stroke); color: var(--muted); white-space: nowrap;
        }
        .framing.ok { color: var(--up); border-color: rgba(22, 199, 132, 0.4); }
        .cam-side { display: grid; gap: 12px; align-content: start; }
        .score-card { display: flex; justify-content: space-between; align-items: center; padding: 13px 15px; border-radius: 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--stroke); }
        .score-card span { font-size: 12.5px; color: var(--muted); }
        .score-card strong { font-size: 20px; font-family: var(--mono); }
        .checks { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 12.5px; }
        .checks li.pass { color: var(--up); }
        .checks li.fail { color: var(--down); }
        .checks em { color: var(--dim); font-style: normal; font-size: 11px; }
        .shot { width: 100%; border-radius: 12px; border: 1px solid var(--stroke); }
        .tips { margin: 0; padding-left: 18px; color: var(--muted); font-size: 13px; line-height: 1.9; }
        .small { font-size: 12.5px; }
        @media (max-width: 780px) { .cam-wrap { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
