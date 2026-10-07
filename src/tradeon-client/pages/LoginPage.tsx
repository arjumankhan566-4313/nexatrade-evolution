import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@/tradeon-client/compat/react-router-dom';
import { useAuthStore } from '../stores/authStore';
import '../styles/auth.css';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function AuthBrandPanel() {
  return (
    <aside className="auth-brand">
      <div className="auth-brand-top">
        <Link to="/" className="auth-logo" aria-label="TRADEON home">
          <img className="auth-logo-mark" src="/brand/tradeon-mark.png" alt="TRADEON" />
          <img className="auth-logo-word" src="/brand/tradeon-wordmark.png" alt="TRADEON" />
        </Link>
        <Link to="/" className="auth-home-link">← Back to home</Link>
      </div>

      <div className="auth-brand-mid">
        <h2>
          Trade the markets<br />
          <span className="accent">with total confidence.</span>
        </h2>
        <p>
          One account for crypto, stocks, forex, commodities and indices —
          with lightning-fast execution and institutional-grade security.
        </p>
        <ul className="auth-features">
          <li><span className="tick">✓</span> 360+ instruments, live around the clock</li>
          <li><span className="tick">✓</span> Up to 92% payout on winning trades</li>
          <li><span className="tick">✓</span> Free $10,000 demo account to practice</li>
          <li><span className="tick">✓</span> Two-factor security &amp; encrypted sessions</li>
        </ul>
      </div>

      <div className="auth-brand-bottom">
        <div className="auth-stat"><b>360+</b><span>Instruments</span></div>
        <div className="auth-stat"><b>24/7</b><span>Live markets</span></div>
        <div className="auth-stat"><b>92%</b><span>Max payout</span></div>
      </div>
    </aside>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, requiresTwoFactor, error, fields } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · TRADEON';
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await login(email, password, twoFactorCode || undefined);
    setBusy(false);
    if (ok) navigate('/dashboard');
  };

  return (
    <main className="auth">
      <AuthBrandPanel />

      <section className="auth-panel">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to your TRADEON account</p>

          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(fields?.email)}
            />
            {fields?.email && <span className="field-error">{fields.email}</span>}
          </label>

          <label>
            Password
            <span className="auth-pass">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fields?.password)}
              />
              <button
                type="button"
                className="eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </span>
            {fields?.password && <span className="field-error">{fields.password}</span>}
          </label>

          {requiresTwoFactor && (
            <label>
              Two-factor code
              <input
                type="text"
                name="twoFactorCode"
                inputMode="numeric"
                placeholder="6-digit code or backup code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
              />
            </label>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}

          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="alt">
            New to TRADEON? <Link to="/register">Create a free account</Link>
          </p>

          <p className="auth-secure">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Protected by 256-bit encryption
          </p>
        </form>
      </section>
    </main>
  );
}
