/**
 * Role-Based Access Control — ported 1:1 from legacy src/lib/rbac.js.
 * The same matrix is enforced on the server; a role holds its own permissions
 * PLUS every permission granted to roles BELOW it in the chain.
 */
import type { Request, Response } from 'express';
import { getSessionUser, isStaff, ADMIN_COOKIE } from './auth';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  MODERATOR: 'MODERATOR',
  USER: 'USER',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Roles that may sign into the hidden admin portal. */
export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR'];

export const PERMISSIONS = {
  // Users
  USERS_VIEW: 'users:view',
  USERS_EDIT: 'users:edit',          // block, balance adjust, risk overrides
  USERS_DELETE: 'users:delete',
  ROLES_ASSIGN: 'roles:assign',      // promote/demote staff
  SESSIONS_REVOKE: 'sessions:revoke',
  // Finance
  FINANCE_VIEW: 'finance:view',
  FINANCE_APPROVE: 'finance:approve', // approve/reject deposits & withdrawals
  PAYMENT_METHODS_MANAGE: 'payments:manage',
  // KYC
  KYC_REVIEW: 'kyc:review',
  // Markets & content
  ASSETS_MANAGE: 'assets:manage',
  TOURNAMENTS_MANAGE: 'tournaments:manage',
  // Risk / fraud / system
  RISK_MANAGE: 'risk:manage',
  FRAUD_VIEW: 'fraud:view',
  LOGS_VIEW: 'logs:view',
  SETTINGS_MANAGE: 'settings:manage',
} as const;

/** ORDER runs most → least powerful. */
const ORDER = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR'];

/** Explicit per-role capability sets (everything lower in ORDER is inherited). */
const MATRIX: Record<string, string[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  ADMIN: [
    PERMISSIONS.USERS_VIEW, PERMISSIONS.USERS_EDIT, PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_ASSIGN, PERMISSIONS.SESSIONS_REVOKE,
    PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.PAYMENT_METHODS_MANAGE,
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.ASSETS_MANAGE, PERMISSIONS.TOURNAMENTS_MANAGE,
    PERMISSIONS.RISK_MANAGE, PERMISSIONS.FRAUD_VIEW, PERMISSIONS.LOGS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
  ],
  EDITOR: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_APPROVE, PERMISSIONS.PAYMENT_METHODS_MANAGE,
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.ASSETS_MANAGE, PERMISSIONS.TOURNAMENTS_MANAGE,
    PERMISSIONS.FRAUD_VIEW,
  ],
  MODERATOR: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.KYC_REVIEW,
    PERMISSIONS.FRAUD_VIEW,
    PERMISSIONS.LOGS_VIEW,
  ],
  USER: [],
};

/** Index into ORDER — lower means more powerful. Unknown roles rank last. */
function roleIndex(role: string): number {
  const i = ORDER.indexOf(role as never);
  return i === -1 ? ORDER.length + 1 : i;
}

/** True when `role` holds `permission`. */
export function can(role: string, permission: string): boolean {
  if (!role || !STAFF_ROLES.includes(role as never)) return false;
  if (role === ROLES.SUPER_ADMIN) return true;
  const myLevel = roleIndex(role);
  for (const r of ORDER) {
    if (roleIndex(r) < myLevel) continue; // skip roles stronger than us
    if ((MATRIX[r] || []).includes(permission)) return true;
  }
  return false;
}

/** Every permission a role effectively holds. */
export function permissionsFor(role: string): Set<string> {
  const set = new Set<string>();
  if (role === ROLES.SUPER_ADMIN) return new Set(Object.values(PERMISSIONS));
  const myLevel = roleIndex(role);
  for (const r of ORDER) {
    if (roleIndex(r) >= myLevel) (MATRIX[r] || []).forEach((p) => set.add(p));
  }
  return set;
}

export { isStaff };

export interface SessionStaff {
  id: string;
  email: string;
  role: string;
}

/**
 * Express port of legacy requireAdmin(): requires a logged-in staff member
 * (SUPER_ADMIN / ADMIN / EDITOR / MODERATOR) and enforces the RBAC matrix.
 * On failure it SENDS the 401/403 response and returns null; on success it
 * returns the staff user.
 *
 * Usage: const user = await requireAdmin(req, res, PERMISSIONS.ASSETS_MANAGE);
 *        if (!user) return;
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  permission: string | null = null
): Promise<SessionStaff | null> {
  const user = await getSessionUser(req, ADMIN_COOKIE);
  if (!user || !isStaff(user.role)) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return null;
  }
  if (permission && !can(user.role, permission)) {
    res.status(403).json({ error: 'Your role does not have permission to perform this action.' });
    return null;
  }
  return { id: user.id, email: user.email, role: user.role };
}
