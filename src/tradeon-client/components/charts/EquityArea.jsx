/**
 * EquityArea — the shared Recharts P/L area chart used by the History and
 * Social (trader profile) screens.
 *
 * It lives in its own module so those routes can `next/dynamic` it and keep the
 * whole `recharts` package out of their first-load JavaScript. Visual output is
 * byte-for-byte the same as the previous inline chart.
 */
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

export default function EquityArea({
  data,
  up,
  domain,
  gradientId = "equityFill",
  fillOpacity = 0.35,
}) {
  const stroke = up ? "#10b981" : "#f43f5e";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={domain} />
        <Area
          type="monotone"
          dataKey="pnl"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
