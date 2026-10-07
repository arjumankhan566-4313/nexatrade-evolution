/** Direct port of src/app/api/admin/dashboard/route.js; transport imports only. */
import { many, one, getSettings } from '../db';
import { requireAdmin, json, route } from '../http';
import { settleDue as backgroundSettle } from '../../trade/engine';


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADMIN DASHBOARD — single real-data aggregation endpoint.
 *
 * Every number returned here is computed from the live database (users,
 * trades, transactions, security logs, payment methods). There is NO
 * fabricated or simulated data. The client polls this endpoint and also
 * refetches on SSE events for a real-time feel.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const GET = route(async () => {
  const { response } = await requireAdmin();
  if (response) return response;
  await backgroundSettle();

  /* ── KPI: users ── */
  const users = await one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE role='USER')::int AS traders,
            COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '24 hours')::int AS active_24h,
            COUNT(*) FILTER (WHERE kyc_status='VERIFIED')::int AS verified,
            COUNT(*) FILTER (WHERE is_blocked)::int AS blocked,
            COALESCE(SUM(balance_real),0) AS liability
     FROM users`
  );

  /* ── KPI: trades & P&L across ranges ── */
  const settled = `status IN ('WON','LOST')`;
  const trades = await one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='OPEN')::int AS open,
            COUNT(*) FILTER (WHERE ${settled} AND settled_at >= NOW() - INTERVAL '24 hours')::int AS decided_24h,
            COUNT(*) FILTER (WHERE status='WON')::int AS wins,
            COUNT(*) FILTER (WHERE status='LOST')::int AS losses,
            COALESCE(SUM(profit) FILTER (WHERE ${settled}),0) AS user_pnl_all,
            COALESCE(SUM(profit) FILTER (WHERE ${settled} AND settled_at >= NOW() - INTERVAL '24 hours'),0) AS user_pnl_24h,
            COALESCE(SUM(profit) FILTER (WHERE ${settled} AND settled_at >= NOW() - INTERVAL '7 days'),0) AS user_pnl_7d,
            COALESCE(SUM(stake) FILTER (WHERE account_type='REAL'),0) AS real_volume,
            COALESCE(SUM(stake) FILTER (WHERE status IN ('WON','LOST') AND settled_at >= NOW() - INTERVAL '24 hours'),0) AS volume_24h
     FROM trades`
  );
  const decided = trades.wins + trades.losses;
  const winRate = decided ? Math.round((trades.wins / decided) * 1000) / 10 : 0;

  /* ── KPI: deposits / withdrawals (settled) ── */
  const flow = await one(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE type='DEPOSIT' AND status='APPROVED' AND processed_at >= NOW() - INTERVAL '24 hours'),0) AS deposits_24h,
            COALESCE(SUM(amount) FILTER (WHERE type='WITHDRAWAL' AND status='APPROVED' AND processed_at >= NOW() - INTERVAL '24 hours'),0) AS withdrawals_24h,
            COALESCE(SUM(amount) FILTER (WHERE type='DEPOSIT' AND status='APPROVED'),0) AS deposits_all,
            COALESCE(SUM(amount) FILTER (WHERE type='WITHDRAWAL' AND status='APPROVED'),0) AS withdrawals_all
     FROM transactions`
  );

  /* ── KPI: pending queues ── */
  const pending = await one(
    `SELECT
      (SELECT COUNT(*)::int FROM kyc_submissions WHERE status='UNDER_REVIEW') AS kyc,
      (SELECT COUNT(*)::int FROM transactions WHERE status='PENDING' AND type='DEPOSIT') AS deposits,
      (SELECT COUNT(*)::int FROM transactions WHERE status='PENDING' AND type='WITHDRAWAL') AS withdrawals,
      (SELECT COUNT(*)::int FROM affiliate_payouts WHERE status='PENDING') AS affiliate_payouts`
  );

  /* ── Geo: users by country ── */
  const geoRows = await many(
    `SELECT country, COUNT(*)::int AS users
     FROM users WHERE country <> '' AND role <> 'ADMIN'
     GROUP BY country ORDER BY users DESC LIMIT 20`
  );

  /* ── Revenue vs payouts — hourly, last 24 buckets (real settled trades) ── */
  const series = await many(
    `SELECT g.hour AS t,
            COALESCE(SUM(t.stake)  FILTER (WHERE t.status='LOST'),0) AS revenue,
            COALESCE(SUM(t.profit) FILTER (WHERE t.status='WON'),0)  AS payout
     FROM generate_series(
            date_trunc('hour', NOW()) - INTERVAL '23 hours',
            date_trunc('hour', NOW()),
            INTERVAL '1 hour'
          ) AS g(hour)
     LEFT JOIN trades t
       ON t.settled_at >= g.hour AND t.settled_at < g.hour + INTERVAL '1 hour'
      AND t.status IN ('WON','LOST')
     GROUP BY g.hour ORDER BY g.hour`
  );

  /* ── CALL vs PUT volume by market (last 24h) ── */
  const callPutRows = await many(
    `SELECT symbol,
            COALESCE(SUM(stake) FILTER (WHERE direction='CALL'),0) AS call_vol,
            COALESCE(SUM(stake) FILTER (WHERE direction='PUT'),0)  AS put_vol,
            COUNT(*)::int AS trades
     FROM trades
     WHERE created_at >= NOW() - INTERVAL '24 hours'
     GROUP BY symbol ORDER BY trades DESC`
  );

  /* ── Payment gateway distribution (settled, last 30 days) ── */
  const gatewayRows = await many(
    `SELECT COALESCE(pm.name, t.method) AS name,
            COALESCE(pm.code, t.method) AS code,
            COALESCE(SUM(t.amount),0) AS volume,
            COUNT(*)::int AS txns
     FROM transactions t
     LEFT JOIN payment_methods pm ON pm.code = t.method
     WHERE t.status='APPROVED' AND t.processed_at >= NOW() - INTERVAL '30 days'
     GROUP BY pm.name, pm.code, t.method ORDER BY volume DESC`
  );

  /* ── Live trade stream (most recent, any status) ── */
  const recentTrades = await many(
    `SELECT t.id, t.symbol, t.direction, t.stake, t.entry_price, t.status, t.profit,
            t.account_type, t.created_at, u.email, u.full_name
     FROM trades t JOIN users u ON u.id = t.user_id
     ORDER BY t.created_at DESC LIMIT 10`
  );

  /* ── Risk alerts: recent critical/warning security events ── */
  const alertRows = await many(
    `SELECT id, email, event, severity, ip, created_at
     FROM security_logs
     WHERE severity IN ('CRITICAL','WARNING')
     ORDER BY created_at DESC LIMIT 8`
  );

  /* ── Sharp-traders (real risk signal, mirrors fraud engine) ── */
  const settings = await getSettings();
  const sharpThreshold = Number(settings.sharp_trader_threshold || 65);
  const sharp = await many(
    `SELECT u.email, u.full_name,
            COUNT(*)::int AS trades,
            COUNT(*) FILTER (WHERE t.status='WON')::int AS wins,
            COALESCE(SUM(t.profit),0) AS pnl
     FROM trades t JOIN users u ON u.id = t.user_id
     WHERE t.status IN ('WON','LOST') AND t.account_type='REAL'
       AND t.settled_at > NOW() - INTERVAL '30 days' AND u.role <> 'ADMIN'
     GROUP BY u.email, u.full_name
     HAVING COUNT(*) >= 15
        AND (COUNT(*) FILTER (WHERE t.status='WON')::numeric / COUNT(*)) * 100 >= $1
     ORDER BY pnl DESC LIMIT 5`,
    [sharpThreshold]
  );

  /* ── Markets for the trading-activity selector (real, active) ── */
  const markets = await many(
    `SELECT symbol, display_name AS name, category, payout_percentage
     FROM markets WHERE is_active = TRUE ORDER BY sort_order ASC LIMIT 6`
  );

  return json({
    serverTime: Date.now(),
    kpi: {
      totalUsers: Number(users.total),
      traders: Number(users.traders),
      activeUsers24h: Number(users.active_24h),
      verified: Number(users.verified),
      blocked: Number(users.blocked),
      liability: Number(users.liability),
      openPositions: Number(trades.open),
      totalTrades: Number(trades.total),
      winRate,
      realVolume: Number(trades.real_volume),
      volume24h: Number(trades.volume_24h),
      pnl: {
        today: -Number(trades.user_pnl_24h),
        week: -Number(trades.user_pnl_7d),
        all: -Number(trades.user_pnl_all),
      },
      deposits: { today: Number(flow.deposits_24h), all: Number(flow.deposits_all) },
      withdrawals: { today: Number(flow.withdrawals_24h), all: Number(flow.withdrawals_all) },
      netDelta24h: Number(flow.deposits_24h) - Number(flow.withdrawals_24h),
    },
    pending: {
      kyc: Number(pending.kyc),
      deposits: Number(pending.deposits),
      withdrawals: Number(pending.withdrawals),
      affiliatePayouts: Number(pending.affiliate_payouts),
    },
    geo: geoRows.map((g) => ({ code: g.country, country: g.country, users: Number(g.users) })),
    revenueSeries: series.map((s) => ({
      t: Number(s.t),
      revenue: Number(s.revenue),
      payout: Number(s.payout),
      pnl: Number(s.revenue) - Number(s.payout),
    })),
    callPut: callPutRows.map((c) => ({
      symbol: c.symbol,
      call: Number(c.call_vol),
      put: Number(c.put_vol),
      trades: Number(c.trades),
    })),
    gateways: gatewayRows.map((g) => ({
      name: g.name,
      code: g.code,
      volume: Number(g.volume),
      txns: Number(g.txns),
    })),
    trades: recentTrades.map((t) => ({
      id: t.id,
      email: t.email,
      name: t.full_name,
      symbol: t.symbol,
      direction: t.direction,
      stake: Number(t.stake),
      entryPrice: Number(t.entry_price),
      status: t.status,
      profit: t.profit === null ? null : Number(t.profit),
      accountType: t.account_type,
      createdAt: t.created_at,
    })),
    alerts: alertRows.map((a) => ({
      id: a.id,
      email: a.email,
      title: a.event,
      severity: a.severity,
      ip: a.ip,
      createdAt: a.created_at,
    })),
    sharpTraders: sharp.map((s) => ({
      email: s.email,
      name: s.full_name,
      trades: Number(s.trades),
      wins: Number(s.wins),
      winRate: Math.round((Number(s.wins) / Number(s.trades)) * 1000) / 10,
      pnl: Number(s.pnl),
    })),
    markets: markets.map((m) => ({
      symbol: m.symbol,
      name: m.name,
      category: m.category,
      payoutRate: Number(m.payout_percentage),
    })),
  });
});
