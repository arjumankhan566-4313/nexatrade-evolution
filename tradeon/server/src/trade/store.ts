/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Trade store — ported 1:1 from legacy src/models/Trade.js
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * All database access for the trades table: create, settle, list (open /
 * closed), analytics, leaderboard. Column names are identical to the legacy
 * schema — the `trades` table was NOT modified by the V2 migration.
 *
 * The `users` table column names differ from legacy (V2 renamed them):
 *   legacy  demo_balance / real_balance
 *   V2     balance_demo  / balance_real
 * Debit/credit helpers use the V2 column names.
 */
import { one, many, sql, uuid } from '../config/db';

type Row = Record<string, any>;

export interface TradeRow {
  id: string;
  user_id: string;
  asset_pair: string;
  direction: string;
  amount: number;
  entry_price: number;
  exit_price: number | null;
  payout_rate: number;
  duration_seconds: number;
  status: string;
  is_adjusted: boolean;
  account_type: string;
  result_profit: number | null;
  created_at: string;
  expired_at: string;
  copied_from: string;
}

function map(row: Row | null): TradeRow | null {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    asset_pair: row.symbol ?? row.asset_pair,
    direction: row.direction,
    amount: Number(row.stake ?? row.amount),
    entry_price: Number(row.entry_price),
    exit_price: row.exit_price != null ? Number(row.exit_price) : null,
    payout_rate: Number(row.payout_rate),
    duration_seconds: Number(row.duration_seconds),
    status: row.status,
    is_adjusted: Boolean(row.is_adjusted),
    account_type: row.account_type,
    result_profit: row.profit != null ? Number(row.profit) : (row.result_profit != null ? Number(row.result_profit) : null),
    created_at: row.created_at,
    expired_at: row.expires_at ?? row.expired_at,
    copied_from: row.copied_from || '',
  };
}

export interface CreateTradeInput {
  user_id: string;
  asset_pair: string;
  direction: string;
  amount: number;
  entry_price: number;
  payout_rate: number;
  duration_seconds: number;
  is_adjusted: boolean;
  account_type: string;
  expired_at: string;
}

export async function createTrade(input: CreateTradeInput): Promise<TradeRow> {
  const id = uuid();
  await sql(
    `INSERT INTO trades
       (id, user_id, symbol, direction, stake, entry_price, payout_rate,
        duration_seconds, status, is_adjusted, account_type, created_at, expires_at, copied_from)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,$11,$12,'')`,
    [
      id, input.user_id, input.asset_pair, input.direction,
      Math.round(input.amount * 100) / 100, input.entry_price, input.payout_rate,
      input.duration_seconds, input.is_adjusted ? 1 : 0, input.account_type,
      new Date().toISOString(), input.expired_at,
    ],
  );
  const row = await findById(id);
  return row!;
}

export async function findById(id: string): Promise<TradeRow | null> {
  return map(await one('SELECT * FROM trades WHERE id = $1', [id]));
}

export async function settle(
  id: string,
  data: { exit_price: number; status: string; result_profit: number },
): Promise<TradeRow | null> {
  await sql(
    `UPDATE trades SET exit_price = $1, status = $2, profit = $3
     WHERE id = $4 AND status = 'PENDING'`,
    [data.exit_price, data.status, Math.round(data.result_profit * 100) / 100, id],
  );
  return findById(id);
}

export async function pendingForUser(userId: string): Promise<TradeRow[]> {
  const rows = await many(
    `SELECT * FROM trades WHERE user_id = $1 AND status = 'PENDING' ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => map(r)!) as TradeRow[];
}

export async function closedByUser(userId: string, limit = 100): Promise<TradeRow[]> {
  const rows = await many(
    `SELECT * FROM trades WHERE user_id = $1 AND status != 'PENDING'
     ORDER BY expires_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(1, limit), 500)],
  );
  return rows.map((r) => map(r)!) as TradeRow[];
}

export async function expiredPending(): Promise<TradeRow[]> {
  const rows = await many(
    `SELECT * FROM trades WHERE status = 'PENDING' AND expires_at <= $1`,
    [new Date().toISOString()],
  );
  return rows.map((r) => map(r)!) as TradeRow[];
}

export async function markCopiedFrom(copyId: string, sourceTradeId: string): Promise<void> {
  await sql('UPDATE trades SET copied_from = $1 WHERE id = $2', [sourceTradeId, copyId]);
}

/* ------------------------------------------------------------------ *
 * Balance helpers — atomic debit / credit (V2 column names)
 * ------------------------------------------------------------------ */

export async function debitBalance(
  userId: string,
  accountType: string,
  amount: number,
): Promise<boolean> {
  const col = accountType === 'REAL' ? 'balance_real' : 'balance_demo';
  const res = await sql(
    `UPDATE users SET ${col} = ROUND(${col} - $1, 2) WHERE id = $2 AND ${col} >= $1`,
    [amount, userId],
  );
  return (res.rowCount ?? 0) === 1;
}

export async function creditBalance(
  userId: string,
  accountType: string,
  amount: number,
): Promise<void> {
  const delta = accountType === 'REAL' ? { real: amount, demo: 0 } : { real: 0, demo: amount };
  await sql(
    `UPDATE users SET
       balance_real = ROUND(balance_real + $1, 2),
       balance_demo = ROUND(balance_demo + $2, 2)
     WHERE id = $3`,
    [delta.real, delta.demo, userId],
  );
}

export async function getUserForBalance(userId: string): Promise<{ balance_demo: number; balance_real: number } | null> {
  const row = await one('SELECT balance_demo, balance_real FROM users WHERE id = $1', [userId]);
  if (!row) return null;
  return { balance_demo: Number((row as Row).balance_demo), balance_real: Number((row as Row).balance_real) };
}

/* ------------------------------------------------------------------ *
 * Analytics — ported 1:1 from legacy Trade.analytics()
 * ------------------------------------------------------------------ */

export interface TradeAnalytics {
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
  gross_profit: number;
  net_pnl: number;
  volume: number;
  open_count: number;
  open_volume: number;
  by_type: { account_type: string; total: number; wins: number; net_pnl: number }[];
  daily_pnl: { day: string; pnl: number }[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function analytics(userId: string): Promise<TradeAnalytics> {
  const base = (await one(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'WIN' THEN 1 ELSE 0 END) AS wins,
       SUM(CASE WHEN status = 'LOSS' THEN 1 ELSE 0 END) AS losses,
       COALESCE(SUM(CASE WHEN status = 'WIN' THEN stake * payout_rate / 100.0 ELSE 0 END), 0) AS gross_profit,
       COALESCE(SUM(profit), 0) AS net_pnl,
       COALESCE(SUM(stake), 0) AS volume
     FROM trades WHERE user_id = $1 AND status != 'PENDING'`,
    [userId],
  )) as Row | null;

  const open = (await one(
    `SELECT COUNT(*) AS count, COALESCE(SUM(stake), 0) AS volume
     FROM trades WHERE user_id = $1 AND status = 'PENDING'`,
    [userId],
  )) as Row | null;

  const byType = (await many(
    `SELECT account_type,
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'WIN' THEN 1 ELSE 0 END) AS wins,
       COALESCE(SUM(profit), 0) AS net_pnl
     FROM trades WHERE user_id = $1 AND status != 'PENDING' GROUP BY account_type`,
    [userId],
  )) as Row[];

  const recent = (await many(
    `SELECT TO_CHAR(expires_at, 'YYYY-MM-DD') AS day, COALESCE(SUM(profit), 0) AS pnl
     FROM trades WHERE user_id = $1 AND status != 'PENDING'
     GROUP BY day ORDER BY day DESC LIMIT 14`,
    [userId],
  )) as Row[];

  const total = Number(base?.total || 0);
  const wins = Number(base?.wins || 0);

  return {
    total,
    wins,
    losses: Number(base?.losses || 0),
    win_rate: total ? round2((wins / total) * 100) : 0,
    gross_profit: round2(Number(base?.gross_profit || 0)),
    net_pnl: round2(Number(base?.net_pnl || 0)),
    volume: round2(Number(base?.volume || 0)),
    open_count: Number(open?.count || 0),
    open_volume: round2(Number(open?.volume || 0)),
    by_type: byType.map((r) => ({
      account_type: r.account_type,
      total: Number(r.total),
      wins: Number(r.wins),
      net_pnl: round2(Number(r.net_pnl)),
    })),
    daily_pnl: recent.reverse().map((r) => ({ day: r.day, pnl: round2(Number(r.pnl)) })),
  };
}

export async function leaderboard(limit = 10): Promise<
  { id: string; full_name: string; avatar_color: string; trades: number; profit: number }[]
> {
  const rows = (await many(
    `SELECT u.id, u.full_name,
       COUNT(t.id) AS trades,
       COALESCE(SUM(CASE WHEN t.status = 'WIN' THEN t.stake * t.payout_rate / 100.0 ELSE 0 END), 0) AS profit
     FROM users u
     LEFT JOIN trades t ON t.user_id = u.id AND t.status != 'PENDING'
     WHERE u.role = 'USER'
     GROUP BY u.id ORDER BY profit DESC, trades DESC LIMIT $1`,
    [Math.min(Math.max(1, limit), 100)],
  )) as Row[];
  return rows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    avatar_color: r.avatar_color || '#2A7BF6',
    trades: Number(r.trades),
    profit: round2(Number(r.profit)),
  }));
}

/* ------------------------------------------------------------------ *
 * Copy subscriptions — backed by the shared PostgreSQL `copy_links` table
 * (the legacy Next app's social layer owns it; the old SQLite name was
 * `copy_subscriptions`). `fixed_stake` is surfaced as `amount_per_trade`
 * to keep the V2 copy API contract unchanged.
 * ------------------------------------------------------------------ */

export interface CopySubscription {
  id: string;
  follower_id: string;
  leader_id: string;
  leader_name: string;
  leader_color: string;
  leader_trades: number;
  amount_per_trade: number;
  is_active: boolean;
  created_at: string;
}

export async function copySubscriptionsFor(followerId: string): Promise<CopySubscription[]> {
  const rows = (await many(
    `SELECT cs.*, cs.fixed_stake::float AS amount_per_trade,
       COALESCE(NULLIF(u.alias, ''), u.full_name) AS leader_name,
       (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id AND t.status != 'PENDING') AS leader_trades
     FROM copy_links cs
     JOIN users u ON u.id = cs.leader_id
     WHERE cs.follower_id = $1
     ORDER BY cs.created_at DESC`,
    [followerId],
  )) as Row[];
  return rows.map((r) => ({
    id: r.id,
    follower_id: r.follower_id,
    leader_id: r.leader_id,
    leader_name: r.leader_name,
    // The shared `users` table has no avatar colour column — use the brand default.
    leader_color: '#2A7BF6',
    leader_trades: Number(r.leader_trades),
    amount_per_trade: Number(r.amount_per_trade),
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
  }));
}

export async function upsertCopySubscription(
  followerId: string,
  leaderId: string,
  amount: number,
): Promise<void> {
  const existing = await one(
    'SELECT id FROM copy_links WHERE follower_id = $1 AND leader_id = $2',
    [followerId, leaderId],
  );
  if (existing) {
    await sql(
      'UPDATE copy_links SET fixed_stake = $1, is_active = TRUE WHERE id = $2',
      [amount, (existing as Row).id],
    );
  } else {
    await sql(
      `INSERT INTO copy_links (id, follower_id, leader_id, fixed_stake, is_active, created_at)
       VALUES ($1,$2,$3,$4,TRUE,$5)`,
      [uuid(), followerId, leaderId, amount, new Date().toISOString()],
    );
  }
}

export async function deactivateCopySubscription(followerId: string, leaderId: string): Promise<void> {
  await sql(
    'UPDATE copy_links SET is_active = FALSE WHERE follower_id = $1 AND leader_id = $2',
    [followerId, leaderId],
  );
}

export async function activeCopySubscriptions(leaderId: string): Promise<Row[]> {
  return many('SELECT * FROM copy_links WHERE leader_id = $1 AND is_active = TRUE', [leaderId]);
}
