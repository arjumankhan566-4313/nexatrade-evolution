/** Direct port of src/app/api/admin/assets/route.js; transport imports only. */
import { many, one, sql } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { ASSET_CATEGORIES } from '../lib/assetCatalog.js';
import { PERMISSIONS } from '../lib/rbac.js';


const serialize = (r) => ({
  symbol: r.symbol,
  name: r.display_name,
  category: r.category,
  provider: r.provider,
  feedSymbol: r.feed_symbol,
  payoutRate: Number(r.payout_percentage),
  digits: Number(r.price_digits),
  isActive: Boolean(r.is_active),
  sortOrder: Number(r.sort_order),
  trades: r.trades === undefined ? undefined : Number(r.trades),
  volume: r.volume === undefined ? undefined : Number(r.volume),
});

/** READ — every instrument, active or not, with 24h usage. */
export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.ASSETS_MANAGE);
  if (response) return response;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const category = (url.searchParams.get('category') || 'ALL').toUpperCase();

  const rows = await many(
    `SELECT a.*,
            (SELECT COUNT(*)::int FROM trades t WHERE t.symbol = a.symbol AND t.created_at > NOW() - INTERVAL '24 hours') AS trades,
            (SELECT COALESCE(SUM(t.stake),0) FROM trades t WHERE t.symbol = a.symbol AND t.created_at > NOW() - INTERVAL '24 hours') AS volume
       FROM markets a
      WHERE ($1 = 'ALL' OR a.category = $1)
        AND ($2 = '' OR LOWER(a.symbol) LIKE '%' || $2 || '%' OR LOWER(a.display_name) LIKE '%' || $2 || '%')
      ORDER BY a.sort_order ASC LIMIT 400`,
    [category, q]
  );

  const counts = await many('SELECT category, COUNT(*)::int AS n FROM markets GROUP BY category');
  return json({
    assets: rows.map(serialize),
    categories: ASSET_CATEGORIES,
    counts: Object.fromEntries(counts.map((c) => [c.category, Number(c.n)])),
    total: rows.length,
  });
});

/** CREATE — add a brand-new tradable instrument from the panel. */
export const POST = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.ASSETS_MANAGE);
  if (response) return response;
  const b = await req.json().catch(() => ({}));

  const symbol = String(b.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9^._-]{2,20}$/.test(symbol)) return fail('Symbol must be 2-20 characters (A-Z, 0-9).');
  const category = String(b.category || '').toUpperCase();
  if (!ASSET_CATEGORIES.includes(category)) return fail(`Category must be one of ${ASSET_CATEGORIES.join(', ')}.`);

  const exists = await one('SELECT symbol FROM markets WHERE symbol = $1', [symbol]);
  if (exists) return fail('That symbol already exists.', 409);

  const provider =
    String(b.provider || '').toUpperCase() ||
    (category === 'CRYPTO' ? 'BINANCE' : category === 'STOCK' ? 'EQUITY' : category === 'INDEX' ? 'INDEX' : 'FX');
  const payout = Math.min(99, Math.max(10, Number(b.payoutRate) || 80));
  const digits = Math.min(8, Math.max(0, Number(b.digits) ?? 2));

  await sql(
    `INSERT INTO markets (symbol, display_name, category, provider, feed_symbol, payout_percentage, price_digits, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      symbol,
      String(b.name || symbol).slice(0, 60),
      category,
      provider,
      String(b.feedSymbol || (category === 'CRYPTO' ? symbol.toLowerCase() : symbol)).slice(0, 40),
      payout,
      digits,
      b.isActive === false ? false : true,
      Number(b.sortOrder) || 50_000,
    ]
  );

  await logSecurity({ req, userId: user.id, email: user.email, event: 'MARKET_CREATED', severity: 'CRITICAL', meta: { symbol } });
  await publish('assets', { action: 'created', symbol });
  const row = await one('SELECT * FROM markets WHERE symbol = $1', [symbol]);
  return json({ asset: serialize(row) }, 201);
});
