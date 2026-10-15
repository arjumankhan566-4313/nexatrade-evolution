/**
 * AdminLayout — 1:1 port of legacy src/app/nexa-admin-portal/layout.jsx.
 *
 * STANDALONE admin shell — mounted under the `/admin` route tree, completely
 * SEPARATE from the user `/dashboard` shell. Renders its own animated sidebar
 * (framer-motion), topbar with LiveStatus + Notification bell + AlertHost.
 *
 * Adaptations for V2 / react-router:
 *   • {children} → <Outlet /> (react-router nested routes)
 *   • next/navigation usePathname/useRouter → aliased shims (react-router)
 *   • next/link Link → aliased shim (react-router Link, href→to)
 *   • /nexa-admin-portal/* hrefs → /admin/*
 *   • overview fetch → /api/admin/stats (the endpoint that exists in V2) with
 *     defensive shape mapping; admin identity + permissions come from the
 *     V2 authStore (an ADMIN gets the full permission set so every module shows).
 *   • the login route is separate (/admin/login), so the isLogin gate is gone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "@/tradeon-client/compat/react-router-dom";
import { usePathname, useRouter } from "@/tradeon-client/lib/nextNavigation";
import Link from "@/tradeon-client/lib/nextLink";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  BadgeCheck,
  ArrowLeftRight,
  Handshake,
  SlidersHorizontal,
  ChartCandlestick,
  Gauge,
  ShieldAlert,
  ScrollText,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Radio,
  Crown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Gift,
  LifeBuoy,
} from "lucide-react";
import { api, money } from "@/tradeon-client/lib/apiClient";
import { useLiveEvents } from "@/tradeon-client/lib/realtimeClient";
import AlertHost from "@/tradeon-client/components/alerts/AlertHost";
import NotificationCenter from "@/tradeon-client/components/layout/NotificationCenter";
import { useAlertStore } from "@/tradeon-client/lib/useAlertStore";
import { useAdminAuthStore } from "@/tradeon-client/stores/adminAuthStore";
import AdminLoginModal from "./AdminLoginModal";
import BrandMark from "@/tradeon-client/components/BrandMark";
import "@/tradeon-client/styles/admin.css";
import "@/tradeon-client/styles/panel-repairs.css";
import "@/tradeon-client/styles/admin-module-utils.css";
import "@/tradeon-client/styles/admin-database.css";
import "@/tradeon-client/styles/admin-performance.css";
import { initPerfMonitor } from "@/tradeon-client/lib/perfMonitor";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/promos", label: "Promos", icon: Gift, permission: "settings:manage" },
  { href: "/admin/users", label: "Users", icon: Users, permission: "users:view" },
  {
    href: "/admin/kyc",
    label: "KYC Verification",
    icon: BadgeCheck,
    badge: "kyc",
    permission: "kyc:review",
  },
  {
    href: "/admin/finance",
    label: "Deposits / Withdrawals",
    icon: ArrowLeftRight,
    badge: "finance",
    permission: "finance:view",
  },
  {
    href: "/admin/affiliate",
    label: "Affiliate Network",
    icon: Handshake,
    permission: "users:view",
  },
  { href: "/admin/support", label: "Support Tickets", icon: LifeBuoy, permission: "users:view" },
  { href: "/admin/risk", label: "Risk Engine", icon: SlidersHorizontal, permission: "risk:manage" },
  {
    href: "/admin/otc",
    label: "OTC Markets",
    icon: Radio,
    permission: "assets:manage",
    eyebrow: "24/7 SYNTHETIC MARKET",
  },

  { href: "/admin/fraud", label: "Fraud Monitor", icon: ShieldAlert, permission: "fraud:view" },
  { href: "/admin/logs", label: "System Logs", icon: ScrollText, permission: "logs:view" },
  {
    href: "/admin/database",
    label: "Database Health",
    icon: LayoutDashboard,
    eyebrow: "STORAGE & CONTROL",
  },
  {
    href: "/admin/performance",
    label: "Performance & Speed",
    icon: Gauge,
    eyebrow: "MONITORING & OPTIMIZATION",
  },
];

const ADMIN_ALERT_TOPICS = [
  "admin",
  "finance",
  "payments",
  "settings",
  "assets",
  "maintenance",
  "affiliate_application",
];

function LiveStatus() {
  const wasLive = useRef<any>(false);
  const seen = useRef(new Set());
  const onEvent = useCallback((e: any) => {
    if (!e || !e.topic || e.topic === "ping" || e.topic === "hello") return;
    if (e.id) {
      if (seen.current.has(e.id)) return;
      seen.current.add(e.id);
      if (seen.current.size > 500) seen.current = new Set([...seen.current].slice(-250));
    }
    const push = (severity: any, title: any, message: any) =>
      (useAlertStore.getState() as any).pushToast({ severity, title, message });
    const p = e.payload || {};
    if (e.topic === "finance" && p.type) {
      push(
        p.type === "WITHDRAWAL" ? "warning" : "info",
        `${p.type === "WITHDRAWAL" ? "Withdrawal" : "Deposit"} request`,
        `${money(p.amount)} via ${p.method || p.gateway || "gateway"} is waiting in the finance queue.`,
      );
    } else if (e.topic === "admin" && p.kind === "trade_settled" && p.trade) {
      const t = p.trade;
      const won = t.status === "WON";
      (useAlertStore.getState() as any).logNotification({
        severity: won ? "warning" : "success",
        title: `Trade ${t.status.toLowerCase()} · ${t.symbol}`,
        message: `${t.accountType} · stake ${money(t.stake)} · ${won ? `payout ${money(t.profit)}` : "platform keeps the stake"}`,
        channel: "toast",
      });
    } else if (e.topic === "maintenance") {
      push(
        p.enabled ? "critical" : "success",
        p.enabled ? "Maintenance mode ON" : "Maintenance mode OFF",
        p.enabled ? "Trading is paused for every user." : "Trading resumed for every user.",
      );
    } else if (e.topic === "settings" && Array.isArray(p.changed) && p.changed.length) {
      push("info", "Platform config published", `${p.changed.join(", ")} — live for all users.`);
    } else if (e.topic === "affiliate_application") {
      push(
        "info",
        "New affiliate application",
        p.email || p.name || "A partner application is waiting for review.",
      );
    }
  }, []);

  const { status } = useLiveEvents({ scope: "admin", topics: ADMIN_ALERT_TOPICS, onEvent });
  const live = status === "live";

  useEffect(() => {
    if (live) {
      if (wasLive.current === "lost")
        (useAlertStore.getState() as any).pushToast({
          severity: "success",
          message: "Live sync restored.",
          log: false,
        });
      wasLive.current = true;
    } else if (status === "reconnecting" && wasLive.current === true) {
      wasLive.current = "lost";
      (useAlertStore.getState() as any).pushToast({
        severity: "warning",
        message: "Reconnecting to live sync…",
        log: false,
      });
    }
  }, [live, status]);

  return (
    <div className={`nt-live ${live ? "is-live" : ""}`}>
      <span />
      <Radio size={12} />
      {live ? "LIVE SYNC" : "CONNECTING"}
    </div>
  );
}

function AdminNotificationBell() {
  const items = useAlertStore((s: any) => s.notifications);
  const onDismiss = useCallback(
    (id: any) => (useAlertStore.getState() as any).dismissNotification(id),
    [],
  );
  const onMarkAllRead = useCallback(() => (useAlertStore.getState() as any).markAllRead(), []);
  const onClearAll = useCallback(
    () => (useAlertStore.getState() as any).clearAllNotifications(),
    [],
  );
  return (
    <NotificationCenter
      items={items}
      onDismiss={onDismiss}
      onMarkAllRead={onMarkAllRead}
      onClearAll={onClearAll}
      buttonClassName="nt-bell-btn"
    />
  );
}

export default function AdminLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const navigate = useNavigate();
  const { user, status, logout, bootstrap } = useAdminAuthStore();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [pending, setPending] = useState({
    kyc: 0,
    deposits: 0,
    withdrawals: 0,
    affiliate_payouts: 0,
    otc: 0,
  });

  // Bootstrap admin session on mount — checks /api/admin/me for the admin cookie.
  useEffect(() => {
    void bootstrap();
    initPerfMonitor("admin");
  }, [bootstrap]);

  // Admin identity from the separate adminAuthStore.
  const me = user
    ? {
        fullName: user.fullName || user.email || "Operator",
        role: user.role || "Operator",
        permissions: user.permissions || [],
      }
    : null;

  const expiredShown = useRef(false);
  useEffect(() => {
    if (status !== "authenticated") return;
    const load = () =>
      api("/api/admin/overview")
        .then((d: any) => {
          const s = d.stats || {};
          setPending({
            kyc: s.pending?.kyc || 0,
            deposits: s.pending?.deposits || 0,
            withdrawals: s.pending?.withdrawals || 0,
            affiliate_payouts: s.pending?.affiliate_payouts || 0,
            otc: 0,
          });
          setSummary({ users: s.users, trades: s.trades });
        })
        .catch((err: any) => {
          if (err?.status === 401 && !expiredShown.current) {
            expiredShown.current = true;
            logout();
          }
        });
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [status, logout]);

  // Auth guard — guests see the login popup modal, not a redirect.
  // (The modal is rendered inline below when status is 'guest'.)

  useEffect(() => {
    const close = (event: any) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  // Show the login popup modal when not authenticated.
  if (status === "loading" || status === "idle") {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100svh", color: "#6e7a8e" }}>
        Loading control center…
      </div>
    );
  }

  if (status === "guest" || !user) {
    return <AdminLoginModal />;
  }

  const permissionSet = new Set(me?.permissions || []);
  const visibleNav = NAV.filter((item) => !item.permission || permissionSet.has(item.permission));
  const current = visibleNav.find((n) => n.href === pathname) || NAV[0];
  const badgeFor = (n: any) =>
    n.badge === "kyc"
      ? pending.kyc
      : n.badge === "finance"
        ? (pending.deposits || 0) + (pending.withdrawals || 0)
        : n.href.endsWith("/affiliate")
          ? pending.affiliate_payouts || 0
          : n.href.endsWith("/otc")
            ? pending.otc || 0
            : 0;
  const logoutAdmin = async () => {
    await logout();
  };

  return (
    <div className={`nt-shell ${collapsed ? "nt-collapsed" : ""}`}>
      <AnimatePresence>
        {open && (
          <motion.button
            aria-label="Close navigation"
            className="nt-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={`nt-side ${open ? "open" : ""}`}>
        <div className="nt-brand">
          <span className="nt-unified-brand">
            <BrandMark size={36} withText={!collapsed} />
          </span>
          <button
            className="nt-collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button className="nt-close" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="nt-nav-label">COMMAND MODULES</div>

        <nav aria-label="Admin navigation">
          {visibleNav.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.href;
            const count = badgeFor(n);
            return (
              <motion.div
                key={n.href}
                initial={false}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
              >
                <Link
                  href={n.href}
                  title={n.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`nt-item ${active ? "active" : ""}`}
                >
                  <span className="nt-ico">
                    <Icon size={17} strokeWidth={1.8} />
                  </span>
                  <span className="nt-nav-text">{n.label}</span>
                  {count > 0 && <i>{count}</i>}
                  {active && (
                    <motion.span
                      className="nt-arrow"
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    >
                      <ChevronRight size={14} />
                    </motion.span>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="nt-sidefoot">
          <div className="nt-node">
            <span />
            <div>
              <b>
                {summary
                  ? `${summary.users.traders} traders · ${summary.trades.open} open trades`
                  : "Loading platform data…"}
              </b>
              <small>
                {summary
                  ? `${(pending.kyc || 0) + (pending.deposits || 0) + (pending.withdrawals || 0) + (pending.affiliate_payouts || 0)} requests awaiting review`
                  : "Connecting to your database"}
              </small>
            </div>
          </div>
          <Link href="/" className="nt-footbtn">
            <ExternalLink size={15} /> View public site
          </Link>
          <Link href="/dashboard" className="nt-footbtn">
            <ExternalLink size={15} /> View terminal
          </Link>
          <button className="nt-footbtn danger" onClick={logoutAdmin}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      <div className="nt-body">
        <header className="nt-topbar">
          <button className="nt-burger" aria-label="Open navigation" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="nt-heading">
            <small>{current.eyebrow || "ADMIN CONSOLE"} /</small>
            <b>{current.label}</b>
          </div>
          <div className="nt-top-actions">
            <LiveStatus />
            <div className="nt-session">
              <ShieldAlert size={13} /> SECURE SESSION
            </div>
            <AdminNotificationBell />
            <div className="nt-avatar">
              <Crown size={15} />
              <span>{me?.fullName?.split(" ")[0] || "Operator"}</span>
              <small>{me?.role || "LOADING"}</small>
            </div>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>

      <AlertHost />
    </div>
  );
}
