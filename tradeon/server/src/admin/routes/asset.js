/** Direct port of src/app/api/admin/assets/[symbol]/route.js; transport imports only. */
import { one, sql } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { PERMISSIONS } from '../lib/rbac.js';


const FIELDS = {
  name: 'display_name',
  category: 'category',
  provider: 'provider',
  feedSymbol: 'feed_symbol',
  payoutRate: 'payout_percentage',
  digits: 'price_digits',
  isActive: 'is_active',
  sortOrder: 'sort_order',
};

/** UPDATE — edit any property of an instrument; pushes to every open terminal. */
export const PATCH = route(async (req, { params }) => {
  const { user, response } = await requireAdmin(PERMISSIONS.ASSETS_MANAGE);
  if (response) return response;
  const { symbol } = await params;
  const asset = await one('SELECT * FROM markets WHERE symbol = $1', [symbol]);
  if (!asset) return fail('Asset not found.', 404);

  const body = await req.json().catch(() => ({}));
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    let v = body[key];
    if (key === 'payoutRate') {
      v = Number(v);
      if (!Number.isFinite(v) || v < 10 || v > 99) return fail('Payout must be between 10 and 99.');
    }
    if (key === 'digits') v = Math.min(8, Math.max(0, Number(v)));
    if (key === 'sortOrder') v = Number(v) || 0;
    if (key === 'isActive') v = Boolean(v);
    values.push(v);
    sets.push(`${column} = $${values.length}`);
  }
  if (!sets.length) return fail('Nothing to update.');
  values.push(symbol);
  await sql(`UPDATE markets SET ${sets.join(', ')} WHERE symbol = $${values.length}`, values);

  await logSecurity({ req, userId: user.id, email: user.email, event: 'MARKET_UPDATED', severity: 'WARNING', meta: { symbol, body } });
  await publish('assets', { action: 'updated', symbol, changes: body });

  const row = await one('SELECT * FROM markets WHERE symbol = $1', [symbol]);
  return json({
    asset: {
      symbol: row.symbol, name: row.display_name, category: row.category, provider: row.provider,
      feedSymbol: row.feed_symbol, payoutRate: Number(row.payout_percentage), digits: Number(row.price_digits),
      isActive: Boolean(row.is_active), sortOrder: Number(row.sort_order),
    },
  });
});

/**
 * DELETE — remove an instrument outright.
 * Blocked only while positions are still open on it (deleting then would strand
 * live money); `?force=1` disables it instead of deleting, for a clean archive.
 */
export const DELETE = route(async (req, { params }) => {
  const { user, response } = await requireAdmin(PERMISSIONS.ASSETS_MANAGE);
  if (response) return response;
  const { symbol } = await params;
  const asset = await one('SELECT * FROM markets WHERE symbol = $1', [symbol]);
  if (!asset) return fail('Asset not found.', 404);

  const open = await one(`SELECT COUNT(*)::int AS n FROM trades WHERE symbol = $1 AND status IN ('OPEN','SETTLING')`, [symbol]);
  if (Number(open.n) > 0) {
    return fail(`${open.n} position(s) are still open on ${symbol}. Disable it instead, or wait for expiry.`, 409);
  }

  await sql('DELETE FROM markets WHERE symbol = $1', [symbol]);
  await logSecurity({ req, userId: user.id, email: user.email, event: 'MARKET_DELETED', severity: 'CRITICAL', meta: { symbol } });
  await publish('assets', { action: 'deleted', symbol });
  return json({ ok: true, symbol });
});
