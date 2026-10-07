/** Direct port: src/lib/affiliate.js. */
import { sql, one, many, uuid, money, withTransaction, getSettings } from '../db';
import { publish } from './realtime.js';

/**
 * Generate a unique, user-friendly referral code (e.g., NX-7A8B).
 */
export function generateReferralCode(email = '') {
  const prefix = 'NX';
  const clean = email.replace(/[^a-zA-Z0-0]/g, '').slice(0, 3).toUpperCase() || 'TRD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${clean}${rand}`;
}

/**
 * Record a 40% (or custom partner rate) commission for an affiliate referrer.
 * Called automatically when a referred user completes an approved deposit or trade.
 */
export async function recordCommission({ referrerId, referredUserId, sourceType = 'DEPOSIT', sourceId = '', grossAmount = 0 }) {
  if (!referrerId || !referredUserId || grossAmount <= 0) return null;

  const settings = await getSettings();
  if (!settings.affiliate_enabled) return null;

  return await withTransaction(async (tx) => {
    // Check referrer account & status
    await tx.lock('users', referrerId);
    const referrer = await tx.one('SELECT id, commission_rate, affiliate_status, is_blocked FROM users WHERE id = $1', [referrerId]);
    if (!referrer || referrer.is_blocked || referrer.affiliate_status !== 'ACTIVE') {
      return null;
    }

    const rate = Number(referrer.commission_rate ?? settings.affiliate_default_rate ?? 40.00);
    const commAmount = money((Number(grossAmount) * rate) / 100);

    if (commAmount <= 0) return null;

    const commId = uuid();
    await tx.query(
      `INSERT INTO affiliate_commissions (id, referrer_id, referred_user_id, source_type, source_id, gross_amount, commission_rate, commission_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CREDITED')`,
      [commId, referrerId, referredUserId, sourceType, sourceId, grossAmount, rate, commAmount]
    );

    // Credit affiliate balance
    await tx.query(
      `UPDATE users SET affiliate_balance = affiliate_balance + $2 WHERE id = $1`,
      [referrerId, commAmount]
    );

    // Send notification
    await tx.query(
      `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1, $2, $3, $4, 'SUCCESS')`,
      [
        uuid(),
        referrerId,
        'Commission Credited! 💸',
        `You earned a $${commAmount.toFixed(2)} (${rate}% commission) payout from a referred user ${sourceType.toLowerCase()}.`,
      ]
    );

    await publish('balance', { reason: 'COMMISSION_CREDITED', amount: commAmount }, referrerId);
    await publish('notification', { title: 'Commission Credited' }, referrerId);

    return { commId, rate, commAmount };
  });
}

/**
 * Ensures user has a valid referral_code.
 */
export async function ensureReferralCode(user) {
  if (!user) return null;
  if (user.referralCode || user.referral_code) return user.referralCode || user.referral_code;

  let code = generateReferralCode(user.email);
  let exists = await one('SELECT id FROM users WHERE referral_code = $1', [code]);
  while (exists) {
    code = generateReferralCode(user.email);
    exists = await one('SELECT id FROM users WHERE referral_code = $1', [code]);
  }

  await sql('UPDATE users SET referral_code = $1 WHERE id = $2', [code, user.id]);
  return code;
}
