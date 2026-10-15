import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert, AlertTriangle, Target } from "lucide-react";
import { GlassCard, CardHead, LivePill } from "./ui";

/**
 * Risk alerts — built from REAL signals only:
 *   • security_logs CRITICAL / WARNING events (login failures, rate-limits, …)
 *   • sharp traders detected by the fraud engine (win rate ≥ threshold)
 */
export default function RiskAlerts({ alerts, sharpTraders }) {
  const items = [];
  for (const a of alerts || []) {
    const critical = a.severity === "CRITICAL";
    items.push({
      id: a.id,
      severity: critical ? "critical" : "warn",
      icon: critical ? "shield" : "warn",
      title: a.title,
      desc: a.email ? `${a.email}${a.ip ? ` · IP ${a.ip}` : ""}` : a.ip ? `IP ${a.ip}` : "",
      time: new Date(a.createdAt).toLocaleTimeString([], { hour12: false }),
    });
  }
  for (const s of sharpTraders || []) {
    items.push({
      id: `sharp-${s.email}`,
      severity: "critical",
      icon: "target",
      title: "Sharp trader detected",
      desc: `${s.email} — ${s.winRate}% win rate over ${s.trades} trades (pnl $${Number(s.pnl || 0).toLocaleString()})`,
      time: "fraud engine",
    });
  }

  return (
    <GlassCard delay={0.42}>
      <CardHead
        eyebrow="Risk intelligence"
        title="High-risk & flagged alerts"
        sub="Security events & sharp-trader signals"
        right={<LivePill label="MONITORING" variant="cyan" />}
      />
      <div className="nt-alert-list">
        {items.length === 0 ? (
          <div
            style={{
              padding: "40px 0",
              display: "grid",
              placeItems: "center",
              color: "#5b6a85",
              fontSize: 12,
            }}
          >
            No critical or warning events right now.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {items.slice(0, 6).map((a) => {
              const critical = a.severity === "critical";
              const Icon =
                a.icon === "shield" ? ShieldAlert : a.icon === "target" ? Target : AlertTriangle;
              return (
                <motion.div
                  key={a.id}
                  className={`nt-alert ${critical ? "critical" : "warn"}`}
                  layout
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                >
                  <span className="nt-a-ico">
                    <Icon size={15} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b>{a.title}</b>
                    <p>{a.desc || "—"}</p>
                    <time>
                      {a.time} · {critical ? "CRITICAL" : "WARNING"}
                    </time>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </GlassCard>
  );
}
