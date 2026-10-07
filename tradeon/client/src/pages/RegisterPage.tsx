import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import '../styles/auth.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, error, fields } = useAuthStore();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', country: '', phone: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Create account · TRADEON';
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await register(form);
    setBusy(false);
    if (ok) navigate('/dashboard');
  };

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <h1>Create account</h1>
        <p className="subtitle">Start with a $10,000 demo balance</p>

        <label>
          Full name
          <input type="text" name="fullName" value={form.fullName} onChange={set('fullName')} aria-invalid={Boolean(fields?.fullName)} />
          {fields?.fullName && <span className="field-error">{fields.fullName}</span>}
        </label>

        <label>
          Email
          <input type="email" name="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={Boolean(fields?.email)} />
          {fields?.email && <span className="field-error">{fields.email}</span>}
        </label>

        <label>
          Password
          <input type="password" name="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-invalid={Boolean(fields?.password)} />
          {fields?.password && <span className="field-error">{fields.password}</span>}
        </label>

        <div className="row-two">
          <label>
            Country (2-letter)
            <input type="text" name="country" maxLength={2} placeholder="BD" value={form.country} onChange={set('country')} aria-invalid={Boolean(fields?.country)} />
            {fields?.country && <span className="field-error">{fields.country}</span>}
          </label>
          <label>
            Phone
            <input type="tel" name="phone" value={form.phone} onChange={set('phone')} />
            {fields?.phone && <span className="field-error">{fields.phone}</span>}
          </label>
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>

        <p className="alt">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
