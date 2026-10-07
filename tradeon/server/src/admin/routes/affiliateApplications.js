/** Direct port of src/app/api/admin/affiliate/applications/route.js; transport imports only. */
import { requireAdmin, json, fail, route, readJson } from '../http';
import { one, many, sql, uuid, withTransaction, getSettings } from '../db';
import { PERMISSIONS } from '../lib/rbac.js';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';


/**
 * GET: List all affiliate applications
 */
export const GET = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.USERS_VIEW);
  if (response) return response;

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'ALL';
  const q = url.searchParams.get('q') || '';

  let query = 'SELECT * FROM affiliate_applications';
  const conditions = [];
  const params = [];

  if (status !== 'ALL') {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const applications = await many(query, params);

  // Get stats
  const stats = await many(`
    SELECT 
      status,
      COUNT(*) as count
    FROM affiliate_applications
    GROUP BY status
  `);

  const statsMap = stats.reduce((acc, s) => {
    acc[s.status] = s.count;
    return acc;
  }, {});

  return json({
    applications: applications.map(app => ({
      id: app.id,
      userId: app.user_id,
      fullName: app.full_name,
      email: app.email,
      phone: app.phone,
      country: app.country,
      experience: app.experience,
      platform: app.platform,
      audienceSize: app.audience_size,
      reason: app.reason,
      status: app.status,
      adminNote: app.admin_note,
      processedBy: app.processed_by,
      createdAt: app.created_at,
      processedAt: app.processed_at
    })),
    stats: {
      total: Object.values(statsMap).reduce((a, b) => a + b, 0),
      pending: statsMap['PENDING'] || 0,
      approved: statsMap['APPROVED'] || 0,
      rejected: statsMap['REJECTED'] || 0
    }
  });
});

/**
 * PATCH: Approve or reject an affiliate application
 */
export const PATCH = route(async (req) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.USERS_EDIT);
  if (response) return response;

  const body = await readJson(req);
  const { applicationId, decision, note } = body;

  if (!applicationId || !decision) {
    return fail('Application ID and decision are required.', 400);
  }

  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return fail('Invalid decision. Must be APPROVED or REJECTED.', 400);
  }

  const application = await one(
    'SELECT * FROM affiliate_applications WHERE id = $1',
    [applicationId]
  );

  if (!application) {
    return fail('Application not found.', 404);
  }

  if (application.status !== 'PENDING') {
    return fail(`Application already ${application.status.toLowerCase()}.`, 400);
  }

  await withTransaction(async (tx) => {
    await tx.lock('affiliate_applications', applicationId);
    const fresh = await tx.one('SELECT status FROM affiliate_applications WHERE id=$1', [applicationId]);
    if (!fresh || fresh.status !== 'PENDING') {
      throw Object.assign(new Error('Application has already been reviewed.'), { status: 409 });
    }
    // Update application status
    await tx.query(
      `UPDATE affiliate_applications 
       SET status = $1, admin_note = $2, processed_by = $3, processed_at = NOW()
       WHERE id = $4`,
      [decision, note || '', admin.id, applicationId]
    );

    // If approved, activate user as affiliate
    if (decision === 'APPROVED') {
      await tx.query(
        'UPDATE users SET affiliate_status = $1, affiliate_applied = TRUE WHERE id = $2',
        ['ACTIVE', application.user_id]
      );

      // Generate referral code if not exists
      const user = await tx.one('SELECT referral_code FROM users WHERE id = $1', [application.user_id]);
      if (!user.referral_code) {
        const code = `NX-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await tx.query('UPDATE users SET referral_code = $1 WHERE id = $2', [code, application.user_id]);
      }

      // Notify user
      await tx.query(
        `INSERT INTO notifications (id, user_id, title, body, kind) 
         VALUES ($1, $2, $3, $4, 'SUCCESS')`,
        [
          uuid(),
          application.user_id,
          'Affiliate Application Approved! 🎉',
          note ? `Your application has been approved. Admin note: ${note}` : 'Congratulations! You are now an affiliate partner. Visit your dashboard to get your referral link.',
        ]
      );
    } else {
      // If rejected, notify user
      await tx.query(
        `INSERT INTO notifications (id, user_id, title, body, kind) 
         VALUES ($1, $2, $3, $4, 'WARNING')`,
        [
          uuid(),
          application.user_id,
          'Affiliate Application Review',
          note ? `Your application has been reviewed. ${note}` : 'Your affiliate application has been reviewed. Please contact support if you have questions.',
        ]
      );
    }
  });

  await logSecurity({
    req,
    userId: admin.id,
    email: admin.email,
    event: 'AFFILIATE_APPLICATION_REVIEWED',
    severity: 'MEDIUM',
    meta: { applicationId, decision, targetUserId: application.user_id }
  });

  // Publish event
  await publish('affiliate_application_update', {
    applicationId,
    userId: application.user_id,
    decision
  }, application.user_id);

  return json({
    ok: true,
    message: `Application ${decision.toLowerCase()} successfully.`
  });
});
