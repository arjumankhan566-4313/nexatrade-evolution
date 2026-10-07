/** Direct port of src/app/api/admin/users/[id]/route.js; transport imports only. */
import { one, sql, uuid, money, withTransaction } from '../db';
import { requireAdmin, json, fail, route } from '../http';
import { logSecurity } from '../http';
import { publish } from '../lib/realtime.js';
import {
  PERMISSIONS, can, isProtectedSuperAdmin, isStaff, ROLES, ROLE_LABELS,
} from '../lib/rbac.js';


export const GET = route(async (req, { params }) => {
  const { response } = await requireAdmin(PERMISSIONS.USERS_VIEW);
  if (response) return response;
  const { id } = await params;
  const u = await one('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) return fail('User not found.', 404);
  const trades = await one(
    `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='WON')::int wins,
            COUNT(*) FILTER (WHERE status='LOST')::int losses,
            COALESCE(SUM(profit),0) pnl FROM trades WHERE user_id=$1`,
    [id]
  );
  const recentTrades = await many(
    `SELECT t.id, t.symbol, t.direction, t.stake, t.profit, t.status, t.created_at, t.expired_at,
            t.market_type, t.account_type
     FROM trades t WHERE t.user_id=$1
     ORDER BY t.created_at DESC LIMIT 15`,
    [id]
  );
  return json({
    user: {
      id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, country: u.country, role: u.role,
      balanceReal: Number(u.balance_real), balanceDemo: Number(u.balance_demo), kycStatus: u.kyc_status,
      customYieldRatio: u.custom_yield_ratio === null ? null : Number(u.custom_yield_ratio),
      forceLossUser: u.force_loss_user, isBlocked: u.is_blocked, createdAt: u.created_at,
      lastLoginAt: u.last_login_at, lastLoginIp: u.last_login_ip,
    },
    trades: { ...trades, pnl: Number(trades.pnl) },
    recentTrades: (recentTrades || []).map((t) => ({
      id: t.id, symbol: t.symbol, direction: t.direction, stake: Number(t.stake),
      profit: Number(t.profit), status: t.status, createdAt: t.created_at,
      expiredAt: t.expired_at, marketType: t.market_type, accountType: t.account_type,
    })),
  });
});

/** Admin controls: risk override, block, balance adjustment, session revoke, role assignment. */
export const PATCH = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.USERS_EDIT);
  if (response) return response;
  const { id } = await params;
  const target = await one('SELECT id, email, role FROM users WHERE id=$1', [id]);
  if (!target) return fail('User not found.', 404);

  const body = await req.json().catch(() => ({}));
  const applied = {};

  // ── Role assignment (RBAC) ──────────────────────────────────────────────
  if (body.role !== undefined) {
    if (!can(admin.role, PERMISSIONS.ROLES_ASSIGN)) {
      return fail('Only Super Admins can change staff roles.', 403);
    }
    const nextRole = String(body.role).toUpperCase();
    if (!Object.values(ROLES).includes(nextRole)) return fail('Unknown role.');
    // The owner can never be demoted, by anyone.
    if (isProtectedSuperAdmin(target) && nextRole !== ROLES.SUPER_ADMIN) {
      return fail('The Super Admin owner cannot be demoted or blocked.', 403);
    }
    // A non-super-admin may not mint a SUPER_ADMIN.
    if (nextRole === ROLES.SUPER_ADMIN && admin.role !== ROLES.SUPER_ADMIN) {
      return fail('Only a Super Admin can grant Super Admin.', 403);
    }
    await sql('UPDATE users SET role=$2 WHERE id=$1', [id, nextRole]);
    applied.role = nextRole;
    await sql(
      `INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,'INFO')`,
      [uuid(), id, 'Account role updated', `Your platform role is now ${ROLE_LABELS[nextRole] || nextRole}.`]
    );
  }

  if (body.isBlocked !== undefined) {
    const wantBlock = Boolean(body.isBlocked);
    if (wantBlock && isProtectedSuperAdmin(target)) {
      return fail('The Super Admin owner cannot be blocked.', 403);
    }
    if (wantBlock && isStaff(target.role)) {
      return fail('Staff accounts cannot be blocked; demote them first.', 403);
    }
    await sql('UPDATE users SET is_blocked=$2, token_version = token_version + CASE WHEN $2 THEN 1 ELSE 0 END WHERE id=$1', [id, wantBlock]);
    applied.isBlocked = wantBlock;
  }
  if (body.revokeSessions) {
    if (isProtectedSuperAdmin(target)) return fail('The Super Admin owner’s sessions cannot be revoked.', 403);
    if (!can(admin.role, PERMISSIONS.SESSIONS_REVOKE)) {
      return fail('Your role cannot revoke sessions.', 403);
    }
    await sql('UPDATE users SET token_version = token_version + 1 WHERE id=$1', [id]);
    applied.revokeSessions = true;
  }
  if (body.kycStatus !== undefined) {
    const s = String(body.kycStatus).toUpperCase();
    if (!['NONE', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'].includes(s)) return fail('Invalid KYC status.');
    await sql('UPDATE users SET kyc_status=$2 WHERE id=$1', [id, s]);
    applied.kycStatus = s;
  }
  if (body.balanceAdjust) {
    const amount = money(Number(body.balanceAdjust.amount));
    const account = body.balanceAdjust.account === 'REAL' ? 'balance_real' : 'balance_demo';
    if (!Number.isFinite(amount) || amount === 0) return fail('Enter a non-zero adjustment amount.');
    await withTransaction(async (tx) => {
      await tx.lock('users', id);
      await tx.query(`UPDATE users SET ${account} = GREATEST(0, ${account} + $2) WHERE id=$1`, [id, amount]);
      await tx.query(
        `INSERT INTO transactions (id, user_id, type, amount, method, reference, status, admin_note, processed_by, processed_at)
         VALUES ($1,$2,$3,$4,'ADMIN_ADJUSTMENT',$5,'APPROVED',$6,$7,NOW())`,
        [uuid(), id, amount > 0 ? 'CREDIT' : 'DEBIT', Math.abs(amount),
         body.balanceAdjust.account === 'REAL' ? 'REAL account' : 'DEMO account',
         String(body.balanceAdjust.note || 'Manual admin adjustment'), admin.id]
      );
      await tx.query(`INSERT INTO notifications (id, user_id, title, body, kind) VALUES ($1,$2,$3,$4,'INFO')`, [
        uuid(), id, amount > 0 ? `Balance credited: +$${Math.abs(amount)}` : `Balance debited: -$${Math.abs(amount)}`,
        String(body.balanceAdjust.note || 'Manual admin adjustment'),
      ]);
    });
    applied.balanceAdjust = amount;
  }

  // ── Per-user risk overrides (yield ratio + force-loss) ─────────────────
  if (body.customYieldRatio !== undefined) {
    const val = body.customYieldRatio === null ? null : Number(body.customYieldRatio);
    if (val !== null && (!Number.isFinite(val) || val < 0 || val > 100)) return fail('Yield ratio must be 0-100 or null for global.');
    await sql('UPDATE users SET custom_yield_ratio=$2 WHERE id=$1', [id, val]);
    applied.customYieldRatio = val;
  }
  if (body.forceLossUser !== undefined) {
    const flag = Boolean(body.forceLossUser);
    if (flag && isProtectedSuperAdmin(target)) return fail('The Super Admin owner cannot be force-lossed.', 403);
    await sql('UPDATE users SET force_loss_user=$2 WHERE id=$1', [id, flag]);
    applied.forceLossUser = flag;
  }

  if (!Object.keys(applied).length) return fail('Nothing to update.');
  await logSecurity({
    req, userId: admin.id, email: admin.email, event: 'ADMIN_USER_UPDATE', severity: 'CRITICAL',
    meta: { targetUser: target.email, applied },
  });

  // Push the change straight into the user's open sessions (no refresh).
  if (applied.balanceAdjust !== undefined) await publish('balance', { reason: 'ADMIN_ADJUSTMENT', amount: applied.balanceAdjust }, id);
  if (applied.kycStatus !== undefined) await publish('kyc', { status: applied.kycStatus }, id);
  if (applied.isBlocked !== undefined || applied.revokeSessions) await publish('session', { action: 'revoked' }, id);
  if (applied.customYieldRatio !== undefined || applied.forceLossUser !== undefined) {
    await publish('settings', { scope: 'user' }, id);
  }

  const u = await one('SELECT * FROM users WHERE id=$1', [id]);
  return json({
    ok: true, applied,
    user: {
      id: u.id, fullName: u.full_name, email: u.email, balanceReal: Number(u.balance_real),
      balanceDemo: Number(u.balance_demo), kycStatus: u.kyc_status, isBlocked: u.is_blocked,
      forceLossUser: u.force_loss_user,
      customYieldRatio: u.custom_yield_ratio === null ? null : Number(u.custom_yield_ratio),
    },
  });
});

/**
 * DELETE — permanently purge an account and everything attached to it
 * (trades, transactions, KYC, notifications and devices cascade).
 */
export const DELETE = route(async (req, { params }) => {
  const { user: admin, response } = await requireAdmin(PERMISSIONS.USERS_DELETE);
  if (response) return response;
  const { id } = await params;
  const target = await one('SELECT id, email, role FROM users WHERE id=$1', [id]);
  if (!target) return fail('User not found.', 404);
  // The owner is hard-protected (Module 3.2). Staff accounts need demotion
  // first so an account with live panel access can never be purged silently.
  if (isProtectedSuperAdmin(target)) {
    return fail('The Super Admin owner can never be deleted.', 403);
  }
  if (isStaff(target.role)) return fail('Staff accounts must be demoted before deletion.', 403);

  const open = await one(`SELECT COUNT(*)::int AS n FROM trades WHERE user_id=$1 AND status IN ('OPEN','SETTLING')`, [id]);
  if (Number(open.n) > 0 && !new URL(req.url).searchParams.get('force')) {
    return fail(`${open.n} position(s) are still open. Retry with force=1 to purge anyway.`, 409);
  }

  await sql('DELETE FROM users WHERE id=$1', [id]);
  await logSecurity({
    req, userId: admin.id, email: admin.email, event: 'ADMIN_USER_DELETED', severity: 'CRITICAL',
    meta: { targetUser: target.email },
  });
  await publish('session', { action: 'deleted' }, id);
  return json({ ok: true, id });
});
