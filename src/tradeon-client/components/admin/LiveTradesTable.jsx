
import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { GlassCard, CardHead, LivePill } from './ui';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n) => `$${fmt(n, 2)}`;

function Row({ t }) {
  /* Admin P&L impact = −user profit (house wins when the user loses). */
  const impact = t.profit === null ? 0 : -t.profit;
  const open = t.status === 'OPEN';
  return (
    <motion.div
      layout
      className="nt-stream-row flash"
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      <div className="nt-user">
        <span
          className="nt-ava"
          style={{ background: t.direction === 'CALL' ? 'linear-gradient(135deg,#00f2fe,#10b981)' : 'linear-gradient(135deg,#fb7185,#f43f5e)' }}
        >
          {(t.name || t.email || '?')[0].toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <b>{t.email}</b>
          <small>{new Date(t.createdAt).toLocaleTimeString([], { hour12: false })}</small>
        </div>
      </div>
      <div className="nt-sym">
        {t.symbol}
        <small>{t.accountType?.toLowerCase()}</small>
      </div>
      <div className="nt-stake">{money(t.stake)}</div>
      <div>
        <span className={t.direction === 'CALL' ? 'nt-call' : 'nt-put'}>
          {t.direction === 'CALL' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {t.direction}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: '#9fb0c6' }}>{fmt(t.entryPrice, t.entryPrice < 10 ? 4 : 1)}</div>
      <div className={`nt-impact ${open ? '' : impact >= 0 ? 'up' : 'down'}`} style={open ? { color: '#8fc3ff' } : undefined}>
        {open ? 'OPEN' : `${impact >= 0 ? '+' : '−'}${money(Math.abs(impact))}`}
      </div>
    </motion.div>
  );
}

export default function LiveTradesTable({ trades }) {
  return (
    <GlassCard delay={0.38}>
      <CardHead
        eyebrow="High-frequency live feed"
        title="Live trading stream"
        sub="Most recent positions · admin P&L exposure"
        right={<LivePill />}
      />
      <div className="nt-stream">
        <div className="nt-stream-head">
          <span>USER</span>
          <span>MARKET</span>
          <span>STAKE</span>
          <span>POSITION</span>
          <span>ENTRY</span>
          <span>ADMIN P&L</span>
        </div>
        {trades.length === 0 ? (
          <div style={{ padding: '40px 0', display: 'grid', placeItems: 'center', color: '#5b6a85', fontSize: 12 }}>
            No trades yet — live orders appear here as users trade.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {trades.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </GlassCard>
  );
}
