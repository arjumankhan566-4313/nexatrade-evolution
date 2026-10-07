/** Direct port of src/app/api/admin/payments/[id]/route.js; transport imports only. */
import { one, sql } from '../db';
import { requireAdmin, json, fail, route, readJson } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { PERMISSIONS } from '../lib/rbac.js';


/** Update (full CRUD edit) a payment method. */
export const PATCH = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.PAYMENT_METHODS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const existing = await one('SELECT * FROM payment_methods WHERE id=$1', [id]);
  if (!existing) return fail('Payment method not found.', 404);

  const b = await readJson(req);
  const fields = [];
  const vals = [];
  let n = 1;
  const push = (col, val) => { fields.push(`${col}=$${n++}`); vals.push(val); };

  if (b.name !== undefined) push('name', String(b.name).slice(0, 80));
  if (b.instructions !== undefined) push('instructions', String(b.instructions).slice(0, 600));
  if (b.address !== undefined) push('address', String(b.address).slice(0, 300));
  if (b.extra !== undefined) push('extra', String(b.extra).slice(0, 300));
  if (b.qrData !== undefined) push('qr_data', String(b.qrData).slice(0, 600));
  if (b.isActive !== undefined) push('is_active', Boolean(b.isActive));
  if (b.sortOrder !== undefined) push('sort_order', Number(b.sortOrder) || 0);
  if (!fields.length) return fail('Nothing to update.');

  fields.push('updated_at=NOW()');
  vals.push(id);
  await sql(`UPDATE payment_methods SET ${fields.join(', ')} WHERE id=$${n}`, vals);

  await logSecurity({ req, userId: admin.id, email: admin.email, event: 'PAYMENT_METHOD_UPDATED', meta: { code: existing.code } });
  await publish('payments', { code: existing.code }, null);
  const row = await one('SELECT * FROM payment_methods WHERE id=$1', [id]);
  return json({
    ok: true,
    method: {
      id: row.id, kind: row.kind, name: row.name, code: row.code,
      instructions: row.instructions, address: row.address, extra: row.extra,
      qrData: row.qr_data, isActive: row.is_active, sortOrder: row.sort_order,
    },
  });
});

/** Delete a payment method. */
export const DELETE = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.PAYMENT_METHODS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const existing = await one('SELECT * FROM payment_methods WHERE id=$1', [id]);
  if (!existing) return fail('Payment method not found.', 404);

  await sql('DELETE FROM payment_methods WHERE id=$1', [id]);
  await logSecurity({ req, userId: admin.id, email: admin.email, event: 'PAYMENT_METHOD_DELETED', severity: 'WARNING', meta: { code: existing.code } });
  await publish('payments', { code: existing.code, deleted: true }, null);
  return json({ ok: true, id });
});
