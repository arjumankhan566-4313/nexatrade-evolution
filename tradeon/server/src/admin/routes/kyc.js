/** Direct port of src/app/api/admin/kyc/route.js; transport imports only. */
import { many } from '../db';
import { requireAdmin, json, route } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';


export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.KYC_REVIEW);
  if (response) return response;
  const status = (new URL(req.url).searchParams.get('status') || 'UNDER_REVIEW').toUpperCase();
  const where = status === 'ALL' ? '' : 'WHERE k.status = $1';
  const params = status === 'ALL' ? [] : [status];

  const rows = await many(
    `SELECT k.id, k.user_id, k.country, k.doc_type, k.doc_number, k.full_name, k.date_of_birth, k.address,
            CASE WHEN LEFT(k.doc_front,11)='data:image/' THEN 'kyc/db/' || k.id::text || '/document-front' ELSE k.doc_front END AS doc_front,
            CASE WHEN LEFT(k.doc_back,11)='data:image/' THEN 'kyc/db/' || k.id::text || '/document-back' ELSE k.doc_back END AS doc_back,
            CASE WHEN LEFT(k.selfie,11)='data:image/' THEN 'kyc/db/' || k.id::text || '/selfie' ELSE k.selfie END AS selfie,
            k.face_match_score, k.liveness_score, k.liveness_report,
            k.status, k.reviewer_note, k.submitted_ip, k.created_at, k.reviewed_at,
            u.email, u.full_name AS account_name
     FROM kyc_submissions k JOIN users u ON u.id = k.user_id
     ${where}
     ORDER BY k.created_at DESC LIMIT 40`,
    params
  );

  return json({
    submissions: rows.map((r) => ({
      id: r.id, userId: r.user_id, email: r.email, accountName: r.account_name,
      country: r.country, docType: r.doc_type, docNumber: r.doc_number, fullName: r.full_name,
      dateOfBirth: r.date_of_birth, address: r.address,
      docFrontPath: privatePath(r.doc_front, r.id, 'document-front'),
      docBackPath: privatePath(r.doc_back, r.id, 'document-back'),
      selfiePath: privatePath(r.selfie, r.id, 'selfie'),
      faceMatchScore: Number(r.face_match_score), livenessScore: Number(r.liveness_score),
      livenessReport: safeJson(r.liveness_report), status: r.status, reviewerNote: r.reviewer_note,
      submittedIp: r.submitted_ip, createdAt: r.created_at, reviewedAt: r.reviewed_at,
    })),
  });
});

function safeJson(v) { try { return JSON.parse(v); } catch { return {}; } }
function privatePath(value, id, part) {
  return value?.startsWith('data:image/') ? `kyc/db/${id}/${part}` : value || '';
}
