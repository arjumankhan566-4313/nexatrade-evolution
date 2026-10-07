/**
 * Notification REST routes — ported 1:1 from legacy
 * `src/app/api/notifications/route.js`.
 *
 * The user's own notification record (deposit/withdrawal decisions, KYC
 * reviews, affiliate payouts, trade settlements). The header bell reads this;
 * it must never route to Support — Support stays the sidebar's "Support Chat".
 *
 *   GET    /api/notifications                  — newest 30, newest first
 *   POST   /api/notifications   { ids?: [] }   — mark all (or those) read
 *   DELETE /api/notifications   ?id= / { ids } — dismiss those, else clear all
 */
import { Router, type Request, type Response } from 'express';
import { getSessionUser } from '../lib/auth';
import { many, sql } from '../config/db';

export const notificationsRouter = Router();

async function requireUser(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return user;
}

const serialize = (n: any) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  kind: n.kind,
  isRead: n.is_read,
  createdAt: n.created_at,
});

notificationsRouter.get('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const rows = await many(
    'SELECT id, title, body, kind, is_read, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
    [user.id],
  );
  res.json({ notifications: rows.map(serialize) });
});

notificationsRouter.post('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 200) : null;
  if (ids && ids.length) {
    await sql('UPDATE notifications SET is_read = TRUE WHERE user_id=$1 AND id = ANY($2::text[])', [
      user.id,
      ids,
    ]);
  } else {
    await sql('UPDATE notifications SET is_read = TRUE WHERE user_id=$1', [user.id]);
  }
  res.json({ ok: true });
});

notificationsRouter.delete('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const ids = [
    ...(req.query.id ? [String(req.query.id)] : []),
    ...(Array.isArray(req.body?.ids) ? req.body.ids : []),
  ]
    .map(String)
    .slice(0, 200);

  if (ids.length) {
    await sql('DELETE FROM notifications WHERE user_id=$1 AND id = ANY($2::text[])', [user.id, ids]);
  } else {
    await sql('DELETE FROM notifications WHERE user_id=$1', [user.id]);
  }
  res.json({ ok: true, removed: ids.length || 'all' });
});
