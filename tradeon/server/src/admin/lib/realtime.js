/** Preserve the legacy persistent bus; deliver immediately over V2 Socket.io. */
import { sql } from '../../config/db';
import { getRealtimeServer } from '../../sockets/realtime';

let writes = 0;
export async function publish(topic, payload = {}, userId = null) {
  try {
    const result = await sql('INSERT INTO platform_events (topic, user_id, payload) VALUES ($1,$2,$3) RETURNING id', [topic, userId, JSON.stringify(payload ?? {})]);
    const event = { id: Number(result.rows[0].id), topic, payload, scope: userId ? 'user' : 'global', ts: Date.now() };
    const io = getRealtimeServer();
    if (userId) io?.to(`user:${userId}`).emit(`rt:${topic}`, event);
    else io?.to(`rt:${topic}`).emit(`rt:${topic}`, event);
    writes += 1;
    if (writes % 200 === 0) await sql('DELETE FROM platform_events WHERE id < (SELECT COALESCE(MAX(id),0) - $1 FROM platform_events)', [4000]).catch(() => {});
  } catch (err) {
    console.error('[bus] publish failed', topic, err.message);
  }
}
