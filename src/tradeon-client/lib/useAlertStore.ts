/**
 * useAlertStore — 1:1 port of legacy src/lib/useAlertStore.js.
 * ONE shared store imported by BOTH the Admin Panel and the User Panel.
 *
 * Three channels:
 *   • Blocking Center Modal  → things that stop the user mid-action.
 *   • Toast (top-center)     → important but non-blocking.
 *   • Notification Center    → the permanent record.
 */
import { create } from "zustand";

export type ToastSeverity = "info" | "success" | "warning" | "critical";

export const TOAST_DURATION_MS: Record<ToastSeverity, number> = {
  info: 4000,
  success: 4500,
  warning: 7000,
  critical: 9000,
};

export const MAX_TOASTS = 3;
const MAX_LOCAL_NOTIFICATIONS = 60;

const SEVERITIES: readonly string[] = ["info", "success", "warning", "critical"];

export interface AlertToast {
  id: string;
  severity: ToastSeverity;
  message: string;
  title?: string;
  durationMs: number;
}

export interface AlertModal {
  id: string;
  severity: ToastSeverity;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  dismissible: boolean;
}

export interface NotificationItem {
  id: string;
  severity: ToastSeverity;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  /** 'local' entries are logged client-side; 'server' ones came from the API. */
  source?: "local" | "server";
  channel?: string;
}

export interface PushToastArgs {
  severity?: string;
  message?: unknown;
  title?: string;
  durationMs?: number;
  log?: boolean;
}

export interface PushModalArgs {
  severity?: string;
  title: string;
  message?: unknown;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  dismissible?: boolean;
  log?: boolean;
}

interface LogNotificationArgs {
  severity?: string;
  title?: string;
  message?: string;
  channel?: string;
}

/** Shape of a notification row as it arrives from the API. */
export interface ServerNotificationRow {
  id: string;
  title?: string;
  body?: string;
  message?: string;
  timestamp?: string;
  createdAt?: string;
  isRead?: boolean;
  read?: boolean;
  kind?: string;
  [key: string]: unknown;
}

interface AlertState {
  toasts: AlertToast[];
  modal: AlertModal | null;
  notifications: NotificationItem[];
  dismissedServerIds: string[];
  serverReadBefore: string | null;
  serverClearedBefore: string | null;
  pushToast: (a: PushToastArgs) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  pushModal: (a: PushModalArgs) => string;
  closeModal: () => void;
  logNotification: (args: LogNotificationArgs) => void;
  dismissNotification: (id: string) => void;
  markAllRead: () => void;
  clearAllNotifications: () => void;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const normalizeSeverity = (s: unknown): ToastSeverity =>
  typeof s === "string" && SEVERITIES.includes(s) ? (s as ToastSeverity) : "info";

export const useAlertStore = create<AlertState>((set, get) => ({
  toasts: [],
  modal: null,
  notifications: [],
  dismissedServerIds: [],
  serverReadBefore: null,
  serverClearedBefore: null,

  pushToast: (a) => {
    const severity = normalizeSeverity(a.severity);
    const toast = {
      id: makeId(),
      severity,
      message: String(a.message ?? ""),
      title: a.title,
      durationMs:
        typeof a.durationMs === "number" && Number.isFinite(a.durationMs)
          ? a.durationMs
          : TOAST_DURATION_MS[severity],
    };
    set((s) => ({
      toasts: [toast, ...s.toasts].slice(0, MAX_TOASTS),
    }));
    if (a.log !== false)
      get().logNotification({ severity, title: a.title, message: toast.message, channel: "toast" });
    return toast.id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),

  pushModal: (a) => {
    const severity = normalizeSeverity(a.severity);
    const modal = {
      id: makeId(),
      severity,
      title: String(a.title ?? ""),
      message: String(a.message ?? ""),
      confirmLabel: a.confirmLabel || "OK",
      cancelLabel: a.cancelLabel,
      onConfirm: a.onConfirm,
      onCancel: a.onCancel,
      dismissible: a.dismissible !== false,
    };
    set({ modal });
    if (a.log !== false)
      get().logNotification({
        severity,
        title: modal.title,
        message: modal.message,
        channel: "modal",
      });
    return modal.id;
  },
  closeModal: () => set({ modal: null }),

  logNotification: ({ severity = "info", title, message, channel = "toast" }) =>
    set((s) => ({
      notifications: [
        {
          id: makeId(),
          severity: normalizeSeverity(severity),
          title: title || "",
          message: message || "",
          channel,
          timestamp: new Date().toISOString(),
          read: false,
          source: "local" as const,
        },
        ...s.notifications,
      ].slice(0, MAX_LOCAL_NOTIFICATIONS),
    })),
  dismissNotification: (id) =>
    set((s) => {
      const isLocal = s.notifications.some((n) => n.id === id);
      return isLocal
        ? { notifications: s.notifications.filter((n) => n.id !== id) }
        : { dismissedServerIds: [...new Set([...s.dismissedServerIds, id])] };
    }),
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })),
      serverReadBefore: new Date().toISOString(),
    })),
  clearAllNotifications: () =>
    set({
      notifications: [],
      dismissedServerIds: [],
      serverClearedBefore: new Date().toISOString(),
    }),
}));

export function mergeNotifications(
  local: NotificationItem[] = [],
  server: ServerNotificationRow[] = [],
  o: {
    dismissedServerIds?: string[];
    serverReadBefore?: string | null;
    serverClearedBefore?: string | null;
  } = {},
): NotificationItem[] {
  const dismissed = new Set(o.dismissedServerIds || []);
  const readBefore = o.serverReadBefore ? Date.parse(o.serverReadBefore) : 0;
  const clearedBefore = o.serverClearedBefore ? Date.parse(o.serverClearedBefore) : 0;
  const ts = (n: { timestamp?: string }) => (n.timestamp ? Date.parse(n.timestamp) : 0) || 0;
  const fromServer: NotificationItem[] = server
    .filter((n) => !dismissed.has(n.id))
    .filter((n) => !(clearedBefore && ts(n) <= clearedBefore))
    .map((n) => ({
      ...n,
      id: n.id,
      severity: normalizeSeverity(n.severity),
      title: n.title || "",
      message: n.message || "",
      timestamp: n.timestamp || "",
      source: "server" as const,
      read: Boolean(n.read) || (readBefore > 0 && ts(n) <= readBefore),
    }));
  return [...local, ...fromServer].sort((a, b) => ts(b) - ts(a));
}

export function serverNotificationToItem(n: ServerNotificationRow): NotificationItem {
  return {
    id: n.id,
    title: n.title || "",
    message: n.body || "",
    timestamp: n.createdAt || "",
    read: Boolean(n.isRead),
    severity: severityFromKind(n.kind),
  };
}

const pushToast =
  (severity: ToastSeverity) =>
  (message: string, opts: Omit<PushToastArgs, "severity" | "message"> = {}) =>
    useAlertStore.getState().pushToast({ severity, message, ...opts });

export const alert = {
  info: pushToast("info"),
  success: pushToast("success"),
  warning: pushToast("warning"),
  critical: pushToast("critical"),
  modal: (a: PushModalArgs) => useAlertStore.getState().pushModal(a),
  confirm: ({
    severity = "warning",
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    dismissible = true,
  }: Omit<PushModalArgs, "severity" | "title" | "message"> & {
    severity?: string;
    title: string;
    message?: unknown;
  }): Promise<boolean> =>
    new Promise((resolve) => {
      useAlertStore.getState().pushModal({
        severity,
        title,
        message,
        confirmLabel,
        cancelLabel,
        dismissible,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    }),
};

export function severityFromKind(kind?: string): ToastSeverity {
  const k = String(kind || "").toUpperCase();
  if (k === "SUCCESS") return "success";
  if (k === "WARNING" || k === "WARN") return "warning";
  if (k === "CRITICAL" || k === "ERROR" || k === "DANGER") return "critical";
  return "info";
}
