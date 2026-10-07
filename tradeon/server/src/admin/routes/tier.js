/** Direct port of src/app/api/admin/tiers/[id]/route.js; transport imports only. */
import { one, sql } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { serializeTier } from '../lib/social.js';
import { PERMISSIONS } from '../lib/rbac.js';


const FIELDS = {
  name: 'name', minVolume: 'min_volume', payoutBonus: 'payout_bonus',
  cashbackPct: 'cashback_pct', color: 'color', perks: 'perks',
  sortOrder: 'sort_order', isActive: 'is_active',
};

/** UPDATE a VIP tier — payout bonuses apply to the next trade instantly. */
export const PATCH = route(async (req, { params }) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const tier = await one('SELECT * FROM vip_tiers WHERE id = $1', [id]);
  if (!tier) return fail('Tier not found.', 404);

  const body = await req.json().catch(() => ({}));
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    let v = body[key];
    if (['minVolume', 'payoutBonus', 'cashbackPct', 'sortOrder'].includes(key)) {
      v = Number(v);
      if (!Number.isFinite(v) || v < 0) return fail(`${key} must be a positive number.`);
      if (key === 'payoutBonus' && v > 30) return fail('Payout bonus is capped at 30 percentage points.');
    }
    if (key === 'isActive') v = Boolean(v);
    values.push(v);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) return fail('Nothing to update.');
  values.push(id);
  await sql(`UPDATE vip_tiers SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

  // Keep users pointing at the tier if it was renamed.
  if (body.name && body.name !== tier.name) {
    await sql('UPDATE users SET vip_tier = $2 WHERE vip_tier = $1', [tier.name, body.name]);
  }

  await logSecurity({ req, userId: user.id, email: user.email, event: 'VIP_TIER_UPDATED', severity: 'WARNING', meta: { id, body } });
  await publish('tiers', { action: 'updated', id, changes: body });
  const row = await one('SELECT * FROM vip_tiers WHERE id = $1', [id]);
  return json({ tier: serializeTier(row) });
});

/** DELETE a VIP tier; members fall back to the lowest remaining rung. */
export const DELETE = route(async (req, { params }) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const tier = await one('SELECT * FROM vip_tiers WHERE id = $1', [id]);
  if (!tier) return fail('Tier not found.', 404);

  const remaining = await one('SELECT COUNT(*)::int AS n FROM vip_tiers', []);
  if (Number(remaining.n) <= 1) return fail('At least one VIP tier must exist.', 409);

  await sql('DELETE FROM vip_tiers WHERE id = $1', [id]);
  const fallback = await one('SELECT name FROM vip_tiers ORDER BY min_volume ASC LIMIT 1');
  await sql('UPDATE users SET vip_tier = $2 WHERE vip_tier = $1', [tier.name, fallback?.name || 'Standard']);

  await logSecurity({ req, userId: user.id, email: user.email, event: 'VIP_TIER_DELETED', severity: 'CRITICAL', meta: { id } });
  await publish('tiers', { action: 'deleted', id });
  return json({ ok: true, id });
});
