/**
 * useMyTrades — the signed-in user's trades, for the chart's entry/exit marks.
 *
 * Returns [] for a guest (no session → the trades endpoints answer 401), so the
 * chart simply draws no trade overlays. Refreshed on a slow poll so a settled
 * position turns from a hollow expiry projection into a recorded exit dot.
 */
import { useEffect, useState } from 'react';
import { fetchAllTrades, type UiTrade } from '../lib/trades';
import { useAuthStore } from '../stores/authStore';

const POLL_MS = 15_000;

export function useMyTrades(): { trades: UiTrade[] } {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [trades, setTrades] = useState<UiTrade[]>([]);

  useEffect(() => {
    if (!userId) {
      setTrades([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { trades: rows } = await fetchAllTrades(50);
        if (!cancelled) setTrades(rows);
      } catch {
        /* keep the last known set — the chart must never flicker empty */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId]);

  return { trades };
}
