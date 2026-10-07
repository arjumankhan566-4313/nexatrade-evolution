/** Direct port of src/app/api/admin/users/route.js; transport imports only. */
import { many, one } from '../db';
import { requireAdmin, json, route } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';


export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.USERS_VIEW);
  if (response) return response;
  const url = new URL(req.url);
  const q = `%${(url.searchParams.get('q') || '').toLowerCase()}%`;
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  const rows = await many(
    `SELECT u.id, u.full_name, u.email, u.country, u.role, u.balance_real, u.balance_demo, u.kyc_status,
            u.custom_yield_ratio, u.force_loss_user, u.is_blocked, u.created_at, u.last_login_at, u.last_login_ip,
            (SELECT COUNT(*)::int FROM trades t WHERE t.user_id=u.id) AS trade_count,
            (SELECT COALESCE(SUM(profit),0) FROM trades t WHERE t.user_id=u.id AND t.status IN ('WON','LOST')) AS pnl,
            (SELECT COUNT(*) FILTER (WHERE status='WON')::int FROM trades t WHERE t.user_id=u.id) AS wins,
            (SELECT COUNT(*) FILTER (WHERE status IN ('WON','LOST'))::int FROM trades t WHERE t.user_id=u.id) AS decided
     FROM users u
     WHERE LOWER(u.email) LIKE $1 OR LOWER(u.full_name) LIKE $1
     ORDER BY u.created_at DESC LIMIT $2`,
    [q, limit]
  );

  return json({
    users: rows.map((u) => ({
      id: u.id, fullName: u.full_name, email: u.email, country: u.country, role: u.role,
      balanceReal: Number(u.balance_real), balanceDemo: Number(u.balance_demo), kycStatus: u.kyc_status,
      customYieldRatio: u.custom_yield_ratio === null ? null : Number(u.custom_yield_ratio),
      forceLossUser: u.force_loss_user, isBlocked: u.is_blocked, createdAt: u.created_at,
      lastLoginAt: u.last_login_at, lastLoginIp: u.last_login_ip,
      tradeCount: u.trade_count, pnl: Number(u.pnl),
      winRate: u.decided ? Math.round((u.wins / u.decided) * 1000) / 10 : 0,
    })),
  });
});
