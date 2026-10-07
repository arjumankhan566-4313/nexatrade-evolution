/** Direct port of src/app/api/admin/tiers/route.js; transport imports only. */
import { one, sql, uuid } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { listTiers, serializeTier } from '../lib/social.js';
import { PERMISSIONS } from '../lib/rbac.js';


/** READ — the whole VIP ladder including disabled rungs. */
export const GET = route(async () => {
  const { response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  return json({ tiers: await listTiers(true) });
});

/** CREATE — add a new VIP tier. */
export const POST = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim();
  if (name.length < 2) return fail('Tier name is required.');

  const exists = await one('SELECT id FROM vip_tiers WHERE LOWER(name) = LOWER($1)', [name]);
  if (exists) return fail('A tier with that name already exists.', 409);

  const id = String(b.id || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || uuid();
  await sql(
    `INSERT INTO vip_tiers (id, name, min_volume, payout_bonus, cashback_pct, color, perks, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
    [
      id, name,
      Math.max(0, Number(b.minVolume) || 0),
      Math.min(30, Math.max(0, Number(b.payoutBonus) || 0)),
      Math.min(50, Math.max(0, Number(b.cashbackPct) || 0)),
      String(b.color || '#f5c542').slice(0, 20),
      String(b.perks || '').slice(0, 300),
      Number(b.sortOrder) || 99,
    ]
  );
  await logSecurity({ req, userId: user.id, email: user.email, event: 'VIP_TIER_CREATED', severity: 'WARNING', meta: { name } });
  await publish('tiers', { action: 'created', id, name });
  const row = await one('SELECT * FROM vip_tiers WHERE id = $1', [id]);
  return json({ tier: serializeTier(row) }, 201);
});
