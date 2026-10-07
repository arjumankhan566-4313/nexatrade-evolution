/** Direct port of src/app/api/admin/affiliate/route.js; transport imports only. */
import { requireAdmin, json, fail, route, readJson } from '../http';
import { one, many, sql, uuid, money, withTransaction, getSettings } from '../db';
import { PERMISSIONS } from '../lib/rbac.js';
import { logSecurity } from '../http';


export const GET = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.USERS_VIEW);
  if (response) return response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';

  const settings = await getSettings();

  // Affiliates overview stats
  const totalAffiliatesRow = await one(
    `SELECT COUNT(*)::int AS count FROM users
     WHERE role='USER' AND affiliate_status='ACTIVE' AND referral_code IS NOT NULL`
  );
  const totalAffiliates = totalAffiliatesRow?.count ?? 0;

  const totalCommissionsRow = await one(
    `SELECT COALESCE(SUM(commission_amount), 0)::numeric AS total FROM affiliate_commissions`
  );
  const totalCommissions = Number(totalCommissionsRow?.total ?? 0);

  const pendingPayoutsRow = await one(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::numeric AS amount FROM affiliate_payouts WHERE status = 'PENDING'`
  );
  const pendingPayoutCount = pendingPayoutsRow?.count ?? 0;
  const pendingPayoutAmount = Number(pendingPayoutsRow?.amount ?? 0);

  // Count pending affiliate applications
  const pendingAppsRow = await one(
    `SELECT COUNT(*)::int AS count FROM affiliate_applications WHERE status = 'PENDING'`
  );

  // Partners list
  const querySql = q
    ? `WHERE u.full_name ILIKE $1 OR u.email ILIKE $1 OR u.referral_code ILIKE $1`
    : ``;
  const params = q ? [`%${q}%`] : [];

  const partners = await many(
    `SELECT u.id, u.full_name, u.email, u.country, u.referral_code, u.commission_rate, u.affiliate_status, u.affiliate_balance, u.created_at,
            (SELECT COUNT(*)::int FROM users r WHERE r.referred_by = u.id) AS referral_count,
            (SELECT COALESCE(SUM(commission_amount), 0)::numeric FROM affiliate_commissions c WHERE c.referrer_id = u.id) AS total_earned
     FROM users u
     ${querySql}
     ORDER BY referral_count DESC, u.created_at DESC
     LIMIT 100`,
    params
  );

  // Payout requests queue
  const payouts = await many(
    `SELECT p.*, u.full_name, u.email
     FROM affiliate_payouts p
     JOIN users u ON p.user_id = u.id
     ORDER BY CASE WHEN p.status = 'PENDING' THEN 0 ELSE 1 END, p.created_at DESC
     LIMIT 100`
  );

  return json({
    stats: {
      totalAffiliates,
      totalCommissions,
      pendingPayoutCount,
      pendingPayoutAmount,
      defaultRate: settings.affiliate_default_rate,
      affiliateEnabled: settings.affiliate_enabled,
      pendingApplications: pendingAppsRow?.count ?? 0,
    },
    partners: partners.map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      country: p.country,
      referralCode: p.referral_code,
      commissionRate: Number(p.commission_rate ?? settings.affiliate_default_rate ?? 40.00),
      affiliateStatus: p.affiliate_status || 'ACTIVE',
      affiliateBalance: Number(p.affiliate_balance ?? 0),
      referralCount: Number(p.referral_count ?? 0),
      totalEarned: Number(p.total_earned ?? 0),
      createdAt: p.created_at,
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      userId: p.user_id,
      fullName: p.full_name,
      email: p.email,
      amount: Number(p.amount),
      method: p.payout_method,
      details: p.payout_details,
      status: p.status,
      adminNote: p.admin_note,
      createdAt: p.created_at,
      processedAt: p.processed_at,
    })),
  });
});

/**
 * Update individual partner commission rate or affiliate status
 */
export const PATCH = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;

  const body = await readJson(req);
  const { userId, commissionRate, affiliateStatus } = body;

  if (!userId) return fail('User ID required', 400);

  const updates = [];
  const params = [userId];
  let pIdx = 2;

  if (typeof commissionRate === 'number' && commissionRate >= 0 && commissionRate <= 100) {
    updates.push(`commission_rate = $${pIdx}`);
    params.push(commissionRate);
    pIdx += 1;
  }

  if (affiliateStatus && ['ACTIVE', 'PAUSED', 'LOCKED'].includes(affiliateStatus.toUpperCase())) {
    updates.push(`affiliate_status = $${pIdx}`);
    params.push(affiliateStatus.toUpperCase());
    pIdx += 1;
  }

  if (updates.length === 0) {
    return fail('No valid fields to update.', 400);
  }

  await sql(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, params);

  await logSecurity({
    req,
    userId: admin.id,
    email: admin.email,
    event: 'AFFILIATE_CONFIG_UPDATE',
    severity: 'MEDIUM',
    meta: { targetUserId: userId, commissionRate, affiliateStatus },
  });

  return json({ ok: true, message: 'Affiliate settings updated.' });
});
