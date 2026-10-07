/** Affiliate referral codes — ported from legacy src/lib/affiliate.js. */
export function generateReferralCode(email = '') {
  const prefix = 'NX';
  const clean = email.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'TRD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${clean}${rand}`;
}
