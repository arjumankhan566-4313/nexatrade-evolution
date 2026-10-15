import { create } from "zustand";
import { api, type AuthError, type AuthUser } from "../lib/api";

export type AuthStatus = "idle" | "loading" | "authenticated" | "guest" | "error";

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  requiresTwoFactor: boolean;
  error: string | null;
  fields: Record<string, string> | null;
  bootstrap: () => Promise<void>;
  /** Re-read the session (and its balances) without a loading flash. */
  refresh: () => Promise<void>;
  login: (email: string, password: string, twoFactorCode?: string) => Promise<boolean>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    country: string;
    phone: string;
    refCode?: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  resetErrors: () => void;
}

function applyError(data: AuthError | null): Partial<AuthState> {
  if (!data) return { error: null, fields: null, requiresTwoFactor: false };
  return {
    error: data.error ?? "Something went wrong. Please try again.",
    fields: data.fields ?? null,
    requiresTwoFactor: Boolean(data.requiresTwoFactor),
  };
}

const RETRY_MS = 700;

/**
 * The root shell and the /dashboard beforeLoad guard can both kick off a
 * bootstrap in the same tick — share one in-flight run so `/auth/me` is only
 * fetched once.
 */
let bootstrapInFlight: Promise<void> | undefined;

/**
 * Read the session, retrying past a transient API blip. The dev API restarts
 * on every file change, so `/auth/me` can answer 5xx or refuse the connection
 * for a second or two. Only a definitive answer (200 or 401) is returned
 * early — anything else is retried, and an unreachable API must NEVER be read
 * as "no session", because that silently signed the user out mid-session and
 * every trade then failed with "Insufficient … balance".
 */
async function readSession(
  attempts: number,
): Promise<{ status: number; data: { user?: AuthUser } | null }> {
  let last: { status: number; data: { user?: AuthUser } | null } = { status: 0, data: null };
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await api<{ user?: AuthUser }>("/auth/me");
      if (res.status === 200 || res.status === 401) return res;
      last = res;
    } catch {
      /* connection refused while the API restarts — retry */
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  return last;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  requiresTwoFactor: false,
  error: null,
  fields: null,

  bootstrap: async () => {
    if (bootstrapInFlight) return bootstrapInFlight;
    bootstrapInFlight = (async () => {
      set({ status: "loading" });
      const { status, data } = await readSession(4);
      if (data?.user) {
        set({ user: data.user, status: "authenticated", error: null, fields: null });
        return;
      }
      if (status === 401) {
        set({ user: null, status: "guest" });
        return;
      }
      // API unreachable after every retry: an already-signed-in session is
      // kept as-is, but a COLD start must never spin on "Loading…" forever —
      // surface 'error' so the layout can offer login / retry.
      set((s) => (s.user ? { status: "authenticated" as const } : { status: "error" as const }));
    })().finally(() => {
      bootstrapInFlight = undefined;
    });
    return bootstrapInFlight;
  },

  refresh: async () => {
    const { data } = await readSession(3);
    if (data?.user) set({ user: data.user, status: "authenticated" });
  },

  login: async (email, password, twoFactorCode) => {
    set({ error: null, fields: null, requiresTwoFactor: false });
    const { status, data } = await api<{ user?: AuthUser } & AuthError>("/auth/login", {
      method: "POST",
      body: { email, password, ...(twoFactorCode ? { twoFactorCode } : {}) },
    });
    if (status === 200 && data?.user) {
      set({ user: data.user, status: "authenticated", error: null, fields: null });
      return true;
    }
    set(applyError(data));
    return false;
  },

  register: async (input) => {
    set({ error: null, fields: null });
    const { status, data } = await api<{ user?: AuthUser } & AuthError>("/auth/register", {
      method: "POST",
      body: input,
    });
    if (status === 201 && data?.user) {
      set({ user: data.user, status: "authenticated", error: null, fields: null });
      return true;
    }
    set(applyError(data));
    return false;
  },

  logout: async () => {
    await api("/auth/logout", { method: "POST" });
    set({ user: null, status: "guest", error: null, fields: null, requiresTwoFactor: false });
  },

  resetErrors: () => set({ error: null, fields: null, requiresTwoFactor: false }),
}));
