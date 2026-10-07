/**
 * adminAuthStore — SEPARATE from the user authStore.
 * Uses the dedicated /api/admin/* endpoints (login, logout, me) with a
 * separate ADMIN_COOKIE so admin and user sessions are fully independent.
 */
import { create } from 'zustand';
import { api, type AuthUser } from '../lib/api';

export type AdminStatus = 'idle' | 'loading' | 'authenticated' | 'guest';

interface AdminAuthState {
  user: AuthUser | null;
  status: AdminStatus;
  requiresTwoFactor: boolean;
  error: string | null;
  fields: Record<string, string> | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  user: null,
  status: 'idle',
  requiresTwoFactor: false,
  error: null,
  fields: null,

  bootstrap: async () => {
    set({ status: 'loading' });
    try {
      const { status, data } = await api<{ user?: AuthUser; error?: string }>('/admin/me');
      if (status === 200 && data?.user) {
        set({ user: data.user, status: 'authenticated', error: null, fields: null });
      } else {
        set({ user: null, status: 'guest' });
      }
    } catch {
      set({ user: null, status: 'guest' });
    }
  },

  login: async (email, password, twoFactorCode) => {
    set({ error: null, fields: null, requiresTwoFactor: false });
    const { status, data } = await api<{ user?: AuthUser; error?: string; fields?: Record<string, string>; requiresTwoFactor?: boolean }>('/admin/login', {
      method: 'POST',
      body: { email, password, ...(twoFactorCode ? { twoFactorCode } : {}) },
    });
    if (status === 200 && data?.user) {
      set({ user: data.user, status: 'authenticated', error: null, fields: null });
      return true;
    }
    set({
      error: data?.error ?? 'Sign in failed.',
      fields: data?.fields ?? null,
      requiresTwoFactor: Boolean(data?.requiresTwoFactor),
    });
    return false;
  },

  logout: async () => {
    await api('/admin/logout', { method: 'POST' });
    set({ user: null, status: 'guest', error: null, fields: null, requiresTwoFactor: false });
  },
}));
