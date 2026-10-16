// @ts-nocheck
/**
 * NotificationsBell — the header bell for the USER panel.
 *
 * It opens the shared NotificationCenter dropdown over the account's own
 * notification record (`GET /api/notifications`: deposit/withdrawal decisions,
 * KYC, payouts, trade settlements). It must NOT navigate anywhere — the bell is
 * the notification centre; Support stays the sidebar's "Support Chat".
 *
 * Drop-in for both top bars (chart header and terminal topbar); each passes its
 * own trigger class so its pill matches the bar it sits in.
 */
import { useCallback, useEffect, useState } from 'react';
import NotificationCenter from './NotificationCenter';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import '../../styles/alerts.css';

interface Row {
  id: string;
  title: string;
  body: string;
  kind: string;
  isRead: boolean;
  createdAt: string;
}

/** Server `kind` → NotificationCenter severity (WIN/LOSS are the trade kinds). */
const SEVERITY: Record<string, string> = {
  INFO: 'info',
  SUCCESS: 'success',
  WIN: 'success',
  WARNING: 'warning',
  LOSS: 'warning',
  CRITICAL: 'critical',
};

/** A new deposit/withdrawal decision lands within this window. */
const POLL_MS = 30_000;

interface Props {
  buttonClassName?: string;
  align?: 'left' | 'right';
}

export default function NotificationsBell({ buttonClassName = '', align = 'right' }: Props) {
  const { status } = useAuthStore();
  const isGuestOrLoading = status !== 'authenticated';
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    // Genuine 401 on a public route (landing, /chart, …) is EXPECTED — the
    // hook also mounts in the terminal topbar. Skip the fetch so the guest's
    // console stays at zero errors; sign-in triggers a fresh mount anyway.
    if (useAuthStore.getState().status !== 'authenticated') return;
    const res = await api<{ notifications: Row[] }>('/notifications');
    if (res.status === 200 && Array.isArray(res.data?.notifications)) setRows(res.data.notifications);
  }, []);

  useEffect(() => {
    if (isGuestOrLoading) return;
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [isGuestOrLoading, load]);

  const items = rows.map((r) => ({
    id: r.id,
    severity: SEVERITY[r.kind] ?? 'info',
    title: r.title,
    message: r.body,
    timestamp: r.createdAt,
    read: r.isRead,
  }));

  const onDismiss = useCallback(async (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    await api('/notifications', { method: 'DELETE', body: { ids: [id] } });
  }, []);

  const onMarkAllRead = useCallback(async () => {
    setRows((prev) => prev.map((r) => ({ ...r, isRead: true })));
    await api('/notifications', { method: 'POST', body: {} });
  }, []);

  const onClearAll = useCallback(async () => {
    setRows([]);
    await api('/notifications', { method: 'DELETE' });
  }, []);

  return (
    <NotificationCenter
      items={items}
      onDismiss={onDismiss}
      onMarkAllRead={onMarkAllRead}
      onClearAll={onClearAll}
      onOpen={load}
      align={align}
      size={18}
      buttonClassName={buttonClassName}
    />
  );
}
