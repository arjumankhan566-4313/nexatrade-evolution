/**
 * AccountMenu — the account switcher shared by BOTH top bars (the chart header
 * and the terminal topbar).
 *
 * The trigger keeps each bar's own pill (`variant`), but the dropdown panel is
 * one component: Live ⇄ Demo accounts, the signed-in email and UID, the way into
 * the user panel and log out. Sharing it means the account details can never be
 * missing from one screen while showing on the other — the terminal topbar used
 * to be a bare mode toggle with no panel at all.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/tradeon-client/compat/react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useAccountModeStore } from '../../stores/accountModeStore';
import '../../styles/chart-shell.css';

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountMenu({ variant = 'chart' }: { variant?: 'chart' | 'terminal' }) {
  const { user, logout } = useAuthStore();
  const { mode, setMode } = useAccountModeStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!user) return variant === 'chart' ? <Link to="/login" className="chdr__signin">Sign in</Link> : null;

  const balance = mode === 'real' ? user.balanceReal : user.balanceDemo;
  const shown = (n: number) => (hidden ? '••••••' : money(n));

  return (
    <div className="chdr__account" ref={menuRef}>
      {variant === 'terminal' ? (
        <div className="terminal-account-display">
          <span className="account-label">{mode === 'real' ? 'REAL' : 'DEMO'}</span>
          <button
            type="button"
            className={`account-balance-btn ${menuOpen ? 'is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={`account-mode-dot ${mode}`} />
            <span className="mono">{shown(balance)}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`chdr__account-btn ${menuOpen ? 'is-open' : ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="chdr__account-text">
            <small>{mode === 'real' ? 'LIVE ACCOUNT' : 'DEMO ACCOUNT'}</small>
            <strong>{shown(balance)}</strong>
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {menuOpen && (
        <div className="chdr__menu" role="menu" aria-label="Account">
          <div className="chdr__menu-head">
            <div className="chdr__menu-id">
              <span className="chdr__menu-tier">{user.isStaff ? 'STAFF' : 'STANDARD'}</span>
              <strong>{user.fullName}</strong>
              <span className="chdr__menu-mail">{user.email}</span>
              <span className="chdr__menu-uid">UID: {user.id.slice(0, 8)}</span>
            </div>
            <button
              type="button"
              className="chdr__menu-eye"
              aria-label={hidden ? 'Show balances' : 'Hide balances'}
              onClick={() => setHidden((v) => !v)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
                {hidden && <path d="M3 3l18 18" />}
              </svg>
            </button>
          </div>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'real'}
            className={`chdr__acct ${mode === 'real' ? 'is-active' : ''}`}
            onClick={() => setMode('real')}
          >
            <span className="chdr__acct-radio" />
            <span className="chdr__acct-body">
              <strong>Live Account</strong>
              <span>{shown(user.balanceReal)}</span>
            </span>
          </button>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'demo'}
            className={`chdr__acct is-demo ${mode === 'demo' ? 'is-active' : ''}`}
            onClick={() => setMode('demo')}
          >
            <span className="chdr__acct-radio" />
            <span className="chdr__acct-body">
              <strong>Demo Account</strong>
              <span>{shown(user.balanceDemo)}</span>
            </span>
            <Link
              to="/dashboard/security"
              className="chdr__acct-edit"
              aria-label="Account settings"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </Link>
          </button>

          <nav className="chdr__menu-links" aria-label="User panel">
            <Link to="/dashboard" role="menuitem" onClick={() => setMenuOpen(false)}>My Account</Link>
            <Link to="/dashboard/wallet" role="menuitem" onClick={() => setMenuOpen(false)}>Wallet &amp; payments</Link>
            <Link to="/dashboard/kyc" role="menuitem" onClick={() => setMenuOpen(false)}>Profile &amp; Address</Link>
            <Link to="/dashboard/history" role="menuitem" onClick={() => setMenuOpen(false)}>Trade history</Link>
            <Link to="/dashboard/security" role="menuitem" onClick={() => setMenuOpen(false)}>Security</Link>
          </nav>

          <button
            type="button"
            className="chdr__menu-out"
            onClick={() => { setMenuOpen(false); void logout(); }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
