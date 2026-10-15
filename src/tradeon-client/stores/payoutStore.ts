/**
 * payoutStore — the live payout rate per OTC symbol.
 *
 * The header quick-access tabs and the market list must show the SAME rate the
 * desk is offering right now, so both read this one shared feed instead of each
 * holding their own copy: a single poller (`GET /api/market/otc/payouts`, every
 * POLL_MS) started by the first consumer and stopped by the last, so two
 * components can never double-request it.
 *
 * The server derives the rate from the instrument's base payout, so this feed
 * needs no cache invalidation — a failed poll simply leaves the last known
 * rates on screen until the next one lands.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { api } from "../lib/api";

/** Refresh cadence. The server moves a rate at most once every 15s. */
const POLL_MS = 2000;

interface PayoutState {
  rates: Record<string, number>;
}

export const usePayoutStore = create<PayoutState>(() => ({ rates: {} }));

let timer: ReturnType<typeof setInterval> | null = null;
let refs = 0;

async function refresh(): Promise<void> {
  try {
    const res = await api<{ payouts: Record<string, number> }>("/market/otc/payouts");
    const payouts = res.data?.payouts;
    if (res.status >= 400 || !payouts) return;
    usePayoutStore.setState({ rates: payouts });
  } catch {
    /* keep the last known rates — this feed must never blank the board */
  }
}

function start(): void {
  if (timer) return;
  void refresh();
  timer = setInterval(refresh, POLL_MS);
}

function stop(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Subscribe to the shared live-payout feed. Returns the current rate per
 * symbol; callers fall back to the catalogue's own `payoutRate` during the
 * first poll.
 */
export function useLivePayouts(): Record<string, number> {
  const rates = usePayoutStore((s) => s.rates);
  useEffect(() => {
    refs += 1;
    start();
    return () => {
      refs -= 1;
      if (refs <= 0) {
        refs = 0;
        stop();
      }
    };
  }, []);
  return rates;
}
