/** Direct port of src/app/api/admin/logs/route.js; transport imports only. */
import { many, sql, one } from '../db';
import { requireAdmin, json, route } from '../http';
import { logSecurity } from '../http';
import { PERMISSIONS } from '../lib/rbac.js';


export const GET = route(async (req) => {
  const { response } = await requireAdmin(PERMISSIONS.LOGS_VIEW);
  if (response) return response;
  const url = new URL(req.url);
  const severity = (url.searchParams.get('severity') || 'ALL').toUpperCase();
  const limit = Math.min(Number(url.searchParams.get('limit') || 120), 500);

  const rows = severity === 'ALL'
    ? await many('SELECT * FROM security_logs ORDER BY created_at DESC LIMIT $1', [limit])
    : await many('SELECT * FROM security_logs WHERE severity=$1 ORDER BY created_at DESC LIMIT $2', [severity, limit]);

  return json({
    logs: rows.map((l) => ({
      id: l.id, userId: l.user_id, email: l.email, event: l.event, severity: l.severity,
      ip: l.ip, device: l.device, userAgent: l.user_agent, meta: safe(l.meta), createdAt: l.created_at,
    })),
  });
});

/**
 * DELETE — purge log history.
 *   ?olderThanDays=30  keep the last 30 days   (default)
 *   ?all=1             wipe everything
 *   ?severity=INFO     restrict the purge to one severity
 */
export const DELETE = route(async (req) => {
  const { user, response } = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  if (response) return response;
  const url = new URL(req.url);
  const all = url.searchParams.get('all') === '1';
  const days = Math.max(0, Number(url.searchParams.get('olderThanDays') || 30));
  const severity = (url.searchParams.get('severity') || '').toUpperCase();

  const where = [];
  const values = [];
  if (!all) {
    values.push(String(days));
    where.push(`created_at < NOW() - ($${values.length} || ' days')::INTERVAL`);
  }
  if (severity && severity !== 'ALL') {
    values.push(severity);
    where.push(`severity = $${values.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const before = await one('SELECT COUNT(*)::int AS n FROM security_logs');
  await sql(`DELETE FROM security_logs ${clause}`, values);
  const after = await one('SELECT COUNT(*)::int AS n FROM security_logs');
  const removed = Number(before.n) - Number(after.n);

  await logSecurity({ req, userId: user.id, email: user.email, event: 'LOGS_PURGED', severity: 'WARNING', meta: { removed, all, days, severity } });
  return json({ ok: true, removed, remaining: Number(after.n) });
});

function safe(v) { try { return JSON.parse(v); } catch { return {}; } }
