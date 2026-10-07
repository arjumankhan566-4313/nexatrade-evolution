import { SignJWT, jwtVerify } from 'jose';
import type { CookieOptions, Request, Response } from 'express';
import { one, sql, uuid } from '../config/db';
import { env } from '../config/env';

/**
 * Authentication: JWT (HS256, jose) stored in HTTP-only cookies.
 * Ported from the legacy src/lib/auth.js — token claims, cookie names, the
 * serializeUser shape and the token_version revocation rule are identical,
 * so sessions issued by either system work against the same `users` table.
 */
export const USER_COOKIE = 'nexa_session';
export const ADMIN_COOKIE = 'nexa_admin';
const SESSION_DAYS = 7;
export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR'];

export function isStaff(role: unknown): boolean {
  return STAFF_ROLES.includes(role as never);
}

function secretKey() {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 32) {
    // Development keeps a stable local key; production fails closed so a
    // broken deployment can never silently weaken authentication.
    if (env.nodeEnv === 'production') {
      throw new Error('JWT_SECRET must be configured with at least 32 characters.');
    }
    return new TextEncoder().encode('nexatrade-development-secret-key-please-change-me');
  }
  return new TextEncoder().encode(raw.replace(/^"|"$/g, ''));
}

export async function signToken(payload: Record<string, unknown>, days = SESSION_DAYS) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('nexatrade')
    .setExpirationTime(`${days}d`)
    .sign(secretKey());
}

export async function verifyToken(token?: string | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'nexatrade' });
    return payload as Record<string, any>;
  } catch {
    return null;
  }
}

function cookieOptions(): CookieOptions {
  // Embedded dev previews (iframe) need SameSite=None; Secure (+Partitioned)
  // or the browser drops the cookie. Production keeps strict Lax + Secure.
  const embedded = env.nodeEnv !== 'production' && process.env.PREVIEW_EMBED === '1';
  return {
    httpOnly: true,
    sameSite: embedded ? 'none' : 'lax',
    secure: embedded || env.nodeEnv === 'production',
    ...(embedded ? { partitioned: true } : {}),
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  } as CookieOptions;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(USER_COOKIE, token, cookieOptions());
  return res;
}

export function clearSessionCookie(res: Response) {
  res.cookie(USER_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  return res;
}

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  country: string;
  role: string;
  balance_real: string | number;
  balance_demo: string | number;
  kyc_status: string;
  custom_yield_ratio: string | number | null;
  force_loss_user: boolean;
  is_blocked: boolean;
  last_login_at: Date | string | null;
  created_at: Date;
  [key: string]: unknown;
}

export function serializeUser(row: UserRow | null) {
  if (!row) return null;
  const role = row.role;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    role,
    balanceReal: Number(row.balance_real),
    balanceDemo: Number(row.balance_demo),
    kycStatus: row.kyc_status,
    customYieldRatio:
      row.custom_yield_ratio === null || row.custom_yield_ratio === undefined
        ? null
        : Number(row.custom_yield_ratio),
    forceLossUser: Boolean(row.force_loss_user),
    isBlocked: Boolean(row.is_blocked),
    isSuperAdmin: role === 'SUPER_ADMIN',
    isStaff: isStaff(role),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

const PUBLIC_USER_FIELDS = `id, full_name, email, phone, country, role, balance_real, balance_demo,
  kyc_status, custom_yield_ratio, force_loss_user, is_blocked, last_login_at, created_at`;

/** Reads the session cookie (or Bearer token), verifies it, loads the user row.
 *  Pass `cookieName` to read a different cookie (e.g. ADMIN_COOKIE for admin routes). */
export async function getSessionUser(req: Request, cookieName: string = USER_COOKIE) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.cookies?.[cookieName] || bearer || null;
  const payload = await verifyToken(token);
  if (!payload?.sub) return null;
  const row = await one(`SELECT ${PUBLIC_USER_FIELDS}, token_version FROM users WHERE id = $1`, [
    payload.sub,
  ]);
  if (!row) return null;
  if (Number(payload.tv || 0) !== Number((row as any).token_version)) return null; // revoked
  if ((row as any).is_blocked) return null;
  return serializeUser(row as UserRow);
}

/* ------------------------------------------------------------------ *
 * Security / audit logging (device + IP tracking) — ported as-is
 * ------------------------------------------------------------------ */
export function clientMeta(req: Request) {
  const h = req.headers;
  const ip =
    String(h['x-forwarded-for'] || '').split(',')[0].trim() ||
    String(h['x-real-ip'] || '') ||
    String(h['cf-connecting-ip'] || '') ||
    req.ip ||
    '0.0.0.0';
  const userAgent = String(h['user-agent'] || 'unknown');
  const fingerprint = String(h['x-nexa-device'] || '').slice(0, 64);
  return { ip, userAgent, device: describeDevice(userAgent), fingerprint };
}

export function describeDevice(ua = '') {
  const s = ua.toLowerCase();
  const os = s.includes('android')
    ? 'Android'
    : /iphone|ipad|ios/.test(s)
      ? 'iOS'
      : s.includes('windows')
        ? 'Windows'
        : s.includes('mac os')
          ? 'macOS'
          : s.includes('linux')
            ? 'Linux'
            : 'Unknown OS';
  const browser = s.includes('edg/')
    ? 'Edge'
    : s.includes('chrome/')
      ? 'Chrome'
      : s.includes('safari')
        ? 'Safari'
        : s.includes('firefox')
          ? 'Firefox'
          : 'Browser';
  const type = /mobile|android|iphone/.test(s)
    ? 'Mobile'
    : /ipad|tablet/.test(s)
      ? 'Tablet'
      : 'Desktop';
  return `${type} · ${os} · ${browser}`;
}

export async function recordDevice(req: Request, userId: string) {
  if (!userId) return false;
  const { ip, userAgent, fingerprint } = clientMeta(req);
  if (!fingerprint) return false;
  try {
    const known = await one(
      'SELECT id FROM device_fingerprints WHERE user_id=$1 AND fingerprint=$2',
      [userId, fingerprint]
    );
    await sql(
      `INSERT INTO device_fingerprints (id, user_id, fingerprint, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, fingerprint)
       DO UPDATE SET hits = device_fingerprints.hits + 1, last_seen = NOW(),
                     ip = EXCLUDED.ip, user_agent = EXCLUDED.user_agent`,
      [uuid(), userId, fingerprint, ip, userAgent]
    );
    return !known;
  } catch (err) {
    console.error('[device]', (err as Error).message);
    return false;
  }
}

export async function logSecurity(opts: {
  req?: Request;
  userId?: string | null;
  email?: string;
  event: string;
  severity?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    const { ip, userAgent, device, fingerprint } = opts.req
      ? clientMeta(opts.req)
      : { ip: '', userAgent: '', device: '', fingerprint: '' };
    let meta = opts.meta ?? {};
    if (fingerprint) meta = { ...meta, fingerprint };
    await sql(
      `INSERT INTO security_logs (id, user_id, email, event, severity, ip, device, user_agent, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [uuid(), opts.userId ?? null, opts.email ?? '', opts.event, opts.severity ?? 'INFO', ip, device, userAgent, JSON.stringify(meta)]
    );
  } catch (err) {
    console.error('[security-log]', (err as Error).message);
  }
}
