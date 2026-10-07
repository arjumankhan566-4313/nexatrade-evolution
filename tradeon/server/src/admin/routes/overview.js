/** Direct port of src/app/api/admin/overview/route.js; transport imports only. */
import { one, many, getSettings } from '../db';
import { requireAdmin, json, route } from '../http';
import { settleDue as backgroundSettle } from '../../trade/engine';
import { permissionsFor } from '../lib/rbac.js';


export const GET = route(async () => {
  const { user, response } = await requireAdmin();
  if (response) return response;
  await backgroundSettle();

  const users = await one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE role='USER')::int AS traders,
            COUNT(*) FILTER (WHERE is_blocked)::int AS blocked,
            COUNT(*) FILTER (WHERE kyc_status='VERIFIED')::int AS verified,
            COALESCE(SUM(balance_real),0) AS liability
     FROM users`
  );
  const trades = await one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='OPEN')::int AS open,
            COUNT(*) FILTER (WHERE status='WON')::int AS wins,
            COUNT(*) FILTER (WHERE status='LOST')::int AS losses,
            COUNT(*) FILTER (WHERE is_adjusted)::int AS adjusted,
            COALESCE(SUM(profit) FILTER (WHERE status IN ('WON','LOST')),0) AS user_pnl,
            COALESCE(SUM(stake) FILTER (WHERE account_type='REAL'),0) AS real_volume
     FROM trades`
  );
  const pending = await one(
    `SELECT
      (SELECT COUNT(*)::int FROM kyc_submissions WHERE status='UNDER_REVIEW') AS kyc,
      (SELECT COUNT(*)::int FROM transactions WHERE status='PENDING' AND type='DEPOSIT') AS deposits,
      (SELECT COUNT(*)::int FROM transactions WHERE status='PENDING' AND type='WITHDRAWAL') AS withdrawals,
      (SELECT COUNT(*)::int FROM affiliate_payouts WHERE status='PENDING') AS affiliate_payouts`
  );
  const recentTrades = await many(
    `SELECT t.id, t.symbol, t.direction, t.stake, t.status, t.profit, t.is_adjusted, t.adjust_reason,
            t.account_type, t.created_at, u.email
     FROM trades t JOIN users u ON u.id = t.user_id
     ORDER BY t.created_at DESC LIMIT 12`
  );
  const settings = await getSettings();

  const decided = trades.wins + trades.losses;
  return json({
    admin: { ...user, permissions: [...permissionsFor(user.role)] },
    stats: {
      users: { ...users, liability: Number(users.liability) },
      trades: {
        total: trades.total, open: trades.open, wins: trades.wins, losses: trades.losses,
        adjusted: trades.adjusted,
        realVolume: Number(trades.real_volume),
        userPnl: Number(trades.user_pnl),
        platformPnl: -Number(trades.user_pnl),
        actualWinRate: decided ? Math.round((trades.wins / decided) * 1000) / 10 : 0,
      },
      pending,
    },
    settings,
    recentTrades: recentTrades.map((t) => ({
      id: t.id, symbol: t.symbol, direction: t.direction, stake: Number(t.stake), status: t.status,
      profit: t.profit === null ? null : Number(t.profit), isAdjusted: t.is_adjusted,
      adjustReason: t.adjust_reason, accountType: t.account_type, createdAt: t.created_at, email: t.email,
    })),
  });
});
