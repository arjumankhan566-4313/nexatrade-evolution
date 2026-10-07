/** Direct port of src/app/api/admin/payments/route.js; transport imports only. */
import { many, one, sql, uuid } from '../db';
import { requireAdmin, json, fail, route, readJson } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { PERMISSIONS } from '../lib/rbac.js';


const KINDS = ['CRYPTO', 'LOCAL', 'BANK', 'AUTO'];
const CODES = new Set([
  'BITCOIN', 'USDT_TRC20', 'USDT_ERC20', 'ETHEREUM',
  'BKASH', 'NAGAD', 'ROCKET', 'BANK_TRANSFER', 'CARD',
]);

function serialize(r) {
  return {
    id: r.id, kind: r.kind, name: r.name, code: r.code,
    instructions: r.instructions, address: r.address, extra: r.extra,
    qrData: r.qr_data, isActive: r.is_active, sortOrder: r.sort_order,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** List payment methods (admin sees inactive too). */
export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.FINANCE_VIEW);
  if (response) return response;
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope');
  const rows = await many(
    `SELECT * FROM payment_methods ${scope === 'active' ? 'WHERE is_active=TRUE' : ''} ORDER BY sort_order, name`,
    []
  );
  return json({ methods: rows.map(serialize) });
});

/** Create a payment method. */
export const POST = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.PAYMENT_METHODS_MANAGE);
  if (response) return response;
  const b = await readJson(req);

  const kind = String(b.kind || 'CRYPTO').toUpperCase();
  const name = String(b.name || '').trim();
  const code = String(b.code || '').toUpperCase();
  if (!KINDS.includes(kind)) return fail('kind must be CRYPTO, LOCAL, BANK or AUTO.');
  if (!name || name.length > 80) return fail('A method name is required (max 80 chars).');
  if (!code || !CODES.has(code)) return fail('A valid payment code is required.');

  const dup = await one('SELECT id FROM payment_methods WHERE code=$1', [code]);
  if (dup) return fail('A method with this code already exists.', 409);

  const id = uuid();
  await sql(
    `INSERT INTO payment_methods (id, kind, name, code, instructions, address, extra, qr_data, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id, kind, name, code,
      String(b.instructions || '').slice(0, 600),
      String(b.address || '').slice(0, 300),
      String(b.extra || '').slice(0, 300),
      String(b.qrData || '').slice(0, 600),
      b.isActive === undefined ? true : Boolean(b.isActive),
      Number(b.sortOrder || 0),
    ]
  );
  await logSecurity({ req, userId: admin.id, email: admin.email, event: 'PAYMENT_METHOD_CREATED', meta: { code, name } });
  await publish('payments', { code }, null);
  const row = await one('SELECT * FROM payment_methods WHERE id=$1', [id]);
  return json({ ok: true, method: serialize(row) }, 201);
});
