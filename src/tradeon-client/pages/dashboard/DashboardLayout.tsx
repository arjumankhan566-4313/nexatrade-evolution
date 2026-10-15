/**
 * DashboardLayout — the authenticated user shell.
 * Ported from legacy src/app/dashboard/layout.jsx.
 *
 * Terminal mode (route = /dashboard): sidebar hidden, slim terminal topbar
 * (48px) with account switcher + deposit/withdraw, full-height content with
 * no padding. Non-terminal routes use the icon-rail sidebar + standard topbar.
 */
import { useCallback, useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
} from "@/tradeon-client/compat/react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useAccountModeStore } from "../../stores/accountModeStore";
import AccountMenu from "../../components/layout/AccountMenu";
import BrandMark from "../../components/BrandMark";
import NotificationsBell from "../../components/layout/NotificationsBell";
import { initPerfMonitor } from "../../lib/perfMonitor";
import "../../styles/dashboard.css";
import "../../styles/terminal.css";

/* ── Inline SVG icons (no icon library dependency) ── */
const Icon = ({ path, size = 18 }: { path: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
);

const ICONS = {
  terminal: "M3 3v18h18M7 16l4-8 4 4 4-6",
  multi: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M6 4v6a6 6 0 0 0 12 0V4M6 4H4.5M18 4h1.5M6 4h12M12 16v4M8 20h8",
  handshake: "M11 17l-5-5 4-4 5 5M11 17l3 3 5-5-3-3M11 17l-3 3-5-5 3-3",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  kyc: "M9 12l2 2 4-4M21 12c0 5-9 9-9 9s-9-4-9-9a9 9 0 0 1 18 0z",
  history: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 12h18M3 6h18M3 18h18",
  close: "M18 6L6 18M6 6l12 12",
  chart: "M3 3v18h18",
  chevronDown: "M6 9l6 6 6-6",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0",
};

interface NavItem {
  to: string;
  label: string;
  icon: string;
  badge?: string;
}

const ADMIN_NAV_ITEM: NavItem = {
  to: "/dashboard/admin",
  label: "Admin Panel",
  icon: "M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z",
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Trading",
    items: [
      { to: "/dashboard", label: "Terminal", icon: ICONS.terminal },
      { to: "/dashboard/multi", label: "Multi-Chart", icon: ICONS.multi },
    ],
  },
  {
    label: "Social",
    items: [
      { to: "/dashboard/social", label: "Copy Trading", icon: ICONS.users },
      { to: "/dashboard/tournaments", label: "Tournaments & VIP", icon: ICONS.trophy },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/dashboard/affiliate", label: "Affiliate", icon: ICONS.handshake, badge: "40%" },
      { to: "/dashboard/wallet", label: "Wallet", icon: ICONS.wallet },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/dashboard/kyc", label: "KYC Profile", icon: ICONS.kyc },
      { to: "/dashboard/history", label: "History", icon: ICONS.history },
      { to: "/dashboard/security", label: "Security", icon: ICONS.security },
      { to: "/dashboard/chat", label: "Support Chat", icon: ICONS.chat },
    ],
  },
];

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Trade", icon: ICONS.terminal },
  { to: "/dashboard/history", label: "History", icon: ICONS.history },
  { to: "/dashboard/wallet", label: "Wallet", icon: ICONS.wallet },
];

const KYC_BADGE: Record<string, [string, string]> = {
  NONE: ["badge", "Not verified"],
  PENDING: ["badge badge-warn", "Pending"],
  UNDER_REVIEW: ["badge badge-warn", "Under review"],
  VERIFIED: ["badge badge-up", "Verified"],
  REJECTED: ["badge badge-down", "Rejected"],
};

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardLayout() {
  const { user, status, logout } = useAuthStore();
  const { mode, setMode } = useAccountModeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(true);

  // Initialize RUM monitoring for user panel
  useEffect(() => {
    initPerfMonitor("user");
  }, []);

  const isTerminal = location.pathname === "/dashboard";

  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    if (status === "guest") navigate("/login", { replace: true });
  }, [status, navigate]);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  // Only a cold start blanks the shell. A mid-session re-read must never
  // unmount the page (it used to flash "Loading…" and drop the account details
  // and the open chat conversation with it).
  if ((status === "loading" || status === "idle") && !user) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100svh",
          color: "var(--muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) return null;

  const [badgeClass, badgeText] = KYC_BADGE[user.kycStatus] || KYC_BADGE.NONE;
  const currentLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((item) => item.to === location.pathname)?.label ||
    "Workspace";

  /* ═══════════════════════════════════════════════════════════════════
     TERMINAL MODE — sidebar hidden, slim 48px topbar, no content padding.
     The terminal page (TerminalPage) owns its own left rail + chart + ticket.
     ═══════════════════════════════════════════════════════════════════ */
  if (isTerminal) {
    return (
      <div className="dash-shell terminal-shell">
        <div className="dash-main dash-terminal-main">
          {/* ── Terminal topbar (48px, slim) — legacy layout.jsx ── */}
          <header className="dash-terminal-topbar">
            <div className="terminal-brand-wrap">
              <span className="dash-terminal-logo">
                <BrandMark size={26} withText={false} />
              </span>
              <div id="terminal-asset-slot" />
            </div>
            <div className="terminal-topbar-right">
              {/* Notifications — the account's own notification centre (never a
                  link into Support). */}
              <NotificationsBell buttonClassName="terminal-bell-btn" />
              {/* Account switcher — same panel as the chart header: Live ⇄ Demo,
                  email and UID. */}
              <AccountMenu variant="terminal" />
              <NavLink to="/dashboard/wallet" className="terminal-deposit-btn">
                + Deposit
              </NavLink>
              <NavLink to="/dashboard/wallet" className="terminal-withdraw-link">
                Withdrawal
              </NavLink>
            </div>
          </header>

          {/* ── Terminal content: no padding, full height ── */}
          <main className="dash-content dash-terminal-content" id="user-content">
            <Outlet />
          </main>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     STANDARD MODE — icon-rail sidebar + standard topbar (non-terminal routes)
     ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="dash-shell">
      {/* ── SIDEBAR ── */}
      <aside
        className={`dash-sidebar ${menuOpen ? "open" : ""} ${railExpanded ? "" : "collapsed"}`}
      >
        <div className="dash-sidebar-top">
          <span className="dash-brand">
            <BrandMark size={30} withText={railExpanded} />
          </span>
          <button
            type="button"
            className="dash-rail-toggle"
            onClick={() => setRailExpanded((v) => !v)}
            aria-label={railExpanded ? "Collapse navigation" : "Expand navigation"}
          >
            <Icon path={railExpanded ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} size={17} />
          </button>
        </div>

        <nav className="dash-sidebar-nav" aria-label="Account navigation">
          {NAV_GROUPS.map((group) => (
            <div className="dash-nav-section" key={group.label}>
              <div className="dash-nav-section-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/dashboard"}
                  className={({ isActive }: { isActive: boolean }) =>
                    `dash-nav-item ${isActive ? "active" : ""}`
                  }
                  title={!railExpanded ? item.label : undefined}
                >
                  <Icon path={item.icon} />
                  <span className="dash-nav-label">{item.label}</span>
                  {item.badge && <span className="dash-nav-badge">{item.badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ── ADMIN NAV (staff only) ── */}
        {user.isStaff && (
          <nav className="dash-sidebar-nav" style={{ flex: 0, padding: "0 10px 4px" }}>
            <div className="dash-nav-section">
              <div className="dash-nav-section-label">Admin</div>
              <NavLink
                to={ADMIN_NAV_ITEM.to}
                className={({ isActive }: { isActive: boolean }) =>
                  `dash-nav-item ${isActive ? "active" : ""}`
                }
                title={!railExpanded ? ADMIN_NAV_ITEM.label : undefined}
              >
                <Icon path={ADMIN_NAV_ITEM.icon} />
                <span className="dash-nav-label">{ADMIN_NAV_ITEM.label}</span>
              </NavLink>
            </div>
          </nav>
        )}

        {/* ── USER FOOTER ── */}
        <div className="dash-sidebar-foot">
          <div className="dash-user-chip">
            <div className="dash-avatar">{user.fullName.charAt(0).toUpperCase()}</div>
            <div style={{ overflow: "hidden" }}>
              <strong>{user.fullName}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <span className={badgeClass} style={{ marginBottom: 12 }}>
            {badgeText}
          </span>
          <button className="btn btn-sm btn-ghost btn-block" onClick={handleLogout}>
            <Icon path={ICONS.logout} size={14} /> Log out
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="dash-scrim open"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* ── MAIN ── */}
      <div className="dash-main">
        <header className="dash-topbar">
          <button
            className="btn btn-sm btn-ghost dash-mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            <Icon path={ICONS.menu} size={20} />
          </button>
          <span className="dash-breadcrumb">{currentLabel}</span>
          <div className="dash-topbar-right">
            <div className="mode-switch" role="tablist" aria-label="Account mode">
              <button
                role="tab"
                aria-selected={mode === "real"}
                className={mode === "real" ? "active-real" : ""}
                onClick={() => setMode("real")}
              >
                REAL <span className="mode-amt">{money(user.balanceReal)}</span>
              </button>
              <button
                role="tab"
                aria-selected={mode === "demo"}
                className={mode === "demo" ? "active-demo" : ""}
                onClick={() => setMode("demo")}
              >
                DEMO <span className="mode-amt">{money(user.balanceDemo)}</span>
              </button>
            </div>
            <NavLink to="/dashboard/wallet" className="btn btn-sm btn-gold dash-deposit-btn">
              Deposit
            </NavLink>
          </div>
        </header>

        <main className="dash-content" id="user-content">
          <Outlet />
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="dash-bottom-nav" aria-label="Primary mobile navigation">
        {BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            className={({ isActive }: { isActive: boolean }) =>
              `dash-bottom-item ${isActive ? "active" : ""}`
            }
          >
            <Icon path={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
