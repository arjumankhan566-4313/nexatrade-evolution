/** Direct port of src/app/api/admin/transactions/[id]/route.js; transport imports only. */
import { one, sql, uuid, money, withTransaction } from '../db';
import { requireAdmin, json, fail, route, readJson } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { PERMISSIONS } from '../lib/rbac.js';
import { recordCommission } from '../lib/affiliate.js';
import { createBinancePayout, binanceConfigured } from '../lib/binancePay.js';


/**
 * Approve or reject a deposit / withdrawal request (Module 5.3).
 *
 * The balance movement and the status flip run in ONE database transaction
 * with the user row locked (SELECT … FOR UPDATE), so double-approval,
 * double-credit and race-condition balance fluctuations are impossible:
 * either everything commits together or nothing does.
 */
export const PATCH = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.FINANCE_APPROVE);
  if (response) return response;
  const { id } = await params;
  const body = await readJson(req);
  const decision = String(body.decision || '').toUpperCase();
  const note = String(body.note || '').slice(0, 300);
  if (!['APPROVED', 'REJECTED'].includes(decision)) return fail('decision must be APPROVED or REJECTED.');

  let referredBy = null;

  const result = await withTransaction(async (tx) => {
    // Lock the request so two admins can't process it concurrently.
    await tx.lock('transactions', id);
    const t = await tx.one('SELECT * FROM transactions WHERE id=$1', [id]);
    if (!t) return { error: { message: 'Transaction not found.', status: 404 } };
    if (t.status !== 'PENDING') return { error: { message: 'This request has already been processed.', status: 409 } };

    const amount = money(Number(t.amount));

    if (decision === 'APPROVED' && t.type === 'DEPOSIT' && t.mode === 'AUTO') {
      // Gateway (AUTO) deposits are credited ONLY by the gateway confirmation
      // (signed webhook in production, one-time demo-charge token in preview) —
      // never by a manual admin click. Approving it here would credit a balance
      // before a payment was actually taken (the fake/safety-deposit hole).
      return {
        error: {
          message: 'Automatic deposits are credited by the payment gateway after the charge is confirmed. Manual approval is not allowed — use the gateway checkout.',
          status: 409,
        },
      };
    }

    if (decision === 'APPROVED') {
      if (t.type === 'DEPOSIT') {
        // Anti-fraud: a payment reference that was already credited must never
        // credit a second time — checked inside the SAME transaction as the
        // credit so two admins approving in parallel cannot both pass.
        const dup = await tx.one(
          `SELECT id FROM transactions
           WHERE type='DEPOSIT' AND status='APPROVED' AND method=$1 AND LOWER(reference)=LOWER($2) AND id <> $3
           LIMIT 1`,
          [t.method, t.reference || '', id]
        );
        if (dup) {
          return { error: { message: 'This payment reference (TrxID / hash) was already credited on another approved deposit. Reject as a duplicate / fake deposit.', status: 409 } };
        }
        // Lock the user row, then credit atomically.
        await tx.lock('users', t.user_id);
        const u = await tx.one('SELECT referred_by FROM users WHERE id=$1', [t.user_id]);
        referredBy = u?.referred_by || null;

        await tx.query('UPDATE users SET balance_real = balance_real + $2 WHERE id=$1', [t.user_id, amount]);
      } else if (t.type === 'WITHDRAWAL') {
        await tx.lock('users', t.user_id);
        const debited = await tx.one(
          'UPDATE users SET balance_real = balance_real - $2 WHERE id=$1 AND balance_real >= $2 RETURNING balance_real',
          [t.user_id, amount]
        );
        if (!debited) return { error: { message: 'User no longer has sufficient balance for this withdrawal.', status: 409 } };
      }
    }

    await tx.query(
      `UPDATE transactions SET status=$2, admin_note=$3, processed_by=$4, processed_at=NOW() WHERE id=$1`,
      [id, decision, note, admin.id]
    );
    await tx.query(
      `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,$5)`,
      [
        uuid(), t.user_id,
        `${t.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} ${decision.toLowerCase()}`,
        `$${amount.toFixed(2)} via ${t.method}${note ? ` — ${note}` : ''}`,
        decision === 'APPROVED' ? 'SUCCESS' : 'WARNING',
      ]
    );
    return { ok: true, tx: t, amount };
  });

  if (result.error) return fail(result.error.message, result.error.status);

  if (decision === 'APPROVED' && result.tx.type === 'WITHDRAWAL' && result.tx.method === 'BINANCE_PAY') {
    if (!binanceConfigured()) return fail('Binance Pay is not configured; withdrawal remains approved but payout was not sent.', 503);
    try {
      await createBinancePayout({ merchantTradeNo: `NX-PAYOUT-${result.tx.id}`, amount: result.amount, currency: result.tx.currency || 'USDT', address: result.tx.reference });
    } catch (err) {
      await sql("UPDATE transactions SET admin_note=CONCAT(COALESCE(admin_note,''), ' Binance payout failed: ', $2), status='PENDING', processed_by=NULL, processed_at=NULL WHERE id=$1", [result.tx.id, err.message]);
      return fail('Binance payout failed; withdrawal was returned to the approval queue.', 502);
    }
  }

  // Trigger automated 40% affiliate commission if deposit was approved and user was referred
  if (decision === 'APPROVED' && result.tx.type === 'DEPOSIT' && referredBy) {
    try {
      await recordCommission({
        referrerId: referredBy,
        referredUserId: result.tx.user_id,
        sourceType: 'DEPOSIT',
        sourceId: result.tx.id,
        grossAmount: result.amount,
      });
    } catch (err) {
      console.error('[affiliate] Error recording commission:', err);
    }
  }

  await logSecurity({
    req, userId: admin.id, email: admin.email, event: `${result.tx.type}_${decision}`, severity: 'CRITICAL',
    meta: { transactionId: id, amount: result.amount, method: result.tx.method, by: admin.role },
  });

  await publish('balance', { reason: `TX_${decision}`, txId: result.tx.id }, result.tx.user_id);
  await publish('notification', { title: `Transaction ${decision.toLowerCase()}` }, result.tx.user_id);
  return json({ ok: true, status: decision });
});
