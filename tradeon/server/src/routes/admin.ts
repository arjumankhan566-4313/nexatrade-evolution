/** Admin authentication and existing supplemental endpoints.
 * Portal business controllers live in adminPortal.ts (direct legacy ports).
 */
import { Router } from 'express';
import type { CookieOptions, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { one, many, sql, uuid } from '../config/db';
import {
  signToken, verifyToken, serializeUser, clientMeta, logSecurity,
  recordDevice, isStaff, type UserRow,
} from '../lib/auth';
import { requireAdmin, PERMISSIONS, permissionsFor } from '../lib/rbac';
import { rateLimit } from '../lib/http';
import { loginSchema, validate } from '../lib/validation';
import { verifyBackupCode, verifyTotp } from '../lib/totp';
import { emitToAdmins, pushBalance, notify } from '../trade/delivery';

export const adminRouter = Router();

/* ════════════════════ Admin session (separate cookie) ════════════════════
 * Legacy used ADMIN_COOKIE (1-day expiry, separate from the 7-day user
 * session). We replicate that here — the admin panel has its own auth.
 */
const ADMIN_COOKIE = 'nexa_admin';
const ADMIN_DAYS = 1;
const DUMMY_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO1uWcQW1uZ1lBkZ5vJqXqZQZQZQZQZQa';

function adminCookieOptions(): CookieOptions {
  const embedded = process.env.NODE_ENV !== 'production' && process.env.PREVIEW_EMBED === '1';
  return {
    httpOnly: true,
    sameSite: embedded ? 'none' : 'lax',
    secure: embedded || process.env.NODE_ENV === 'production',
    ...(embedded ? { partitioned: true } : {}),
    path: '/',
    // Express uses milliseconds (the legacy cookie API used seconds).
    maxAge: ADMIN_DAYS * 24 * 60 * 60 * 1000,
  } as CookieOptions;
}

async function getAdminSessionUser(req: Request) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.cookies?.[ADMIN_COOKIE] || bearer || null;
  const payload = await verifyToken(token);
  if (!payload?.sub) return null;
  const row = await one(
    `SELECT id, full_name, email, phone, country, role, balance_real, balance_demo,
     kyc_status, custom_yield_ratio, force_loss_user, is_blocked, last_login_at, created_at,
     token_version, totp_enabled FROM users WHERE id = $1`,
    [payload.sub],
  );
  if (!row) return null;
  if (Number(payload.tv || 0) !== Number((row as any).token_version)) return null;
  if ((row as any).is_blocked) return null;
  if (!isStaff((row as any).role)) return null;
  return serializeUser(row as UserRow);
}

/* POST /api/admin/login — staff-only auth, sets ADMIN_COOKIE ────────────── */
adminRouter.post('/login', async (req: Request, res: Response) => {
  const { ip } = clientMeta(req);
  if (!rateLimit(`admin-login:${ip}`, 6, 60_000)) {
    await logSecurity({ req, event: 'ADMIN_LOGIN_RATE_LIMITED', severity: 'CRITICAL' });
    return res.status(429).json({ error: 'Too many attempts. Locked for a minute.' });
  }

  const body = req.body || {};
  const check = validate(loginSchema, body);
  if (!check.ok) return res.status(check.status).json({ error: check.error, fields: check.fields });
  const { email, password } = check.data;

  const row = await one('SELECT * FROM users WHERE email = $1', [email]);
  const passwordOk = await bcrypt
    .compare(password, (row as any)?.password_hash || DUMMY_HASH)
    .catch(() => false);
  const ok = Boolean(row && isStaff((row as any).role) && passwordOk);
  if (!row || !ok) {
    await logSecurity({ req, email, event: 'ADMIN_LOGIN_FAILED', severity: 'CRITICAL' });
    return res.status(401).json({ error: 'Invalid administrator credentials.' });
  }
  if ((row as any).is_blocked) {
    return res.status(403).json({ error: 'This administrator account is disabled.' });
  }

  // 2FA — same TOTP / backup-code flow as the user login.
  if ((row as any).totp_enabled) {
    const secondFactor = String(body.twoFactorCode || '').trim();
    const backupCodes: unknown[] = Array.isArray((row as any).totp_backup_codes)
      ? (row as any).totp_backup_codes : [];
    const backupIndex = backupCodes.findIndex((saved) => verifyBackupCode(saved as string, secondFactor));
    if (!verifyTotp((row as any).totp_secret, secondFactor) && backupIndex < 0) {
      await logSecurity({ req, userId: row.id, email, event: 'ADMIN_TWO_FACTOR_FAILED', severity: 'CRITICAL' });
      return res.status(401).json({
        error: secondFactor ? 'The authentication code is incorrect.' : 'Enter your authenticator or backup code.',
        requiresTwoFactor: true,
      });
    }
    if (backupIndex >= 0) {
      backupCodes.splice(backupIndex, 1);
      await sql('UPDATE users SET totp_backup_codes=$2 WHERE id=$1', [row.id, JSON.stringify(backupCodes)]);
    }
  }

  await sql('UPDATE users SET last_login_at=NOW(), last_login_ip=$2 WHERE id=$1', [row.id, ip]);
  const token = await signToken({ sub: row.id, role: (row as any).role, tv: (row as any).token_version }, ADMIN_DAYS);
  await logSecurity({ req, userId: row.id, email, event: 'ADMIN_LOGIN_SUCCESS' });
  await recordDevice(req, row.id);

  const me = serializeUser(row as UserRow);
  (me as any).permissions = [...permissionsFor((row as any).role)];

  res.cookie(ADMIN_COOKIE, token, adminCookieOptions());
  return res.status(200).json({ user: me });
});

/* POST /api/admin/logout — clears ADMIN_COOKIE ──────────────────────────── */
adminRouter.post('/logout', (_req: Request, res: Response) => {
  res.cookie(ADMIN_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 });
  return res.status(200).json({ ok: true });
});

/* GET /api/admin/me — verify admin session ──────────────────────────────── */
adminRouter.get('/me', async (req: Request, res: Response) => {
  const user = await getAdminSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Admin authentication required.' });
  const me = { ...user, permissions: [...permissionsFor(user.role)] };
  return res.status(200).json({ user: me });
});

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/* ── Schema migrations: add missing columns + tables ─────────────────── */
let schemaReady = false;
async function ensureAdminSchema() {
  if (schemaReady) return;
  schemaReady = true;
  try {
    // Add legacy-matching columns to system_settings (non-destructive)
    const cols: [string, string][] = [
      ['execution_mode', "TEXT NOT NULL DEFAULT 'SIMULATION'"],
      ['global_probability_rate', 'NUMERIC NOT NULL DEFAULT 30'],
      ['enable_circuit_breaker', 'BOOLEAN NOT NULL DEFAULT false'],
      ['circuit_breaker_factor', 'NUMERIC NOT NULL DEFAULT 0.5'],
      ['spread_percentage', 'NUMERIC NOT NULL DEFAULT 0.05'],
      ['slippage_percentage', 'NUMERIC NOT NULL DEFAULT 0.03'],
      ['market_data_source', "TEXT NOT NULL DEFAULT 'SYNTHETIC'"],
      ['force_loss_mode', 'BOOLEAN NOT NULL DEFAULT false'],
      ['referral_bonus', 'NUMERIC NOT NULL DEFAULT 5'],
      ['cashback_percentage', 'NUMERIC NOT NULL DEFAULT 0'],
      ['gateways', "JSONB NOT NULL DEFAULT '{}'"],
    ];
    for (const [col, def] of cols) {
      await sql(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    }

    // Add base_price / volatility / feed_type to markets (non-destructive)
    await sql(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 100`);
    await sql(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS volatility NUMERIC DEFAULT 1`);
    await sql(`ALTER TABLE markets ADD COLUMN IF NOT EXISTS feed_type TEXT DEFAULT 'SYNTHETIC'`);

    // Create missing tables
    await sql(`CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      bonus_type TEXT NOT NULL DEFAULT 'DEMO',
      amount NUMERIC NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 100,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT now()::text
    )`);

    await sql(`CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT now()::text,
      updated_at TEXT NOT NULL DEFAULT now()::text
    )`);

    await sql(`CREATE TABLE IF NOT EXISTS ticket_replies (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT now()::text
    )`);
  } catch (err) {
    console.warn('[admin] schema migration warning:', (err as Error)?.message);
  }
}

/* ── Helper: public user view for admin (legacy User.publicView) ──── */
async function publicUserRow(id: string) {
  return one(
    `SELECT u.id, u.full_name, u.email, u.phone, u.country, u.role,
       u.balance_real, u.balance_demo, u.kyc_status, u.custom_yield_ratio,
       u.force_loss_user, u.is_blocked, u.created_at, u.referral_code,
       (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS total_trades,
       (SELECT COALESCE(SUM(t.profit),0) FROM trades t WHERE t.user_id = u.id AND t.status != 'PENDING') AS net_pnl
     FROM users u WHERE u.id = $1`,
    [id],
  );
}

function publicView(u: any) {
  if (!u) return null;
  return {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    phone: u.phone,
    country: u.country,
    role: u.role,
    avatar_color: '#2A7BF6',
    demo_balance: round2(u.balance_demo),
    real_balance: round2(u.balance_real),
    kyc_status: u.kyc_status,
    custom_yield_ratio: u.custom_yield_ratio === null || u.custom_yield_ratio === undefined ? null : Number(u.custom_yield_ratio),
    force_loss_user: Boolean(u.force_loss_user),
    is_blocked: Boolean(u.is_blocked),
    created_at: u.created_at,
    referral_code: u.referral_code,
    total_trades: u.total_trades ?? 0,
    net_pnl: round2(u.net_pnl ?? 0),
  };
}

/* ════════════════════ System monitoring ════════════════════ */

adminRouter.get('/stats', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.RISK_MANAGE);
  if (!user) return;
  await ensureAdminSchema();

  try {
    const users = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE role != 'ADMIN'`);
    const openTrades = await one<{ c: number; vol: number }>(`SELECT COUNT(*) AS c, COALESCE(SUM(stake),0) AS vol FROM trades WHERE status='PENDING'`);
    const exposure = await one<{ long_vol: number; short_vol: number }>(`SELECT
      COALESCE(SUM(CASE WHEN direction='CALL' THEN stake ELSE 0 END),0) AS long_vol,
      COALESCE(SUM(CASE WHEN direction='PUT' THEN stake ELSE 0 END),0) AS short_vol
      FROM trades WHERE status='PENDING'`);
    const today = new Date().toISOString().slice(0, 10);
    const todayVol = await one<{ c: number; vol: number }>(`SELECT COUNT(*) AS c, COALESCE(SUM(stake),0) AS vol FROM trades WHERE DATE(created_at)=$1`, [today]);
    const housePnl = await one<{ s: number }>(`SELECT COALESCE(SUM(-profit),0) AS s FROM trades WHERE status != 'PENDING'`);
    const recent = await many(`SELECT t.*, u.full_name, u.email FROM trades t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 15`);
    const pendingTx = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM transactions WHERE status='PENDING'`);
    const pendingKyc = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM users WHERE kyc_status='PENDING'`);
    const totalBalances = await one<{ s: number }>(`SELECT COALESCE(SUM(balance_real),0) AS s FROM users`);
    const txDeposits = await one<{ s: number }>(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='DEPOSIT' AND status='APPROVED'`);
    const txWithdrawals = await one<{ s: number }>(`SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='WITHDRAWAL' AND status='APPROVED'`);
    const leaderboard = await many(`SELECT u.id, u.full_name, u.email,
      COUNT(t.id) AS trades, COALESCE(SUM(t.profit),0) AS pnl
      FROM users u JOIN trades t ON t.user_id=u.id WHERE t.status!='PENDING'
      GROUP BY u.id ORDER BY pnl DESC LIMIT 5`);

    res.json({
      stats: {
        users: Number(users?.c ?? 0),
        online: 0,
        open_trades: Number(openTrades?.c ?? 0),
        open_volume: round2(openTrades?.vol ?? 0),
        long_volume: round2(exposure?.long_vol ?? 0),
        short_volume: round2(exposure?.short_vol ?? 0),
        today_trades: Number(todayVol?.c ?? 0),
        today_volume: round2(todayVol?.vol ?? 0),
        house_pnl: round2(housePnl?.s ?? 0),
        pending_tx: Number(pendingTx?.c ?? 0),
        pending_kyc: Number(pendingKyc?.c ?? 0),
        total_balances: round2(totalBalances?.s ?? 0),
        transactions: {
          deposits: round2(txDeposits?.s ?? 0),
          withdrawals: round2(txWithdrawals?.s ?? 0),
        },
      },
      recent_trades: (recent as any[]).map((t) => ({
        ...t,
        amount: round2(t.stake),
        asset_pair: t.symbol,
        full_name: t.full_name,
      })),
      leaderboard: (leaderboard as any[]).map((l) => ({
        id: l.id,
        full_name: l.full_name,
        email: l.email,
        trades: Number(l.trades),
        pnl: round2(l.pnl),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ════════════════════ Support tickets ════════════════════ */

adminRouter.get('/tickets', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.USERS_VIEW);
  if (!user) return;
  await ensureAdminSchema();

  try {
    const status = ['OPEN', 'ANSWERED', 'CLOSED'].includes(String(req.query.status)) ? String(req.query.status) : null;
    let queryText = `SELECT t.*, u.full_name, u.email FROM tickets t JOIN users u ON u.id = t.user_id`;
    const params: unknown[] = [];
    if (status) { queryText += ` WHERE t.status = $1`; params.push(status); }
    queryText += ` ORDER BY t.updated_at DESC LIMIT 200`;
    const rows = await many(queryText, params);

    const enriched = await Promise.all((rows as any[]).map(async (t) => {
      const rc = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM ticket_replies WHERE ticket_id = $1`, [t.id]);
      return { ...t, reply_count: Number(rc?.c ?? 0) };
    }));

    const openC = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'OPEN'`);
    const answeredC = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'ANSWERED'`);
    const closedC = await one<{ c: number }>(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'CLOSED'`);

    res.json({
      tickets: enriched,
      counts: {
        open: Number(openC?.c ?? 0),
        answered: Number(answeredC?.c ?? 0),
        closed: Number(closedC?.c ?? 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

adminRouter.get('/tickets/:id', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.USERS_VIEW);
  if (!user) return;

  try {
    const t = await one(`SELECT t.*, u.full_name, u.email FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = $1`, [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const replies = await many(`SELECT * FROM ticket_replies WHERE ticket_id = $1 ORDER BY created_at ASC`, [req.params.id]);
    res.json({ ticket: t, replies });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

adminRouter.post('/tickets/:id/reply', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.USERS_VIEW);
  if (!user) return;

  try {
    const t = await one<{ id: string; user_id: string; subject: string }>(`SELECT * FROM tickets WHERE id = $1`, [req.params.id]);
    if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    const { message, close } = req.body || {};
    if (message && String(message).trim().length >= 2) {
      await sql(
        `INSERT INTO ticket_replies (id, ticket_id, sender_id, is_admin, message, created_at) VALUES ($1, $2, $3, true, $4, $5)`,
        [uuid(), t.id, user.id, String(message).trim().slice(0, 2000), new Date().toISOString()],
      );
      await sql(`UPDATE tickets SET status = 'ANSWERED', updated_at = $1 WHERE id = $2`, [new Date().toISOString(), t.id]);
      void notify(t.user_id, { title: 'Support replied 🎧', body: `New reply on "${t.subject}".`, kind: 'WIN' });
    }
    if (close) {
      await sql(`UPDATE tickets SET status = 'CLOSED', updated_at = $1 WHERE id = $2`, [new Date().toISOString(), t.id]);
      void notify(t.user_id, { title: 'Ticket closed', body: `"${t.subject}" was closed by support.`, kind: 'INFO' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ════════════════════ Promo codes ════════════════════ */

adminRouter.get('/promos', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.SETTINGS_MANAGE);
  if (!user) return;
  await ensureAdminSchema();

  try {
    const promos = await many(`SELECT * FROM promo_codes ORDER BY created_at DESC`);
    res.json({ promos: (promos as any[]).map((p) => ({ ...p, is_active: Boolean(p.is_active) })) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

adminRouter.post('/promos', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.SETTINGS_MANAGE);
  if (!user) return;
  await ensureAdminSchema();

  try {
    const { code, bonus_type, amount, max_uses, expires_at } = req.body || {};
    const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 3) return res.status(400).json({ error: 'Code must be at least 3 letters/numbers.' });
    const existing = await one(`SELECT id FROM promo_codes WHERE code = $1`, [clean]);
    if (existing) return res.status(409).json({ error: 'Code already exists.' });
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 10000) return res.status(400).json({ error: 'Amount must be $0.01-$10,000.' });
    await sql(
      `INSERT INTO promo_codes (id, code, bonus_type, amount, max_uses, used_count, is_active, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, true, $6, $7)`,
      [uuid(), clean, bonus_type === 'REAL' ? 'REAL' : 'DEMO', amt, Math.max(1, parseInt(max_uses, 10) || 100), expires_at || null, new Date().toISOString()],
    );
    const promo = await one(`SELECT * FROM promo_codes WHERE code = $1`, [clean]);
    res.json({ promo: { ...promo, is_active: Boolean((promo as any)?.is_active) } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

adminRouter.put('/promos/:id', async (req: Request, res: Response) => {
  const user = await requireAdmin(req, res, PERMISSIONS.SETTINGS_MANAGE);
  if (!user) return;

  try {
    const promo = await one(`SELECT * FROM promo_codes WHERE id = $1`, [req.params.id]);
    if (!promo) return res.status(404).json({ error: 'Promo not found.' });
    const b = req.body || {};
    if (b.is_active !== undefined) {
      await sql(`UPDATE promo_codes SET is_active = $1 WHERE id = $2`, [!!b.is_active, req.params.id]);
    }
    if (b.max_uses !== undefined) {
      await sql(`UPDATE promo_codes SET max_uses = $1 WHERE id = $2`, [Math.max(1, parseInt(b.max_uses, 10) || 100), req.params.id]);
    }
    const fresh = await one(`SELECT * FROM promo_codes WHERE id = $1`, [req.params.id]);
    res.json({ promo: { ...fresh, is_active: Boolean((fresh as any)?.is_active) } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
