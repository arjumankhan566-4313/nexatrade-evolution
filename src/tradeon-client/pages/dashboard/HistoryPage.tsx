// @ts-nocheck

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from '@/tradeon-client/lib/nextDynamic';
import { api, money, fmtDate, fmtPrice } from '@/tradeon-client/lib/apiClient';
import { Activity, TrendingUp, TrendingDown, Target, Wallet } from 'lucide-react';


// Recharts is only needed once an equity curve exists — keep it off the
// initial History bundle and load it lazily on the client.
const EquityArea = dynamic(() => import('@/tradeon-client/components/charts/EquityArea'), {
  ssr: false,
  loading: () => <div className="equity-empty" aria-hidden="true" />,
});

const STATUS = {
  OPEN: 'badge badge-info',
  SETTLING: 'badge badge-warn',
  WON: 'badge badge-up',
  LOST: 'badge badge-down',
  VOID: 'badge',
};

/* Spec §6.8 — segmented filters: All / Real / Demo / Calls / Puts */
const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'REAL', label: 'Real' },
  { id: 'DEMO', label: 'Demo' },
  { id: 'CALL', label: 'Calls' },
  { id: 'PUT', label: 'Puts' },
];

export default function HistoryPage() {
  const [data, setData] = useState({ trades: [], stats: { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0 } });
  const [filter, setFilter] = useState('ALL');
  // Trade snapshots must remain fresh; route code is warmed independently.
  const refresh = useCallback(() => api('/api/trades?limit=200').then(setData).catch(() => {}), []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const trades = useMemo(() => {
    const list = data.trades.filter((t) => {
      if (filter === 'CALL') return t.direction === 'CALL';
      if (filter === 'PUT') return t.direction === 'PUT';
      return filter === 'ALL' || t.accountType === filter;
    });
    return list;
  }, [data.trades, filter]);

  /* Spec §6.8 — cumulative equity curve (oldest → newest) above the table */
  const equity = useMemo(() => {
    const settled = data.trades.filter((t) => ['WON', 'LOST', 'VOID'].includes(t.status));
    const ordered = [...settled].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    let cum = 0;
    return ordered.map((t, i) => {
      cum += t.profit || 0;
      return { i, pnl: Number(cum.toFixed(2)) };
    });
  }, [data.trades]);

  const equityMin = equity.length ? Math.min(0, ...equity.map((e) => e.pnl)) : 0;
  const equityMax = equity.length ? Math.max(0, ...equity.map((e) => e.pnl)) : 0;
  const equityUp = equity.length && equity[equity.length - 1].pnl >= 0;

  const exportCsv = () => {
    const head = 'Opened,Market,Side,Account,Stake,Entry,Exit,Expiry,Result,PNL';
    const rows = trades.map((t) =>
      [
        fmtDate(t.createdAt),
        t.symbol,
        t.direction,
        t.accountType,
        t.stake,
        t.entryPrice,
        t.exitPrice ?? '',
        `${t.duration}s`,
        t.status,
        t.profit ?? '',
      ].join(',')
    );
    const blob = new Blob([[head, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tradeon-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="stats">
        {[
          ['Total trades', data.stats.total, '', Activity, 'var(--gold-1)'],
          ['Wins', data.stats.wins, 'up', TrendingUp, 'var(--up)'],
          ['Losses', data.stats.losses, 'down', TrendingDown, 'var(--down)'],
          ['Win rate', `${data.stats.winRate}%`, '', Target, 'var(--gold-1)'],
          ['Net P/L', money(data.stats.pnl), data.stats.pnl >= 0 ? 'up' : 'down', Wallet, data.stats.pnl >= 0 ? 'var(--up)' : 'var(--down)'],
        ].map(([label, value, tone, Icon, accent]) => (
          <div key={label} className="glass stat" style={{ borderTop: `2px solid ${accent}` }}>
            <div className="stat-top">
              <span>{label}</span>
              <Icon size={15} style={{ color: accent, opacity: 0.85 }} />
            </div>
            <strong className={tone}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Spec §6.8 — equity-curve sparkline */}
      <div className="glass equity-panel">
        <div className="equity-head">
          <div>
            <span className="equity-label">Cumulative P/L</span>
            <strong className={`mono ${equityUp ? 'up' : 'down'}`}>
              {equity.length ? money(equity[equity.length - 1].pnl) : money(0)}
            </strong>
          </div>
          <span className="dim" style={{ fontSize: 11 }}>across all settled trades</span>
        </div>
        <div style={{ height: 120 }}>
          {equity.length >= 2 ? (
            <EquityArea data={equity} up={equityUp} domain={[equityMin, equityMax]} gradientId="equityFill" fillOpacity={0.35} />
          ) : (
            <div className="equity-empty">Settle a few trades to chart your equity curve.</div>
          )}
        </div>
      </div>

      <div className="glass" style={{ padding: 20 }}>
        <div className="row-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Trade history</h3>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div className="segmented">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`seg ${filter === f.id ? 'active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={exportCsv}>CSV</button>
          </div>
        </div>

        <div className="table-wrap sticky-head">
          <table className="data">
            <thead>
              <tr>
                <th>Opened</th><th>Market</th><th>Side</th><th>Account</th><th>Stake</th>
                <th>Entry</th><th>Exit</th><th>Expiry</th><th>Result</th><th>P/L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td className="dim">{fmtDate(t.createdAt)}</td>
                  <td><strong>{t.symbol}</strong></td>
                  <td>
                    <span className={`dir-pill ${t.direction === 'CALL' ? 'call' : 'put'}`}>
                      {t.direction === 'CALL' ? 'CALL' : 'PUT'}
                    </span>
                  </td>
                  <td>{t.accountType}</td>
                  <td className="mono">{money(t.stake)}</td>
                  <td className="mono">{fmtPrice(t.entryPrice, 4)}</td>
                  <td className="mono">{t.exitPrice ? fmtPrice(t.exitPrice, 4) : '—'}</td>
                  <td>{t.duration}s</td>
                  <td><span className={STATUS[t.status] || 'badge'}>{t.status}</span></td>
                  <td className={`mono ${t.profit > 0 ? 'up' : t.profit < 0 ? 'down' : ''}`}>
                    {t.profit === null ? '—' : `${t.profit > 0 ? '+' : ''}${money(t.profit)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!trades.length && <div className="empty">No trades match this filter.</div>}
        </div>
      </div>

      <style>{`
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .stat { padding: 16px 18px; display: grid; gap: 6px; border-radius: 14px; transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .stat:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35); }
        .stat-top { display: flex; align-items: center; justify-content: space-between; }
        .stat span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--dim); }
        .stat strong { font-size: 22px; font-family: var(--mono); }

        .equity-panel { padding: 14px 18px; margin-bottom: 16px; }
        .equity-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
        .equity-label { display: block; font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--dim); }
        .equity-head strong { font-size: 20px; font-family: var(--mono); }
        .equity-empty { height: 120px; display: grid; place-items: center; color: var(--dim); font-size: 13px; }

        .segmented { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: rgba(0,0,0,0.35); border: 1px solid var(--stroke); }
        .seg { padding: 6px 12px; border-radius: 8px; border: none; background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 600; }
        .seg.active { background: var(--gold-grad); color: #17130a; }

        .dir-pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
        .dir-pill.call { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.4); }
        .dir-pill.put { background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.4); }

        .sticky-head { max-height: 62vh; overflow: auto; }
        .sticky-head thead th { position: sticky; top: 0; z-index: 1; background: #10141d; }
      `}</style>
    </div>
  );
}
