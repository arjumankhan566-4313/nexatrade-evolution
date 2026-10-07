/**
 * AdminLoginModal — 3D glassmorphism popup for entering admin credentials.
 * Shown as a modal overlay when the user visits /admin without an admin
 * session. Uses the separate adminAuthStore (POST /api/admin/login).
 *
 * Design: animated glass card with framer-motion entrance, 3D perspective
 * tilt, gold accent gradient, and background blur — matching the legacy
 * admin portal's visual language.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, LockKeyhole, ArrowRight, ShieldAlert } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

export default function AdminLoginModal() {
  const login = useAdminAuthStore((s) => s.login);
  const error = useAdminAuthStore((s) => s.error);
  const fields = useAdminAuthStore((s) => s.fields);
  const requiresTwoFactor = useAdminAuthStore((s) => s.requiresTwoFactor);
  const [form, setForm] = useState({ email: '', password: '', twoFactorCode: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await login(form.email, form.password, form.twoFactorCode || undefined);
    setBusy(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="admin-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.form
          className="glass card admin-modal-card"
          onSubmit={submit}
          initial={{ scale: 0.85, rotateX: 12, opacity: 0, y: 30 }}
          animate={{ scale: 1, rotateX: 0, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          style={{ transformPerspective: 1200 }}
        >
          {/* Glow orbs */}
          <span className="admin-modal-glow admin-modal-glow-1" />
          <span className="admin-modal-glow admin-modal-glow-2" />

          <BrandMark size={36} subtitle="Control Center" />

          <div className="admin-modal-eyebrow">
            <LockKeyhole size={14} /> ADMINISTRATION
          </div>

          <h1>Admin Sign In</h1>
          <p className="muted">Enter your administrator credentials to access the control center.</p>

          {error && (
            <div className="alert alert-error" style={{ marginTop: 16 }} role="alert">
              <strong>{error}</strong>
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="modal-admin-email">Administrator email</label>
            <input
              id="modal-admin-email"
              className={`input ${fields?.email ? 'input-error' : ''}`}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              required
              disabled={busy}
              value={form.email}
              onChange={set('email')}
            />
            {fields?.email && <span className="field-error">{fields.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="modal-admin-password">Password</label>
            <div className="admin-password-wrap">
              <input
                id="modal-admin-password"
                className={`input ${fields?.password ? 'input-error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                disabled={busy}
                value={form.password}
                onChange={set('password')}
              />
              <button
                className="admin-password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fields?.password && <span className="field-error">{fields.password}</span>}
          </div>

          {requiresTwoFactor && (
            <div className="field">
              <label htmlFor="modal-admin-2fa">Two-factor code</label>
              <input
                id="modal-admin-2fa"
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={form.twoFactorCode}
                onChange={set('twoFactorCode')}
                placeholder="6-digit code or backup code"
              />
            </div>
          )}

          <button type="submit" className="btn btn-gold btn-block" disabled={busy} aria-busy={busy}>
            {busy ? <><span className="spinner" /> Signing in…</> : <>Access Control Center <ArrowRight size={17} /></>}
          </button>

          <p className="admin-login-note">
            <ShieldAlert size={12} /> Secure administrator session — separate from user login
          </p>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
