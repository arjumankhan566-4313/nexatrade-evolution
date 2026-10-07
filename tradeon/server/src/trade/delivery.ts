/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Trade delivery — Socket.io event emission + notification persistence.
 *
 * Ported 1:1 from legacy src/services/websocket.js (emitToUser, pushBalance,
 * notify, emitToAdmins). The legacy SSE/Socket.io helpers are replaced by
 * the V2 Socket.io server (sockets/realtime.ts), but the event names and
 * payload shapes are identical so a client built for the legacy protocol
 * works unchanged.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type { Server as SocketIOServer } from 'socket.io';
import { getRealtimeServer } from '../sockets/realtime';
import { sql, uuid } from '../config/db';

/** Emit to a user's room (legacy: emitToUser). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  const io = getRealtimeServer();
  if (!io) return;
  try {
    io.to(`user:${userId}`).emit(event, payload);
  } catch { /* never break the request */ }
}

/** Emit to all admins (legacy: emitToAdmins). */
export function emitToAdmins(event: string, payload: unknown): void {
  const io = getRealtimeServer();
  if (!io) return;
  try {
    io.to('admins').emit(event, payload);
  } catch { /* never break the request */ }
}

/** Push updated balances to a user (legacy: pushBalance). */
export function pushBalance(userId: string, balanceDemo: number, balanceReal: number): void {
  emitToUser(userId, 'balance', { balance_demo: balanceDemo, balance_real: balanceReal });
}

/**
 * Persist a notification and push it to the user (legacy: notify).
 * The V2 notifications table uses `kind` instead of `type`.
 */
export async function notify(
  userId: string,
  opts: { title: string; body?: string; kind?: string },
): Promise<void> {
  const kind = opts.kind || 'INFO';
  try {
    await sql(
      `INSERT INTO notifications (id, user_id, title, body, kind)
       VALUES ($1,$2,$3,$4,$5)`,
      [uuid(), userId, opts.title, opts.body || '', kind],
    );
  } catch { /* best effort */ }
  emitToUser(userId, 'notification', { title: opts.title, body: opts.body || '', kind, is_read: false });
}
