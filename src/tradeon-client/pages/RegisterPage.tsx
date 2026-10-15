import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@/tradeon-client/compat/react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { COUNTRIES } from "../lib/countries";
import { AuthBrandPanel } from "./LoginPage";
import "../styles/auth.css";

type Country = { code: string; name: string };

function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] ?? "" };
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, error, fields } = useAuthStore();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    country: "",
    phone: "",
  });
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [localError, setLocalError] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => passwordStrength(form.password), [form.password]);

  useEffect(() => {
    document.title = "Create account · TRADEON";
  }, []);

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setLocalError("");
    if (form.password !== confirm) {
      setLocalError("Passwords do not match.");
      return;
    }
    if (!agree) {
      setLocalError("Please accept the Terms of Service to continue.");
      return;
    }
    setBusy(true);
    const ok = await register(form);
    setBusy(false);
    if (ok) navigate("/dashboard");
  };

  return (
    <main className="auth">
      <AuthBrandPanel />

      <section className="auth-panel">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h1>Create your account</h1>
          <p className="subtitle">Start with a free $10,000 demo balance — no card required</p>

          <label>
            Full name
            <input
              type="text"
              name="fullName"
              autoComplete="name"
              placeholder="Your full name"
              value={form.fullName}
              onChange={set("fullName")}
              aria-invalid={Boolean(fields?.fullName)}
            />
            {fields?.fullName && <span className="field-error">{fields.fullName}</span>}
          </label>

          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={set("email")}
              aria-invalid={Boolean(fields?.email)}
            />
            {fields?.email && <span className="field-error">{fields.email}</span>}
          </label>

          <label>
            Password
            <span className="auth-pass">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={set("password")}
                aria-invalid={Boolean(fields?.password)}
              />
              <button
                type="button"
                className="eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon open={showPassword} />
              </button>
            </span>
            {form.password && (
              <span className="auth-strength" aria-live="polite">
                <span className="bars">
                  {[1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={`bar${strength.score >= i ? ` on-${strength.score}` : ""}`}
                    />
                  ))}
                </span>
                <span className="label">{strength.label}</span>
              </span>
            )}
            {fields?.password && <span className="field-error">{fields.password}</span>}
          </label>

          <label>
            Confirm password
            <input
              type={showPassword ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={Boolean(confirm && confirm !== form.password)}
            />
            {confirm && confirm !== form.password && (
              <span className="field-error">Passwords do not match.</span>
            )}
          </label>

          <div className="row-two">
            <label>
              Country
              <select
                name="country"
                value={form.country}
                onChange={set("country")}
                aria-invalid={Boolean(fields?.country)}
              >
                <option value="">Select country</option>
                {(COUNTRIES as Country[]).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fields?.country && <span className="field-error">{fields.country}</span>}
            </label>
            <label>
              Phone
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="+880…"
                value={form.phone}
                onChange={set("phone")}
              />
              {fields?.phone && <span className="field-error">{fields.phone}</span>}
            </label>
          </div>

          <label className="auth-terms">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I confirm that I am 18 or older and I agree to the{" "}
              <a href="/" onClick={(e) => e.preventDefault()}>
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/" onClick={(e) => e.preventDefault()}>
                Privacy Policy
              </a>
              .
            </span>
          </label>

          {(localError || error) && (
            <div className="form-error" role="alert">
              {localError || error}
            </div>
          )}

          <button type="submit" disabled={busy}>
            {busy ? "Creating your account…" : "Create free account"}
          </button>

          <p className="alt">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>

          <p className="auth-secure">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Your data is encrypted and never shared
          </p>
        </form>
      </section>
    </main>
  );
}
