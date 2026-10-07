/** Direct port of src/app/api/admin/transactions/route.js; transport imports only. */
import { many } from '../db';
import { requireAdmin, json, route } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';


export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.FINANCE_VIEW);
  if (response) return response;
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') || 'PENDING').toUpperCase();
  const where = status === 'ALL' ? '' : 'WHERE t.status = $1';
  const params = status === 'ALL' ? [] : [status];

  const rows = await many(
    `SELECT t.*, u.email, u.full_name, u.kyc_status, u.balance_real,
            pm.name AS method_name, pm.kind AS method_kind
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN payment_methods pm ON pm.code = t.method
     ${where} ORDER BY t.created_at DESC LIMIT 200`,
    params
  );
  return json({
    transactions: rows.map((t) => ({
      id: t.id, userId: t.user_id, email: t.email, fullName: t.full_name, kycStatus: t.kyc_status,
      userBalance: Number(t.balance_real), type: t.type, amount: Number(t.amount), currency: t.currency,
      method: t.method, methodName: t.method_name || t.method, methodKind: t.method_kind || '',
      reference: t.reference, status: t.status, adminNote: t.admin_note,
      mode: t.mode || 'MANUAL', senderAccount: t.sender_account || '', proofImage: t.proof_image || '',
      createdAt: t.created_at, processedAt: t.processed_at,
    })),
  });
});
