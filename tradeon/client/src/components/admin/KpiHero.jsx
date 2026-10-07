
import { motion } from 'framer-motion';
import {
  TrendingUp, Users, Activity, ArrowDownUp, ArrowUpRight, ArrowDownRight,
  Wallet, Coins, Percent, Radio, BadgeCheck,
} from 'lucide-react';
import { GlassCard, CountUp, Segmented, LivePill } from './ui';

const money = (n, d = 0) =>
  `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d })}`;

export default function KpiHero({ kpi, pnl, range, setRange }) {
  if (!kpi) return null;
  const pnlPos = pnl >= 0;

  return (
    <div className="nt-kpi-grid">
      {/* ── Admin Net P&L (hero, 3D) ── */}
      <GlassCard className="span-4" delay={0.02}>
        <div className="nt-kpi-top">
          <span>
            <span className="nt-kpi-ico" style={{ background: 'rgba(0,242,254,0.12)', color: '#00f2fe' }}>
              <TrendingUp size={17} />
            </span>
            Admin Net P&L
          </span>
          <Segmented
            options={[
              { label: 'Today', value: 'today' },
              { label: 'Week', value: 'week' },
              { label: 'All-time', value: 'all' },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        <CountUp value={pnl} prefix="$" className={`nt-kpi-num ${pnlPos ? 'up' : 'down'}`} />
        <div className="nt-kpi-sub">
          <b className={pnlPos ? '' : 'neg'}>
            {pnlPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          </b>
          {range === 'today' ? 'last 24 hours' : range === 'week' ? 'last 7 days' : 'all time'} · house edge
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <div style={{ padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,197,255,0.08)' }}>
            <div style={{ fontSize: 8, letterSpacing: 1, color: '#5b6a85', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Coins size={11} /> REAL VOLUME
            </div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: '#9fe8d2', marginTop: 5 }}>
              {money(kpi.realVolume)}
            </div>
          </div>
          <div style={{ padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,197,255,0.08)' }}>
            <div style={{ fontSize: 8, letterSpacing: 1, color: '#5b6a85', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Percent size={11} /> USER WIN RATE
            </div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: '#8fc3ff', marginTop: 5 }}>
              {kpi.winRate}%
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Live Active Users ── */}
      <GlassCard className="span-4" delay={0.06}>
        <div className="nt-kpi-top">
          <span>
            <span className="nt-kpi-ico" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
              <Users size={17} />
            </span>
            Active Users (24h)
          </span>
          <LivePill />
        </div>
        <CountUp value={kpi.activeUsers24h} className="nt-kpi-num cyan" />
        <div className="nt-kpi-sub">
          <b>
            <Radio size={12} /> {kpi.openPositions}
          </b>
          open positions in live trades
        </div>
        <div style={{ marginTop: 14, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,197,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 8, letterSpacing: 1, color: '#5b6a85', display: 'flex', alignItems: 'center', gap: 5 }}>
            <BadgeCheck size={11} /> VERIFIED
          </span>
          <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: '#9fe8d2' }}>{kpi.verified}</span>
        </div>
      </GlassCard>

      {/* ── Open Positions ── */}
      <GlassCard className="span-4" delay={0.1}>
        <div className="nt-kpi-top">
          <span>
            <span className="nt-kpi-ico" style={{ background: 'rgba(124,140,255,0.14)', color: '#a5b4fc' }}>
              <Activity size={17} />
            </span>
            Total Traders
          </span>
          <LivePill label="LIVE" variant="cyan" />
        </div>
        <CountUp value={kpi.totalUsers} className="nt-kpi-num violet" />
        <div className="nt-kpi-sub">
          <b>
            <ArrowUpRight size={12} /> {kpi.totalTrades}
          </b>
          total trades · {kpi.winRate}% win rate
        </div>
        <div style={{ marginTop: 14, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,197,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 8, letterSpacing: 1, color: '#5b6a85', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Wallet size={11} /> LIABILITY
          </span>
          <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: '#fb7185' }}>{money(kpi.liability)}</span>
        </div>
      </GlassCard>

      {/* ── Daily Financial Flow ── */}
      <GlassCard className="span-4" delay={0.14}>
        <div className="nt-kpi-top">
          <span>
            <span className="nt-kpi-ico" style={{ background: 'rgba(244,63,94,0.12)', color: '#fb7185' }}>
              <ArrowDownUp size={17} />
            </span>
            Financial Flow (24h)
          </span>
          <LivePill variant="cyan" />
        </div>
        <div style={{ display: 'flex', gap: 22, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, letterSpacing: 1, color: '#5b6a85', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Wallet size={11} /> DEPOSITS
            </div>
            <div className="mono" style={{ fontWeight: 800, fontSize: 20, color: '#34d399', marginTop: 4 }}>
              {money(kpi.deposits.today)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, letterSpacing: 1, color: '#5b6a85', display: 'flex', alignItems: 'center', gap: 5 }}>
              <ArrowUpRight size={11} /> WITHDRAWALS
            </div>
            <div className="mono" style={{ fontWeight: 800, fontSize: 20, color: '#fb7185', marginTop: 4 }}>
              {money(kpi.withdrawals.today)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: kpi.netDelta24h >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${kpi.netDelta24h >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, letterSpacing: 1, color: '#7c8ba2' }}>NET BALANCE DELTA</span>
            <span className="mono" style={{ fontWeight: 800, fontSize: 14, color: kpi.netDelta24h >= 0 ? '#34d399' : '#fb7185' }}>
              {kpi.netDelta24h >= 0 ? '+' : '−'}{money(Math.abs(kpi.netDelta24h))}
            </span>
          </div>
          <motion.div style={{ height: 4, borderRadius: 4, marginTop: 8, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (kpi.deposits.today / Math.max(1, kpi.deposits.today + kpi.withdrawals.today)) * 100)}%` }}
              transition={{ duration: 0.8 }}
              style={{ height: '100%', background: kpi.netDelta24h >= 0 ? 'linear-gradient(90deg,#34d399,#10b981)' : 'linear-gradient(90deg,#fb7185,#f43f5e)', boxShadow: '0 0 10px rgba(16,185,129,0.5)' }}
            />
          </motion.div>
        </div>
      </GlassCard>
    </div>
  );
}
