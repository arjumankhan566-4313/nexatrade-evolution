/**
 * AdminLoginPage — 1:1 port of legacy src/app/nexa-admin-portal/login/page.jsx.
 *
 * Adaptations for V2:
 *   • submit uses the V2 authStore.login() (POST /api/auth/login) — admin auth
 *     in V2 is the same JWT session as users; access is gated by role === 'ADMIN'.
 *   • styled-jsx `<style jsx>` → a plain scoped `<style>` (Vite has no styled-jsx).
 *   • next/navigation useRouter → aliased shim (react-router navigate).
 */
import { useState } from "react";
import { useNavigate } from "@/tradeon-client/compat/react-router-dom";
import { Eye, EyeOff, LockKeyhole, ArrowRight } from "lucide-react";
import BrandMark from "@/tradeon-client/components/BrandMark";
import { useAdminAuthStore } from "@/tradeon-client/stores/adminAuthStore";
import "@/tradeon-client/styles/admin.css";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const login = useAdminAuthStore((s) => s.login);
  const [form, setForm] = useState({ email: "", password: "", twoFactorCode: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: any) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(form.email, form.password, form.twoFactorCode || undefined);
    if (ok) {
      navigate("/admin", { replace: true });
      return;
    }
    setBusy(false);
  };

  const requiresTwoFactor = useAdminAuthStore((s) => s.requiresTwoFactor);
  const error = useAdminAuthStore((s) => s.error);
  const fields = useAdminAuthStore((s) => s.fields) || {};

  return (
    <div className="wrap nt-login">
      <form className="glass card admin-login-card" onSubmit={submit}>
        <BrandMark size={34} subtitle="Control Center" />
        <div className="admin-login-eyebrow">
          <LockKeyhole size={14} /> ADMINISTRATION
        </div>
        <h1>Welcome to Control Center</h1>
        <p className="muted">Sign in with your administrator account to manage your platform.</p>

        {error && (
          <div className="alert alert-error" style={{ marginTop: 18 }} role="alert">
            <strong>{error}</strong>
          </div>
        )}

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="admin-email">Administrator email</label>
          <input
            id="admin-email"
            className={`input ${fields.email ? "input-error" : ""}`}
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            required
            disabled={busy}
            value={form.email}
            onChange={set("email")}
          />
          {fields.email && <span className="field-error">{fields.email}</span>}
        </div>

        <div className="field">
          <label htmlFor="admin-password">Password</label>
          <div className="admin-password-wrap">
            <input
              id="admin-password"
              className={`input ${fields.password ? "input-error" : ""}`}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              disabled={busy}
              value={form.password}
              onChange={set("password")}
            />
            <button
              className="admin-password-toggle"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {fields.password && <span className="field-error">{fields.password}</span>}
        </div>

        {requiresTwoFactor && (
          <div className="field">
            <label htmlFor="admin-two-factor">Two-factor authentication code</label>
            <input
              id="admin-two-factor"
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={form.twoFactorCode}
              onChange={set("twoFactorCode")}
              placeholder="6-digit code or backup code"
            />
          </div>
        )}

        <button className="btn btn-gold btn-block" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <span className="spinner" /> Signing in…
            </>
          ) : (
            <>
              Access Control Center <ArrowRight size={17} />
            </>
          )}
        </button>
        <p className="admin-login-note">
          <LockKeyhole size={12} /> Secure administrator session
        </p>
      </form>

      <style>{`
        .nt-login {
          min-height: 100svh;
          display: grid;
          place-items: center;
          padding: 30px 18px;
          background:
            radial-gradient(60% 50% at 50% 0%, rgba(234, 57, 67, 0.08), transparent 60%),
            radial-gradient(50% 50% at 80% 100%, rgba(0, 242, 254, 0.09), transparent 65%), #080b11;
        }
        .nt-login .card { width: min(430px, 100%); padding: 34px 30px; }
        .nt-login h1 { margin: 22px 0 6px; font-size: 22px; }
        .nt-login p { margin: 0; font-size: 13px; line-height: 1.6; }
        .nt-login .hint { display: block; margin-top: 6px; font-size: 12px; opacity: 0.85; font-family: var(--mono); line-height: 1.5; }
        .nt-login .field-error { display: block; font-size: 12.5px; color: #ff9aa0; margin-top: 6px; }
      `}</style>
    </div>
  );
}
