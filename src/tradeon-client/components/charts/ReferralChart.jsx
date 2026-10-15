/**
 * ReferralChart — the affiliate analytics composed chart (clicks / referrals /
 * commission). Isolated so the affiliate route can lazy-load `recharts` instead
 * of shipping it in the initial bundle. Identical rendering to the previous
 * inline chart.
 */
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

export default function ReferralChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#4c5566", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d) => String(d).slice(5)}
        />
        <YAxis
          yAxisId="clicks"
          tick={{ fill: "#4c5566", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis yAxisId="comm" orientation="right" hide />
        <Bar
          yAxisId="clicks"
          dataKey="clicks"
          fill="#00f2fe"
          fillOpacity={0.35}
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
        <Line
          yAxisId="clicks"
          type="monotone"
          dataKey="referrals"
          stroke="#f2b84b"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          yAxisId="comm"
          type="monotone"
          dataKey="commission"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
