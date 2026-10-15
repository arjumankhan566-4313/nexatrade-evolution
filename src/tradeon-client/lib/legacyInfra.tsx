/**
 * legacyInfra — Vite-compatible shims for the legacy Next.js infra that the
 * ported dashboard/admin pages depend on.  Every export below is a 1:1
 * behavioural match of its legacy counterpart so the ported page JSX can be
 * copied verbatim without touching the import paths.
 *
 *   legacy `@/lib/apiClient`      → api, money, fmtPrice, timeAgo, fmtDate
 *   legacy `@/lib/useAlertStore`  → alert
 *   legacy `@/lib/realtimeClient` → useLiveEvents, deviceFingerprint
 *   legacy `@/components/dashboard/SessionProvider` → useSession
 *   legacy `@/components/dashboard/WorkspaceLink`   → Link
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { io as ioClient, type Socket as SIOSocket } from "socket.io-client";
import { useAuthStore } from "../stores/authStore";
import { lpToast } from "./legacy";

/* ═══════════════════════════════════════════════════════════════════════════
   apiClient shim  (legacy src/lib/apiClient.js)
   ═══════════════════════════════════════════════════════════════════════════ */
export function deviceFingerprint(): string {
  return "";
}

/** Tiny fetch wrapper — always sends cookies, throws readable errors (1:1).
 *
 * CONTRACT (differs from `lib/api.ts` — read before importing):
 *  - THROWS an Error on any !res.ok response; the error carries `.status`,
 *    `.data`, `.code`, `.hint`, `.fields`, `.detail`.
 *  - Does NOT add an `/api` prefix — pass the full path
 *    (e.g. `api('/api/admin/stats')`).
 * Prefer `lib/api.ts` (non-throwing, `/api`-prefixed) for new code.
 */
/** Error shape the legacy `api()` attaches to thrown failures. */
export interface ApiRequestError extends Error {
  status: number;
  data: unknown;
  code?: string;
  hint?: string;
  fields?: Record<string, string> | null;
  detail?: unknown;
}

/** The failure body the legacy backend returns alongside non-2xx statuses. */
interface ApiFailureBody {
  error?: string;
  code?: string;
  hint?: string;
  fields?: Record<string, string> | null;
  detail?: unknown;
}

// The untyped default is the LEGACY CONTRACT: 24 ported dashboard/admin pages
// call `api(path)` without a generic and read properties off the result.
// New code should pass an explicit type parameter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(
  path: string,
  { method = "GET", body, signal }: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["content-type"] = "application/json";
  const fp = deviceFingerprint();
  if (fp) headers["x-nexa-device"] = fp;

  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const failure = (data ?? {}) as Partial<ApiFailureBody>;
    const err = new Error(failure.error || `Request failed (${res.status})`) as ApiRequestError;
    err.status = res.status;
    err.data = data;
    err.code = failure.code;
    err.hint = failure.hint;
    err.fields = failure.fields || null;
    err.detail = failure.detail;
    throw err;
  }
  return data as T;
}

export const money = (n: unknown, digits = 2): string =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const fmtPrice = (n: unknown, digits = 2): string =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const fmtDate = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/* ═══════════════════════════════════════════════════════════════════════════
   useAlertStore shim  (legacy src/lib/useAlertStore.js)
   Minimal: toasts via lpToast, modal via a simple global emitter the
   LegacyModal provider renders.  Non-blocking channels are console-safe.
   ═══════════════════════════════════════════════════════════════════════════ */
interface ModalSpec {
  severity?: string;
  title: string;
  message?: string;
  confirmLabel?: string;
  dismissible?: boolean;
  onConfirm?: () => void;
}
let _modal: ModalSpec | null = null;
const _modalListeners = new Set<(m: ModalSpec | null) => void>();

export function pushModal(spec: ModalSpec) {
  _modal = spec;
  _modalListeners.forEach((fn) => fn(_modal));
}
export function dismissModal() {
  _modal = null;
  _modalListeners.forEach((fn) => fn(null));
}
export function getModal() {
  return _modal;
}
export function subscribeModal(fn: (m: ModalSpec | null) => void) {
  _modalListeners.add(fn);
  return () => {
    _modalListeners.delete(fn);
  };
}

export const alert = {
  success: (text: string, opts?: { title?: string }) =>
    lpToast(opts?.title || "Success", text, "success"),
  info: (text: string, opts?: { title?: string }) => lpToast(opts?.title || "Info", text, "info"),
  warning: (text: string, opts?: { title?: string }) =>
    lpToast(opts?.title || "Warning", text, "warning"),
  critical: (text: string, opts?: { title?: string }) =>
    lpToast(opts?.title || "Critical", text, "error"),
  modal: (spec: ModalSpec) => pushModal(spec),
};

/* ═══════════════════════════════════════════════════════════════════════════
   useLiveEvents shim  (legacy src/lib/realtimeClient.js)
   Wired to the V2 Socket.io server — authenticates via cookies (the socket
   middleware reads nexa_admin / nexa_session), joins rt:<channel> rooms, and
   delivers events to the onEvent callback.  Returns the legacy { status }
   contract: 'connecting' | 'live' | 'reconnecting'.
   ═══════════════════════════════════════════════════════════════════════════ */

let _socket: SIOSocket | null = null;

function getSocket(): SIOSocket {
  if (!_socket) {
    _socket = ioClient({ transports: ["websocket", "polling"], withCredentials: true });
  }
  return _socket;
}

/** A realtime event delivered over an `rt:<channel>` socket room. */
export interface LiveEvent {
  topic: string;
  payload: unknown;
  id?: string;
  [key: string]: unknown;
}

export function useLiveEvents(opts: {
  onEvent?: (e: LiveEvent) => void;
  scope?: string;
  topics?: string[];
}): { status: "live" | "reconnecting" | "connecting" } {
  const [status, setStatus] = useState<"live" | "reconnecting" | "connecting">("connecting");
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;

  const channels = opts.topics || [
    "settings",
    "assets",
    "tiers",
    "tournaments",
    "leaderboard",
    "maintenance",
    "balance",
    "trade",
    "kyc",
    "notification",
    "session",
    "copy",
    "tier",
    "finance",
    "payments",
    "admin",
    "affiliate_application",
  ];
  const channelKey = channels.slice().sort().join(",");

  useEffect(() => {
    const socket = getSocket();
    const joined: string[] = [];

    const handleChannel = (channel: string) => (payload: unknown) => {
      const event = (payload ?? {}) as Partial<LiveEvent>;
      onEventRef.current?.(
        event.topic === channel && event.payload !== undefined
          ? (payload as LiveEvent)
          : { topic: channel, payload },
      );
    };

    const handlers: Record<string, (payload: unknown) => void> = {};
    for (const ch of channels) {
      handlers[ch] = handleChannel(ch);
      socket.on(`rt:${ch}`, handlers[ch]);
      socket.emit("join:rt", ch);
      joined.push(ch);
    }

    const onConnect = () => {
      // Re-join rooms after reconnect
      for (const ch of joined) socket.emit("join:rt", ch);
      setStatus("live");
    };
    const onDisconnect = () => setStatus("reconnecting");
    const onConnectError = () => setStatus("reconnecting");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    if (socket.connected) setStatus("live");

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      for (const ch of joined) {
        socket.off(`rt:${ch}`, handlers[ch]);
        // Leave the server-side room too — without this every mount/unmount
        // cycle left a ghost member in the socket room (event + memory leak).
        socket.emit("leave:rt", ch);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);

  return { status };
}

/* ═══════════════════════════════════════════════════════════════════════════
   useSession shim  (legacy src/components/dashboard/SessionProvider.jsx)
   Backed by the V2 authStore; `refresh` re-reads /api/auth/me.
   ═══════════════════════════════════════════════════════════════════════════ */
export function useSession() {
  const user = useAuthStore((s) => s.user);
  const refresh = useCallback(async () => {
    await useAuthStore.getState().refresh();
  }, []);
  return { user, refresh, kyc: null, notifications: [], loading: false, initError: null };
}

/* The `Link` (WorkspaceLink) and `LegacyModalHost` components moved to
   `components/dashboard/WorkspaceLink.tsx` and
   `components/dashboard/LegacyModalHost.tsx`.  A module that mixes components
   with plain helpers is not a Vite Fast Refresh boundary, so keeping them here
   made every edit force a full reload of all importers. */
