/** Direct port of src/app/api/admin/tournaments/[id]/route.js; transport imports only. */
import { one, sql, withTransaction } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import { finishTournament, getTournament, standings } from '../lib/tournaments.js';
import { PERMISSIONS } from '../lib/rbac.js';


export const GET = route(async (req, { params }) => {
  const { response } = await requireAdmin(PERMISSIONS.TOURNAMENTS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const tournament = await getTournament(id);
  if (!tournament) return fail('Tournament not found.', 404);
  return json({ tournament, standings: await standings(id, 200) });
});

const FIELDS = {
  name: 'name', description: 'description', entryFee: 'entry_fee', guaranteed: 'guaranteed',
  maxPlayers: 'max_players', startsAt: 'starts_at', endsAt: 'ends_at', status: 'status',
};

/** UPDATE / start / finish / cancel a tournament. */
export const PATCH = route(async (req, { params }) => {
  const { user, response } = await requireAdmin(PERMISSIONS.TOURNAMENTS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const row = await one('SELECT * FROM tournaments WHERE id = $1', [id]);
  if (!row) return fail('Tournament not found.', 404);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'finish') {
    const tournament = await finishTournament(id);
    await logSecurity({ req, userId: user.id, email: user.email, event: 'TOURNAMENT_FINISHED', severity: 'WARNING', meta: { id } });
    return json({ tournament });
  }
  if (body.action === 'cancel') {
    // Claim + refund + close atomically. Repeating a cancellation can never
    // credit entry fees twice.
    const cancelled = await withTransaction(async (tx) => {
      await tx.lock('tournaments', id);
      const current = await tx.one('SELECT * FROM tournaments WHERE id=$1', [id]);
      if (!current || ['CANCELLED', 'FINISHED'].includes(current.status)) return false;
      const col = current.account_type === 'REAL' ? 'balance_real' : 'balance_demo';
      if (Number(current.entry_fee) > 0) {
        await tx.query(
          `UPDATE users SET ${col} = ${col} + $2 WHERE id IN (SELECT user_id FROM tournament_entries WHERE tournament_id = $1)`,
          [id, Number(current.entry_fee)]
        );
      }
      await tx.query(`UPDATE tournaments SET status='CANCELLED', prize_pool=0 WHERE id=$1`, [id]);
      return true;
    });
    if (!cancelled) return fail('This tournament is already closed.', 409);
    await publish('tournaments', { action: 'cancelled', id });
    await logSecurity({ req, userId: user.id, email: user.email, event: 'TOURNAMENT_CANCELLED', severity: 'CRITICAL', meta: { id } });
    return json({ tournament: await getTournament(id) });
  }

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELDS)) {
    if (body[key] === undefined) continue;
    let v = body[key];
    if (['entryFee', 'guaranteed', 'maxPlayers'].includes(key)) v = Math.max(0, Number(v) || 0);
    if (['startsAt', 'endsAt'].includes(key)) v = new Date(v);
    values.push(v);
    sets.push(`${column} = $${values.length}`);
  }
  if (body.prizeSplit) {
    values.push(JSON.stringify(body.prizeSplit.map(Number)));
    sets.push(`prize_split = $${values.length}`);
  }
  if (!sets.length) return fail('Nothing to update.');
  values.push(id);
  await sql(`UPDATE tournaments SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  await publish('tournaments', { action: 'updated', id });
  await logSecurity({ req, userId: user.id, email: user.email, event: 'TOURNAMENT_UPDATED', severity: 'INFO', meta: { id, body } });
  return json({ tournament: await getTournament(id) });
});

/** DELETE a tournament (entries cascade; fees are refunded first). */
export const DELETE = route(async (req, { params }) => {
  const { user, response } = await requireAdmin(PERMISSIONS.TOURNAMENTS_MANAGE);
  if (response) return response;
  const { id } = await params;
  const row = await one('SELECT * FROM tournaments WHERE id = $1', [id]);
  if (!row) return fail('Tournament not found.', 404);

  await withTransaction(async (tx) => {
    await tx.lock('tournaments', id);
    const current = await tx.one('SELECT * FROM tournaments WHERE id=$1', [id]);
    if (!current) throw Object.assign(new Error('Tournament not found.'), { status: 404 });
    // CANCELLED rows were already refunded and have a zero pool.
    if (Number(current.entry_fee) > 0 && ['SCHEDULED', 'LIVE'].includes(current.status)) {
      const col = current.account_type === 'REAL' ? 'balance_real' : 'balance_demo';
      await tx.query(
        `UPDATE users SET ${col} = ${col} + $2 WHERE id IN (SELECT user_id FROM tournament_entries WHERE tournament_id = $1)`,
        [id, Number(current.entry_fee)]
      );
    }
    await tx.query('DELETE FROM tournaments WHERE id = $1', [id]);
  });
  await logSecurity({ req, userId: user.id, email: user.email, event: 'TOURNAMENT_DELETED', severity: 'CRITICAL', meta: { id } });
  await publish('tournaments', { action: 'deleted', id });
  return json({ ok: true, id });
});
