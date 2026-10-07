/** Direct port: src/lib/tournaments.js. */
/**
 * Trading tournaments (Module 3.2).
 *
 * A tournament is a time-boxed contest: players pay an entry fee (which feeds
 * the prize pool on top of any guaranteed amount) and are ranked by the P&L of
 * the trades they place while it is live. Finishing pays the pool out
 * according to `prize_split` and credits the winners' balances.
 */
import { many, one, sql, uuid, money, withTransaction } from '../db';
import { publish } from './realtime';

export function serializeTournament(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    entryFee: Number(r.entry_fee),
    prizePool: Number(r.prize_pool),
    guaranteed: Number(r.guaranteed),
    accountType: r.account_type,
    status: r.status,
    prizeSplit: parseSplit(r.prize_split),
    maxPlayers: Number(r.max_players),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    players: r.players === undefined ? undefined : Number(r.players),
    joined: r.joined === undefined ? undefined : Boolean(r.joined),
    myRank: r.my_rank === undefined || r.my_rank === null ? null : Number(r.my_rank),
    createdAt: r.created_at,
  };
}

function maskPublicName(name = '') {
  const parts = String(name).trim().split(/\s+/);
  if (!parts[0]) return 'Trader';
  return `${parts[0]}${parts.length > 1 ? ` ${parts.at(-1)[0]}.` : ''}`;
}

function parseSplit(text) {
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) && arr.length ? arr.map(Number) : [50, 30, 20];
  } catch {
    return [50, 30, 20];
  }
}

/** Move SCHEDULED → LIVE → FINISHED based on the clock (idempotent). */
export async function syncTournamentStates() {
  const started = await many(
    `UPDATE tournaments SET status = 'LIVE'
      WHERE status = 'SCHEDULED' AND starts_at <= NOW() AND ends_at > NOW() RETURNING id, name`
  );
  for (const t of started) await publish('tournaments', { action: 'started', id: t.id, name: t.name });

  const ending = await many(`SELECT id FROM tournaments WHERE status = 'LIVE' AND ends_at <= NOW()`);
  for (const t of ending) await finishTournament(t.id);
  return { started: started.length, finished: ending.length };
}

export async function listTournaments({ userId = null, status = null } = {}) {
  await syncTournamentStates().catch(() => {});
  const rows = await many(
    `SELECT t.*,
            (SELECT COUNT(*)::int FROM tournament_entries e WHERE e.tournament_id = t.id) AS players,
            ($2::text IS NOT NULL AND EXISTS (
               SELECT 1 FROM tournament_entries e WHERE e.tournament_id = t.id AND e.user_id = $2)) AS joined
       FROM tournaments t
      WHERE ($1::text IS NULL OR t.status = $1)
      ORDER BY CASE t.status WHEN 'LIVE' THEN 0 WHEN 'SCHEDULED' THEN 1 ELSE 2 END, t.starts_at DESC
      LIMIT 40`,
    [status, userId]
  );
  return rows.map(serializeTournament);
}

export async function getTournament(id) {
  const row = await one(
    `SELECT t.*, (SELECT COUNT(*)::int FROM tournament_entries e WHERE e.tournament_id = t.id) AS players
       FROM tournaments t WHERE t.id = $1`,
    [id]
  );
  return row ? serializeTournament(row) : null;
}

/** Live standings, recomputed from the trades placed inside the window. */
export async function standings(tournamentId, limit = 50) {
  const t = await one('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
  if (!t) return [];

  const rows = await many(
    `SELECT e.user_id, u.full_name, u.alias, u.country, u.vip_tier,
            COALESCE(SUM(tr.profit),0)                            AS pnl,
            COALESCE(SUM(tr.stake),0)                             AS volume,
            COUNT(tr.id)::int                                     AS trades,
            COUNT(tr.id) FILTER (WHERE tr.status = 'WON')::int    AS wins,
            e.prize, e.final_rank
       FROM tournament_entries e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN trades tr
              ON tr.user_id = e.user_id
             AND tr.status IN ('WON','LOST')
             AND tr.account_type = $2
             AND tr.created_at >= GREATEST(e.joined_at, $3::timestamptz)
             AND tr.created_at <= $4::timestamptz
      WHERE e.tournament_id = $1
      GROUP BY e.user_id, u.full_name, u.alias, u.country, u.vip_tier, e.prize, e.final_rank
      ORDER BY COALESCE(SUM(tr.profit),0) DESC, COUNT(tr.id) ASC
      LIMIT $5`,
    [tournamentId, t.account_type, t.starts_at, t.ends_at, limit]
  );

  return rows.map((r, i) => ({
    rank: r.final_rank ? Number(r.final_rank) : i + 1,
    userId: r.user_id,
    name: r.alias || maskPublicName(r.full_name),
    country: r.country,
    tier: r.vip_tier,
    pnl: Number(r.pnl),
    volume: Number(r.volume),
    trades: Number(r.trades),
    wins: Number(r.wins),
    winRate: Number(r.trades) ? Math.round((Number(r.wins) / Number(r.trades)) * 1000) / 10 : 0,
    prize: Number(r.prize),
  }));
}

/** Join a tournament — debits the entry fee and grows the prize pool. */
export async function joinTournament({ tournamentId, user }) {
  await syncTournamentStates().catch(() => {});
  const joined = await withTransaction(async (tx) => {
    await tx.lock('tournaments', tournamentId);
    const t = await tx.one('SELECT * FROM tournaments WHERE id = $1', [tournamentId]);
    if (!t) throw new Error('Tournament not found.');
    if (!['SCHEDULED', 'LIVE'].includes(t.status)) throw new Error('Registration for this tournament is closed.');

    const already = await tx.one('SELECT id FROM tournament_entries WHERE tournament_id = $1 AND user_id = $2', [tournamentId, user.id]);
    if (already) throw new Error('You have already joined this tournament.');
    if (Number(t.max_players) > 0) {
      const count = await tx.one('SELECT COUNT(*)::int AS n FROM tournament_entries WHERE tournament_id = $1', [tournamentId]);
      if (Number(count.n) >= Number(t.max_players)) throw new Error('This tournament is full.');
    }

    const fee = money(t.entry_fee);
    const col = t.account_type === 'REAL' ? 'balance_real' : 'balance_demo';
    if (fee > 0) {
      await tx.lock('users', user.id);
      const debited = await tx.one(
        `UPDATE users SET ${col} = ${col} - $1 WHERE id = $2 AND ${col} >= $1 RETURNING ${col} AS balance`,
        [fee, user.id]
      );
      if (!debited) throw new Error(`Insufficient ${t.account_type.toLowerCase()} balance for the entry fee.`);
      await tx.query('UPDATE tournaments SET prize_pool = prize_pool + $2 WHERE id = $1', [tournamentId, fee]);
    }
    await tx.query('INSERT INTO tournament_entries (id, tournament_id, user_id) VALUES ($1,$2,$3)', [uuid(), tournamentId, user.id]);
    return { fee, accountType: t.account_type };
  });

  if (joined.fee > 0) await publish('balance', { reason: 'TOURNAMENT_ENTRY', amount: -joined.fee, accountType: joined.accountType }, user.id);
  await publish('tournaments', { action: 'joined', id: tournamentId });
  return getTournament(tournamentId);
}

/** Settle a tournament: rank players, pay the pool, notify everybody. */
export async function finishTournament(tournamentId) {
  const claimed = await one(
    `UPDATE tournaments SET status = 'FINISHED'
      WHERE id = $1 AND status <> 'FINISHED' RETURNING *`,
    [tournamentId]
  );
  if (!claimed) return null;

  const board = await standings(tournamentId, 200);
  const split = parseSplit(claimed.prize_split);
  const pool = money(Number(claimed.prize_pool) + Number(claimed.guaranteed));
  const col = claimed.account_type === 'REAL' ? 'balance_real' : 'balance_demo';

  for (let i = 0; i < board.length; i += 1) {
    const row = board[i];
    const share = split[i] ? money((pool * Number(split[i])) / 100) : 0;
    await sql(
      `UPDATE tournament_entries SET pnl = $3, trades = $4, wins = $5, volume = $6, prize = $7, final_rank = $8
        WHERE tournament_id = $1 AND user_id = $2`,
      [tournamentId, row.userId, row.pnl, row.trades, row.wins, row.volume, share, i + 1]
    );
    if (share > 0) {
      await sql(`UPDATE users SET ${col} = ${col} + $2 WHERE id = $1`, [row.userId, share]);
      await sql(
        `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,'SUCCESS')`,
        [uuid(), row.userId, `Tournament prize · $${share.toFixed(2)}`, `${claimed.name} — you finished #${i + 1}.`]
      );
      await publish('balance', { reason: 'TOURNAMENT_PRIZE', amount: share }, row.userId);
    }
  }

  await publish('tournaments', { action: 'finished', id: tournamentId, name: claimed.name, pool });
  return getTournament(tournamentId);
}

/** Admin create. */
export async function createTournament(input) {
  const id = uuid();
  const starts = input.startsAt ? new Date(input.startsAt) : new Date();
  const ends = input.endsAt ? new Date(input.endsAt) : new Date(starts.getTime() + 7 * 864e5);
  await sql(
    // prize_pool accumulates entry fees only; `guaranteed` is added on top when
    // the pool is displayed and paid out, so nothing is ever double-counted.
    `INSERT INTO tournaments (id, name, description, entry_fee, guaranteed, prize_pool, account_type,
       status, prize_split, max_players, starts_at, ends_at)
     VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      String(input.name || 'TRADEON Cup').slice(0, 80),
      String(input.description || '').slice(0, 400),
      money(input.entryFee || 0),
      money(input.guaranteed || 0),
      input.accountType === 'REAL' ? 'REAL' : 'DEMO',
      starts <= new Date() ? 'LIVE' : 'SCHEDULED',
      JSON.stringify(Array.isArray(input.prizeSplit) && input.prizeSplit.length ? input.prizeSplit.map(Number) : [50, 30, 20]),
      Math.max(0, Number(input.maxPlayers) || 0),
      starts,
      ends,
    ]
  );
  await publish('tournaments', { action: 'created', id });
  return getTournament(id);
}
