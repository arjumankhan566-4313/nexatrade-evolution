/**
 * Legacy UI utilities — 1:1 port of legacy/public/js/utils.js helpers.
 * Used by all ported dashboard/admin pages.
 */
import { api } from "./api";

/** Legacy-compatible API wrapper: returns data directly, throws on error. */
export async function legacyApi<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { status, data } = await api<T & { error?: string }>(path, options);
  if (status >= 400) {
    throw new Error((data as any)?.error || `Request failed (${status})`);
  }
  return data as T;
}

export const fmtMoney = (v: number, d = 2): string =>
  (Number(v) < 0 ? "-" : "") +
  "$" +
  Math.abs(Number(v) || 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

export const fmtPrice = (v: number): string => {
  const n = Number(v) || 0;
  const dp = n >= 100 ? 2 : n >= 10 ? 3 : n >= 1 ? 4 : n >= 0.01 ? 5 : n >= 0.0001 ? 6 : 9;
  return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

export const fmtPct = (v: number, d = 2): string =>
  `${v >= 0 ? "+" : ""}${(Number(v) || 0).toFixed(d)}%`;

export function timeAgo(iso: string): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function initials(name: string): string {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function copyText(text: string): void {
  navigator.clipboard?.writeText(text).then(
    () => lpToast("Copied", String(text).slice(0, 60), "success"),
    () => lpToast("Copy failed", "Select and copy manually", "error"),
  );
}

const BADGE_MAP: Record<string, string> = {
  WIN: "lp-badge-green",
  LOSS: "lp-badge-red",
  APPROVED: "lp-badge-green",
  VERIFIED: "lp-badge-green",
  REJECTED: "lp-badge-red",
  PENDING: "lp-badge-gold",
  NONE: "lp-badge-gray",
  DEMO: "lp-badge-gray",
  REAL: "lp-badge-blue",
  DEPOSIT: "lp-badge-green",
  WITHDRAWAL: "lp-badge-red",
  CALL: "lp-badge-green",
  PUT: "lp-badge-red",
  OPEN: "lp-badge-gold",
  ANSWERED: "lp-badge-blue",
  CLOSED: "lp-badge-gray",
  ENABLED: "lp-badge-green",
  DISABLED: "lp-badge-gray",
  ACTIVE: "lp-badge-green",
  FROZEN: "lp-badge-red",
};

export function badgeClass(status: string): string {
  return BADGE_MAP[status] || "lp-badge-gray";
}

// ── Toast system (simple global emitter) ──────────────────────────────
export interface ToastItem {
  id: number;
  title: string;
  body: string;
  type: string;
}
let toastSeq = 0;
const toastListeners = new Set<(toasts: ToastItem[]) => void>();
let toastState: ToastItem[] = [];

export function lpToast(title: string, body = "", type = "info"): void {
  const item: ToastItem = { id: ++toastSeq, title, body, type };
  toastState = [...toastState, item];
  toastListeners.forEach((fn) => fn(toastState));
  setTimeout(() => {
    toastState = toastState.filter((t) => t.id !== item.id);
    toastListeners.forEach((fn) => fn(toastState));
  }, 4200);
}

export function subscribeToasts(fn: (toasts: ToastItem[]) => void): () => void {
  toastListeners.add(fn);
  fn(toastState);
  return () => toastListeners.delete(fn);
}
