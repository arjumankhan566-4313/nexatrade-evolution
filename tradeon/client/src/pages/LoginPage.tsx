import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import '../styles/auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, requiresTwoFactor, error, fields } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
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
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <h1>Sign in</h1>
        <p className="subtitle">Welcome back to TRADEON</p>

        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields?.email)}
          />
          {fields?.email && <span className="field-error">{fields.email}</span>}
        </label>

        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fields?.password)}
          />
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
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </form>
    </main>
  );
}
