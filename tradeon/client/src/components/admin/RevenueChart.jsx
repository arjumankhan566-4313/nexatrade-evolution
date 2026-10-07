
import { useMemo } from 'react';
import {
  Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { GlassCard, CardHead } from './ui';

const fmtAxis = (t) => {
  if (t == null) return '';
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = new Date(label);
  return (
    <div className="nt-tooltip" style={{ padding: '10px 12px' }}>
      <div style={{ color: '#5b6a85', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
        {d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginTop: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
          <span style={{ color: '#8ea0b8' }}>{p.name}:</span>
          <b style={{ color: '#eaf2ff', fontFamily: 'var(--mono)' }}>${Number(p.value).toLocaleString()}</b>
        </div>
      ))}
    </div>
  );
}

export default function RevenueChart({ series }) {
  const hasData = series && series.some((s) => s.revenue > 0 || s.payout > 0);
  const data = useMemo(() => series || [], [series]);

  return (
    <GlassCard delay={0.26}>
      <CardHead
        eyebrow="Performance matrix"
        title="Revenue vs house P&L"
        sub="Hourly platform revenue vs user payouts (settled trades)"
        right={
          <div className="nt-legend">
            <span><i className="c" />Revenue</span>
            <span><i className="r" />Payouts</span>
            <span><i className="g" />Net P&L</span>
          </div>
        }
      />
      {!hasData ? (
        <div style={{ height: 300, display: 'grid', placeItems: 'center', color: '#5b6a85', fontSize: 12 }}>
          No settled trades yet — revenue appears here once trades close.
        </div>
      ) : (
        <div className="nt-chart tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#00f2fe" stopOpacity="0.32" />
                  <stop offset="1" stopColor="#00f2fe" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="payG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f43f5e" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#f43f5e" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="pnlG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#10b981" stopOpacity="0.24" />
                  <stop offset="1" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,197,255,0.05)" vertical={false} />
              <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fill: '#4a5870', fontSize: 10 }} tickFormatter={fmtAxis} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#4a5870', fontSize: 10 }} tickFormatter={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#4a5870', fontSize: 10 }} tickFormatter={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(0,242,254,0.2)' }} />
              <Area yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="#00f2fe" strokeWidth={2.2} fill="url(#revG)" dot={false} />
              <Area yAxisId="right" type="monotone" dataKey="payout" name="Payouts" stroke="#f43f5e" strokeWidth={1.6} fill="url(#payG)" dot={false} />
              <Area yAxisId="left" type="monotone" dataKey="pnl" name="Net P&L" stroke="#10b981" strokeWidth={1.8} fill="url(#pnlG)" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}
