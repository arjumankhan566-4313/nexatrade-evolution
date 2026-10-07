/** Direct port of src/app/api/admin/kyc/[id]/route.js; transport imports only. */
import { uuid, withTransaction } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { PERMISSIONS } from '../lib/rbac.js';


/** Approve / reject a KYC case (manual review — Module 5.3). */
export const PATCH = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.KYC_REVIEW);
  if (response) return response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = String(body.decision || '').toUpperCase();
  const note = String(body.note || '').slice(0, 500);
  if (!['VERIFIED', 'REJECTED'].includes(decision)) return fail('decision must be VERIFIED or REJECTED.');

  const result = await withTransaction(async (tx) => {
    await tx.lock('kyc_submissions', id);
    const submission = await tx.one('SELECT id, user_id, status FROM kyc_submissions WHERE id=$1', [id]);
    if (!submission) return { missing: true };
    if (['VERIFIED', 'REJECTED'].includes(submission.status)) return { decided: true };
    await tx.query(
      `UPDATE kyc_submissions SET status=$2, reviewer_note=$3, reviewed_by=$4, reviewed_at=NOW() WHERE id=$1`,
      [id, decision, note, admin.id]
    );
    await tx.query('UPDATE users SET kyc_status=$2 WHERE id=$1', [submission.user_id, decision]);
    await tx.query(`INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,$5)`, [
      uuid(), submission.user_id,
      decision === 'VERIFIED' ? 'KYC approved ✅' : 'KYC rejected',
      decision === 'VERIFIED'
        ? 'Your identity has been verified. Real-money trading and withdrawals are now unlocked.'
        : note || 'Your documents could not be verified. Please submit clearer photos.',
      decision === 'VERIFIED' ? 'SUCCESS' : 'WARNING',
    ]);
    return { submission };
  });
  if (result.missing) return fail('Submission not found.', 404);
  if (result.decided) return fail('This case has already been decided.', 409);
  const submission = result.submission;
  await logSecurity({
    req, userId: admin.id, email: admin.email, event: `KYC_${decision}`, severity: 'CRITICAL',
    meta: { submissionId: id, note },
  });

  await publish('kyc', { status: decision }, submission.user_id);
  await publish('admin', { action: 'kyc_reviewed', submissionId: id });
  return json({ ok: true, status: decision });
});
