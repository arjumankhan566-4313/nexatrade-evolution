/** Direct port of src/app/api/admin/fraud/route.js; transport imports only. */
import { many, getSettings } from '../db';
import { requireAdmin, json, route } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';


/**
 * Fraud & sharp-trader monitor (Module 4.2 "Read/Monitor").
 *
 * Three independent signals, all derived from real data:
 *   1. multi-account clusters — one device fingerprint used by several accounts
 *   2. shared-IP clusters      — several accounts signing in from one IP
 *   3. sharp traders           — win rate above the configured threshold with
 *                                a statistically meaningful number of trades
 */
export const GET = route(async () => {
  const { response } = await requireAdmin(PERMISSIONS.FRAUD_VIEW);
  if (response) return response;
  const settings = await getSettings();
  const threshold = Number(settings.sharp_trader_threshold || 65);

  const deviceClusters = await many(
    `SELECT d.fingerprint,
            COUNT(DISTINCT d.user_id)::int AS accounts,
            MAX(d.last_seen)               AS last_seen,
            STRING_AGG(DISTINCT u.email, ', ')    AS emails,
            STRING_AGG(DISTINCT d.ip, ', ')       AS ips
       FROM device_fingerprints d
       JOIN users u ON u.id = d.user_id
      WHERE u.role <> 'ADMIN'
      GROUP BY d.fingerprint
     HAVING COUNT(DISTINCT d.user_id) > 1
      ORDER BY COUNT(DISTINCT d.user_id) DESC, MAX(d.last_seen) DESC
      LIMIT 40`
  );

  const ipClusters = await many(
    `SELECT last_login_ip AS ip,
            COUNT(*)::int AS accounts,
            STRING_AGG(email, ', ') AS emails,
            MAX(last_login_at) AS last_seen
       FROM users
      WHERE last_login_ip <> '' AND role <> 'ADMIN'
      GROUP BY last_login_ip
     HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 40`
  );

  const sharp = await many(
    `SELECT u.id, u.email, u.full_name, u.vip_tier, u.custom_yield_ratio, u.is_blocked,
            COUNT(*)::int                                   AS trades,
            COUNT(*) FILTER (WHERE t.status = 'WON')::int    AS wins,
            COALESCE(SUM(t.profit),0)                        AS pnl,
            COALESCE(SUM(t.stake),0)                         AS volume
       FROM trades t JOIN users u ON u.id = t.user_id
      WHERE t.status IN ('WON','LOST')
        AND t.account_type = 'REAL'
        AND t.settled_at > NOW() - INTERVAL '30 days'
        AND u.role <> 'ADMIN'
      GROUP BY u.id, u.email, u.full_name, u.vip_tier, u.custom_yield_ratio, u.is_blocked
     HAVING COUNT(*) >= 15
        AND (COUNT(*) FILTER (WHERE t.status = 'WON')::numeric / COUNT(*)) * 100 >= $1
      ORDER BY COALESCE(SUM(t.profit),0) DESC
      LIMIT 40`,
    [threshold]
  );

  const rapid = await many(
    `SELECT u.email, u.id, COUNT(*)::int AS trades_last_hour, COALESCE(SUM(t.stake),0) AS volume
       FROM trades t JOIN users u ON u.id = t.user_id
      WHERE t.created_at > NOW() - INTERVAL '1 hour' AND u.role <> 'ADMIN'
      GROUP BY u.email, u.id
     HAVING COUNT(*) >= 30
      ORDER BY COUNT(*) DESC LIMIT 20`
  );

  return json({
    threshold,
    deviceClusters: deviceClusters.map((d) => ({
      fingerprint: d.fingerprint, accounts: Number(d.accounts), emails: d.emails, ips: d.ips, lastSeen: d.last_seen,
    })),
    ipClusters: ipClusters.map((r) => ({ ip: r.ip, accounts: Number(r.accounts), emails: r.emails, lastSeen: r.last_seen })),
    sharpTraders: sharp.map((s) => ({
      id: s.id, email: s.email, name: s.full_name, tier: s.vip_tier, isBlocked: s.is_blocked,
      customYieldRatio: s.custom_yield_ratio === null ? null : Number(s.custom_yield_ratio),
      trades: Number(s.trades), wins: Number(s.wins),
      winRate: Math.round((Number(s.wins) / Number(s.trades)) * 1000) / 10,
      pnl: Number(s.pnl), volume: Number(s.volume),
    })),
    rapidFire: rapid.map((r) => ({ id: r.id, email: r.email, trades: Number(r.trades_last_hour), volume: Number(r.volume) })),
  });
});
