/** Direct port of src/app/api/admin/affiliate/payouts/[id]/route.js; transport imports only. */
import { requireAdmin, json, fail, route, readJson } from '../http';
import { one, sql, uuid, money, withTransaction } from '../db';
import { PERMISSIONS } from '../lib/rbac.js';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';


export const PATCH = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.FINANCE_APPROVE);
  if (response) return response;

  const { id } = await params;
  const body = await readJson(req);
  const decision = String(body.decision || '').toUpperCase();
  const note = String(body.note || '').slice(0, 300);

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return fail('Decision must be APPROVED or REJECTED.', 400);
  }

  const result = await withTransaction(async (tx) => {
    await tx.lock('affiliate_payouts', id);
    const p = await tx.one('SELECT * FROM affiliate_payouts WHERE id = $1', [id]);
    if (!p) return { error: 'Payout request not found.', status: 404 };
    if (p.status !== 'PENDING') return { error: 'Payout request has already been processed.', status: 409 };

    const amount = Number(p.amount);

    if (decision === 'REJECTED') {
      // Refund affiliate balance if rejected
      await tx.lock('users', p.user_id);
      await tx.query('UPDATE users SET affiliate_balance = affiliate_balance + $2 WHERE id = $1', [p.user_id, amount]);
    }

    await tx.query(
      `UPDATE affiliate_payouts SET status = $2, admin_note = $3, processed_by = $4, processed_at = NOW() WHERE id = $1`,
      [id, decision, note, admin.id]
    );

    await tx.query(
      `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1, $2, $3, $4, $5)`,
      [
        uuid(),
        p.user_id,
        `Commission Payout ${decision}`,
        `$${amount.toFixed(2)} via ${p.payout_method}${note ? ` — ${note}` : ''}`,
        decision === 'APPROVED' ? 'SUCCESS' : 'WARNING',
      ]
    );

    return { ok: true, payout: p, amount };
  });

  if (result.error) return fail(result.error, result.status || 400);

  await logSecurity({
    req,
    userId: admin.id,
    email: admin.email,
    event: `AFFILIATE_PAYOUT_${decision}`,
    severity: 'CRITICAL',
    meta: { payoutId: id, amount: result.amount, targetUserId: result.payout.user_id },
  });

  await publish('balance', { reason: `AFFILIATE_PAYOUT_${decision}` }, result.payout.user_id);
  await publish('notification', { title: `Affiliate Payout ${decision}` }, result.payout.user_id);

  return json({ ok: true, status: decision });
});
