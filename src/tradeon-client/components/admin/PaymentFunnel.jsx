import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { GlassCard, CardHead, CountUp } from "./ui";
import { gatewayColor } from "./countryMeta";

export default function PaymentFunnel({ gateways }) {
  const data = useMemo(
    () =>
      (gateways || [])
        .filter((g) => g.volume > 0)
        .map((g, i) => ({ ...g, color: gatewayColor(g.code, i) })),
    [gateways],
  );
  const total = data.reduce((s, g) => s + g.volume, 0);

  return (
    <GlassCard delay={0.34}>
      <CardHead
        eyebrow="Deposit & withdrawal funnel"
        title="Payment gateway distribution"
        sub="Real share of approved volume (last 30 days)"
      />
      {data.length === 0 ? (
        <div
          style={{
            height: 300,
            display: "grid",
            placeItems: "center",
            color: "#5b6a85",
            fontSize: 12,
          }}
        >
          No approved transactions yet — distribution appears as payments settle.
        </div>
      ) : (
        <div className="nt-donut-wrap">
          <div className="nt-donut-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="volume"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={86}
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke="none"
                >
                  {data.map((g, i) => (
                    <Cell key={i} fill={g.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0e1520",
                    border: "1px solid rgba(0,242,254,0.2)",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  formatter={(v, name) => [`$${Number(v).toLocaleString()}`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="nt-center">
              <div>
                <CountUp value={total} prefix="$" className="nt-center-b" />
                <small>
                  TOTAL
                  <br />
                  APPROVED VOLUME
                </small>
              </div>
            </div>
          </div>

          <div>
            {data.map((g, i) => {
              const pct = total ? Math.round((g.volume / total) * 100) : 0;
              return (
                <motion.div
                  key={g.code}
                  className="nt-gateway-row"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                >
                  <span className="nt-dot" style={{ background: g.color, color: g.color }} />
                  <span>{g.name}</span>
                  <b>{pct}%</b>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
