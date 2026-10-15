// @ts-nocheck
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

export const TOAST_DURATION_MS = {
  info: 4000,
  success: 4500,
  warning: 7000,
  critical: 9000,
};

export const MAX_TOASTS = 3;
const MAX_LOCAL_NOTIFICATIONS = 60;

const SEVERITIES = ["info", "success", "warning", "critical"];

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const normalizeSeverity = (s) => (SEVERITIES.includes(s) ? s : "info");

export const useAlertStore = create((set, get) => ({
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
      durationMs: Number.isFinite(a.durationMs) ? a.durationMs : TOAST_DURATION_MS[severity],
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
          source: "local",
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

export function mergeNotifications(local = [], server = [], o = {}) {
  const dismissed = new Set(o.dismissedServerIds || []);
  const readBefore = o.serverReadBefore ? Date.parse(o.serverReadBefore) : 0;
  const clearedBefore = o.serverClearedBefore ? Date.parse(o.serverClearedBefore) : 0;
  const ts = (n) => Date.parse(n.timestamp) || 0;
  const fromServer = server
    .filter((n) => !dismissed.has(n.id))
    .filter((n) => !(clearedBefore && ts(n) <= clearedBefore))
    .map((n) => ({
      ...n,
      source: "server",
      read: Boolean(n.read) || (readBefore > 0 && ts(n) <= readBefore),
    }));
  return [...local, ...fromServer].sort((a, b) => ts(b) - ts(a));
}

export function serverNotificationToItem(n) {
  return {
    id: n.id,
    title: n.title || "",
    message: n.body || "",
    timestamp: n.createdAt,
    read: Boolean(n.isRead),
    severity: severityFromKind(n.kind),
  };
}

const pushToast =
  (severity) =>
  (message, opts = {}) =>
    useAlertStore.getState().pushToast({ severity, message, ...opts });

export const alert = {
  info: pushToast("info"),
  success: pushToast("success"),
  warning: pushToast("warning"),
  critical: pushToast("critical"),
  modal: (a) => useAlertStore.getState().pushModal(a),
  confirm: ({
    severity = "warning",
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    dismissible = true,
  }) =>
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

export function severityFromKind(kind) {
  const k = String(kind || "").toUpperCase();
  if (k === "SUCCESS") return "success";
  if (k === "WARNING" || k === "WARN") return "warning";
  if (k === "CRITICAL" || k === "ERROR" || k === "DANGER") return "critical";
  return "info";
}
