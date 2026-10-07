/** Direct port: src/lib/rbac.js. */
/**
 * Role-Based Access Control (Module 3).
 *
 * Three staff roles sit above ordinary traders:
 *
 *   SUPER_ADMIN — the platform owner. Cannot be deleted, demoted, blocked or
 *                 have its sessions revoked by ANY role, including another
 *                 SUPER_ADMIN. Has every permission.
 *   ADMIN       — full operational control (users, finance, risk, markets).
 *   EDITOR      — content/markets + finance approval only.
 *   MODERATOR   — read-only oversight + KYC reviews; cannot touch money.
 *   USER        — a trader (never an admin-portal session).
 *
 * The same matrix is enforced on the server (API routes) and surfaced in the
 * UI (admin portal hides/hides-disables what a role may not do).
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  MODERATOR: 'MODERATOR',
  USER: 'USER',
};

/** Email of the hard-protected platform owner. Never generated dynamically. */
export const SUPER_ADMIN_EMAIL = 'arjumankhan181@gmail.com';

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  MODERATOR: 'Moderator',
  USER: 'Trader',
};

/** Roles that may sign into the hidden admin portal. */
export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR'];

/**
 * Permission matrix. ORDER runs most → least powerful. A role holds its own
 * permissions PLUS every permission granted to roles BELOW it in the chain
 * (a higher index = a weaker role). SUPER_ADMIN is implicit owner of all.
 */
const ORDER = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR'];

export const PERMISSIONS = {
  // Users
  USERS_VIEW: 'users:view',
  USERS_EDIT: 'users:edit',          // block, balance adjust, risk overrides
  USERS_DELETE: 'users:delete',
  ROLES_ASSIGN: 'roles:assign',      // promote/demote staff
  SESSIONS_REVOKE: 'sessions:revoke',
  // Finance (Module 5)
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
};

/** Explicit per-role capability sets (everything lower in ORDER is inherited). */
const MATRIX = {
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
function roleIndex(role) {
  const i = ORDER.indexOf(role);
  return i === -1 ? ORDER.length + 1 : i;
}

/**
 * True when `role` holds `permission`.
 * A role inherits the permissions of every role WEAKER than it (higher index),
 * so e.g. ADMIN gets everything EDITOR and MODERATOR have, but a MODERATOR
 * never gets an ADMIN-only permission.
 */
export function can(role, permission) {
  if (!role || !STAFF_ROLES.includes(role)) return false;
  if (role === ROLES.SUPER_ADMIN) return true;
  const myLevel = roleIndex(role);
  for (const r of ORDER) {
    if (roleIndex(r) < myLevel) continue; // skip roles stronger than us
    if ((MATRIX[r] || []).includes(permission)) return true;
  }
  return false;
}

/** Every permission a role effectively holds (its own + those of weaker roles). */
export function permissionsFor(role) {
  const set = new Set();
  if (role === ROLES.SUPER_ADMIN) return new Set(Object.values(PERMISSIONS));
  const myLevel = roleIndex(role);
  for (const r of ORDER) {
    if (roleIndex(r) >= myLevel) (MATRIX[r] || []).forEach((p) => set.add(p));
  }
  return set;
}

export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * Protection predicate (Module 3.2): a target account may never be deleted,
 * demoted or blocked when it is the SUPER_ADMIN owner.
 *
 * @param {{ email?: string, role?: string }} target  the account being acted on
 * @returns {boolean} true → the action MUST be refused
 */
export function isProtectedSuperAdmin(target) {
  if (!target) return false;
  if (target.role === ROLES.SUPER_ADMIN) return true;
  if (target.email && target.email.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
  return false;
}
