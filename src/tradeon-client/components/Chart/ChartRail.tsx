/**
 * ChartRail — the slim icon rail on the far left of the trading screen.
 *
 * It is the way into the user panel from the chart: every entry is a real
 * route of the authenticated shell (`/dashboard/...`), so nothing is a dead
 * icon. The active entry is the chart itself.
 */
import { NavLink } from "@/tradeon-client/compat/react-router-dom";

const ICONS = {
  chart: "M3 3v18h18M7 15l3.5-5 3 3L20 6",
  terminal: "M3 3v18h18M7 16l4-8 4 4 4-6",
  wallet: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
  history: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M6 4v6a6 6 0 0 0 12 0V4M12 16v4M8 20h8",
  kyc: "M9 12l2 2 4-4M21 12c0 5-9 9-9 9s-9-4-9-9a9 9 0 0 1 18 0z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
};

const ITEMS = [
  { to: "/chart", label: "Chart", icon: ICONS.chart },
  { to: "/dashboard", label: "Terminal", icon: ICONS.terminal },
  { to: "/dashboard/wallet", label: "Wallet", icon: ICONS.wallet },
  { to: "/dashboard/history", label: "History", icon: ICONS.history },
  { to: "/dashboard/tournaments", label: "Tournaments", icon: ICONS.trophy },
  { to: "/dashboard/kyc", label: "Profile & Address", icon: ICONS.kyc },
  { to: "/dashboard/security", label: "Security", icon: ICONS.security },
  { to: "/dashboard/chat", label: "Support", icon: ICONS.chat },
];

export default function ChartRail() {
  return (
    <nav className="chrail" aria-label="Primary navigation">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/chart"}
          title={item.label}
          aria-label={item.label}
          className={({ isActive }: { isActive: boolean }) =>
            `chrail__item ${isActive ? "is-active" : ""}`
          }
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={item.icon} />
          </svg>
        </NavLink>
      ))}
    </nav>
  );
}
