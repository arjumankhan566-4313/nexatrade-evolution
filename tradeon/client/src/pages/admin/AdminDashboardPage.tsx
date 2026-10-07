/**
 * AdminDashboardPage — 1:1 port of legacy src/app/nexa-admin-portal/page.jsx.
 * The Executive Dashboard: KPI hero, geo heatmap, revenue vs P&L, payment
 * funnel, risk alerts, live trade stream, trading activity + operations queue.
 *
 * Adaptations for V2:
 *   • 'use client' removed.
 *   • next/dynamic → aliased Suspense shim (already configured).
 *   • all @/components/admin/* + @/lib/* imports unchanged (Vite @ alias).
 *
 * Data uses the direct legacy /api/admin/dashboard aggregation.
 */
import { motion } from 'framer-motion';
import { Activity, Radio, Server, Zap, ShieldCheck, Clock3, LoaderCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLiveDashboard } from '@/components/admin/useLiveDashboard';
import { GlassCard, CardHead, CountUp } from '@/components/admin/ui';
import KpiHero from '@/components/admin/KpiHero';
import WorldHeatmap from '@/components/admin/WorldHeatmap';
import LiveTradesTable from '@/components/admin/LiveTradesTable';
import RiskAlerts from '@/components/admin/RiskAlerts';

const ChartFallback = () => <div className="nt-card" style={{ minHeight: 320 }} aria-hidden="true" />;
const RevenueChart = dynamic(() => import('@/components/admin/RevenueChart'), { ssr: false, loading: ChartFallback });
const TradingActivity = dynamic(() => import('@/components/admin/TradingActivity'), { ssr: false, loading: ChartFallback });
const PaymentFunnel = dynamic(() => import('@/components/admin/PaymentFunnel'), { ssr: false, loading: ChartFallback });

function Queue({ icon: Icon, label, value, total, color }) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(1, total)) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(148,197,255,0.07)', borderRadius: 11, padding: 11 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center', color }}>
        <Icon size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 10, color: '#8492a5' }}>{label}</span>
          <b className="mono" style={{ fontSize: 15, color: '#eaf2ff' }}>{String(value).padStart(2, '0')}</b>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1 }}
            style={{ height: '100%', borderRadius: 4, background: color, boxShadow: `0 0 12px ${color}` }}
          />
        </div>
      </div>
      <small style={{ fontSize: 9, color: '#59667a' }}>{pct.toFixed(0)}%</small>
    </div>
  );
}

export default function AdminDashboardPage() {
  const dash = useLiveDashboard();
  const { kpi, pending, feed } = dash;

  const feedLabel = feed === 'live' ? 'MARKET FEED LIVE' : feed === 'offline' ? 'MARKET FEED OFFLINE' : 'CONNECTING…';
  const feedColor = feed === 'live' ? '#34d399' : feed === 'offline' ? '#fbbf24' : '#8fc3ff';

  return (
    <div className="ntdash">
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, margin: '2px 2px 4px' }}>
        <div>
          <div className="nt-eyebrow" style={{ color: '#54637c' }}>Real-time platform intelligence</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 4px', letterSpacing: '-0.7px', fontWeight: 800 }}>
            Executive <span style={{ background: 'linear-gradient(90deg,#00f2fe,#10b981)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Dashboard</span>
          </h1>
          <p style={{ fontSize: 12, color: '#6e7a8e', margin: 0 }}>
            Live operational telemetry — every metric sourced from the platform database.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9, letterSpacing: 1, color: feedColor, border: `1px solid ${feedColor}33`, background: `${feedColor}0d`, borderRadius: 9, padding: '7px 11px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: feedColor, boxShadow: `0 0 10px ${feedColor}` }} />
            {feedLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 9, letterSpacing: 1, color: '#8fc3ff', border: '1px solid rgba(0,242,254,0.18)', background: 'rgba(0,242,254,0.05)', borderRadius: 9, padding: '7px 11px' }}>
            <Server size={12} /> LIVE SYNC
          </div>
        </div>
      </div>

      {/* ── KPI hero ── */}
      <KpiHero kpi={kpi} pnl={dash.pnl} range={dash.range} setRange={dash.setRange} />

      {/* ── Geo heatmap + top countries ── */}
      <WorldHeatmap geo={dash.geo} />

      {/* ── Revenue + payment funnel ── */}
      <div className="nt-row-2b">
        <RevenueChart series={dash.revenueSeries} />
        <PaymentFunnel gateways={dash.gateways} />
      </div>

      {/* ── Risk alerts + live stream ── */}
      <div className="nt-row-2">
        <RiskAlerts alerts={dash.alerts} sharpTraders={dash.sharpTraders} />
        <LiveTradesTable trades={dash.trades} />
      </div>

      {/* ── Trading activity + operations queue ── */}
      <div className="nt-row-2b">
        <TradingActivity markets={dash.markets} candles={dash.candles} callPut={dash.callPut} feed={dash.feed} loadCandles={dash.loadCandles} />
        <GlassCard delay={0.46}>
          <CardHead
            eyebrow="Operations queue"
            title="Pending actions"
            sub="Awaiting admin review & approval"
            right={
              <span style={{ color: '#f2bd4b' }}>
                <Zap size={18} />
              </span>
            }
          />
          <div style={{ display: 'grid', gap: 11, marginTop: 6 }}>
            <Queue icon={ShieldCheck} label="KYC awaiting review" value={pending?.kyc || 0} total={40} color="#fbbf24" />
            <Queue icon={Clock3} label="Deposits pending" value={pending?.deposits || 0} total={25} color="#00f2fe" />
            <Queue icon={LoaderCircle} label="Withdrawals pending" value={pending?.withdrawals || 0} total={20} color="#f43f5e" />
          </div>
          <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(148,197,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8492a5' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Activity size={12} /> Real volume (all-time)</span>
              <span className="mono" style={{ color: '#eaf2ff', fontWeight: 700 }}>
                <CountUp value={kpi?.realVolume || 0} prefix="$" />
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8492a5', marginTop: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Radio size={12} /> User liability</span>
              <span className="mono" style={{ color: '#fb7185', fontWeight: 700 }}>
                <CountUp value={kpi?.liability || 0} prefix="$" />
              </span>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
