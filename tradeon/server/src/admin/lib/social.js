/** Legacy VIP read/serialization helpers. */
import { many } from '../db';
export async function listTiers(includeInactive = false) {
  const rows = await many(
    `SELECT * FROM vip_tiers ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY sort_order ASC, min_volume ASC`
  );
  return rows.map(serializeTier);
}

export function serializeTier(r) {
  return {
    id: r.id,
    name: r.name,
    minVolume: Number(r.min_volume),
    payoutBonus: Number(r.payout_bonus),
    cashbackPct: Number(r.cashback_pct),
    color: r.color,
    perks: r.perks,
    sortOrder: Number(r.sort_order),
    isActive: Boolean(r.is_active),
  };
}

