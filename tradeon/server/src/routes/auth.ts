import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { one, sql, uuid } from '../config/db';
import {
  USER_COOKIE,
  clearSessionCookie,
  clientMeta,
  getSessionUser,
  logSecurity,
  recordDevice,
  serializeUser,
  setSessionCookie,
  signToken,
  type UserRow,
} from '../lib/auth';
import { rateLimit } from '../lib/http';
import { generateReferralCode } from '../lib/referral';
import { loginSchema, signupSchema, validate } from '../lib/validation';
import { COUNTRIES } from '../lib/countries';
import { verifyBackupCode, verifyTotp } from '../lib/totp';

/**
 * Auth controllers — ported from the legacy Next.js routes
 * (src/app/api/auth/signup|login|me|logout) with identical business logic,
 * status codes and response shapes, now as standard Express REST endpoints.
 */
export const authRouter = Router();

const COUNTRY_CODES = new Set(COUNTRIES.map((c: { code: string }) => c.code));
const DEMO_BALANCE = 10_000;
// Always compare against a hash so the response time does not leak whether
// the account exists.
const DUMMY_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO1uWcQW1uZ1lBkZ5vJqXqZQZQZQZQZQa';

/* POST /api/auth/register -------------------------------------------- */
authRouter.post('/register', async (req, res) => {
  const { ip } = clientMeta(req);
  if (!rateLimit(`signup:${ip}`, 8, 60_000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
  }

  const rawBody = req.body || {};
  const check = validate(signupSchema, rawBody);
  if (!check.ok) return res.status(check.status).json({ error: check.error, fields: check.fields });
  const { fullName, email, password, country, phone } = check.data;
  const refCode = String(rawBody.refCode || rawBody.ref || rawBody.referralCode || '').trim();

  if (!COUNTRY_CODES.has(country)) {
    // Never spread `check` here — it carries the submitted password.
    return res.status(422).json({
      error: 'Please choose a country we currently support.',
      fields: { country: 'Unsupported country.' },
    });
  }

  const exists = await one('SELECT id FROM users WHERE email = $1', [email]);
  if (exists) {
    return res
      .status(409)
      .json({ error: 'An account with this email already exists.', fields: { email: 'Email already registered.' } });
  }

  let referrerId: string | null = null;
  if (refCode) {
    const refUser = await one(
      'SELECT id FROM users WHERE UPPER(referral_code) = UPPER($1) OR id = $1',
      [refCode]
    );
    if (refUser) referrerId = refUser.id as string;
  }

  const id = uuid();
  const hash = await bcrypt.hash(password, 10);
  const myRefCode = generateReferralCode(email);

  await sql(
    `INSERT INTO users (id, full_name, email, password_hash, phone, country, balance_demo, last_login_at, last_login_ip, referral_code, referred_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10)`,
    [id, fullName, email, hash, phone, country, DEMO_BALANCE, ip, myRefCode, referrerId]
  );

  await sql(`INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,'INFO')`, [
    uuid(),
    id,
    'Welcome to TRADEON',
    `Your demo account is funded with $${DEMO_BALANCE.toLocaleString('en-US')}. Complete KYC to unlock real trading.`,
  ]);

  const row = await one('SELECT * FROM users WHERE id = $1', [id]);
  const token = await signToken({ sub: id, role: (row as any)?.role, tv: (row as any)?.token_version });
  await logSecurity({ req, userId: id, email, event: 'SIGNUP', meta: { country, referredBy: referrerId } });
  await recordDevice(req, id);

  setSessionCookie(res, token);
  return res.status(201).json({ user: serializeUser(row as UserRow) });
});

/* POST /api/auth/login ----------------------------------------------- */
authRouter.post('/login', async (req, res) => {
  const { ip } = clientMeta(req);
  const body = req.body || {};

  const check = validate(loginSchema, body);
  if (!check.ok) return res.status(check.status).json({ error: check.error, fields: check.fields });
  const { email, password } = check.data;

  if (!rateLimit(`login:${ip}:${email}`, 10, 60_000)) {
    await logSecurity({ req, email, event: 'LOGIN_RATE_LIMITED', severity: 'WARNING' });
    return res.status(429).json({ error: 'Too many login attempts. Please wait a minute.' });
  }

  const row = await one('SELECT * FROM users WHERE email = $1', [email]);
  const passwordOk = await bcrypt
    .compare(password, (row as any)?.password_hash || DUMMY_HASH)
    .catch(() => false);

  if (!row || !passwordOk) {
    await logSecurity({ req, email, event: 'LOGIN_FAILED', severity: 'WARNING' });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if ((row as any).is_blocked) {
    await logSecurity({ req, userId: row.id, email, event: 'LOGIN_BLOCKED', severity: 'CRITICAL' });
    return res.status(403).json({ error: 'This account has been suspended. Contact support.' });
  }

  if ((row as any).totp_enabled) {
    const secondFactor = String(body.twoFactorCode || '').trim();
    const backupCodes: unknown[] = Array.isArray((row as any).totp_backup_codes)
      ? (row as any).totp_backup_codes
      : [];
    const backupIndex = backupCodes.findIndex((saved) => verifyBackupCode(saved as string, secondFactor));
    const validSecondFactor = verifyTotp((row as any).totp_secret, secondFactor) || backupIndex >= 0;
    if (!validSecondFactor) {
      await logSecurity({ req, userId: row.id, email, event: 'TWO_FACTOR_FAILED', severity: 'WARNING' });
      return res.status(401).json({
        error: secondFactor
          ? 'The authentication code is incorrect.'
          : 'Enter your authenticator or backup code.',
        requiresTwoFactor: true,
      });
    }
    // A backup code is single-use. Remove it before issuing the session.
    if (backupIndex >= 0) {
      backupCodes.splice(backupIndex, 1);
      await sql('UPDATE users SET totp_backup_codes=$2 WHERE id=$1', [row.id, JSON.stringify(backupCodes)]);
    }
  }

  await sql('UPDATE users SET last_login_at = NOW(), last_login_ip = $2 WHERE id = $1', [row.id, ip]);
  const token = await signToken({ sub: row.id, role: (row as any).role, tv: (row as any).token_version });
  await logSecurity({ req, userId: row.id, email, event: 'LOGIN_SUCCESS' });
  const newDevice = await recordDevice(req, row.id);
  if ((row as any).login_alerts && newDevice) {
    const { device, ip: deviceIp } = clientMeta(req);
    await sql(
      `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,'WARNING')`,
      [
        uuid(),
        row.id,
        'New device sign-in',
        `${device} signed in from ${deviceIp}. If this was not you, change your password and revoke other sessions.`,
      ]
    );
  }

  setSessionCookie(res, token);
  return res
    .status(200)
    .json({ user: serializeUser({ ...(row as UserRow), last_login_at: new Date().toISOString() }) });
});

/* GET /api/auth/me --------------------------------------------------- */
authRouter.get('/me', async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  return res.status(200).json({ user });
});

/* POST /api/auth/logout ---------------------------------------------- */
authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
});

export { USER_COOKIE };
