/**
 * payoutStore — the live payout rate per OTC symbol.
 *
 * The header quick-access tabs, the market list and the trade ticket must show
 * the SAME rate the desk is offering right now, so all read this one shared
 * feed instead of each holding their own copy.
 *
 * Delivery is socket-first: the backend pushes the freshly derived map over
 * `rt:payouts` every PAYOUT_STEP_MS (and instantly after an admin payout
 * save), so the board moves with zero polling. The REST `/payouts` poll stays
 * as the cold-start fallback (first paint, reconnect gap, or a socket that
 * never connected) on a much slower cadence — it must never fight the socket
 * for the same state.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

/** Slow REST fallback cadence (the server moves a rate at most once per step). */
const POLL_MS = 30000;

interface PayoutState {
  rates: Record<string, number>;
}

export const usePayoutStore = create<PayoutState>(() => ({ rates: {} }));

let timer: ReturnType<typeof setInterval> | null = null;
let refs = 0;
let socketBound = false;

interface PayoutPush {
  payload?: { payouts?: Record<string, number> };
  payouts?: Record<string, number>;
}

function applyPayouts(payouts: Record<string, number> | undefined): void {
  if (!payouts || typeof payouts !== 'object') return;
  usePayoutStore.setState({ rates: payouts });
}

async function refresh(): Promise<void> {
  try {
    const res = await api<{ payouts: Record<string, number> }>('/market/otc/payouts');
    const payouts = res.data?.payouts;
    if (res.status >= 400 || !payouts) return;
    applyPayouts(payouts);
  } catch {
    /* keep the last known rates — this feed must never blank the board */
  }
}

/** Bind the socket push once per page lifetime (NOT per consumer). */
function bindSocket(): void {
  if (socketBound) return;
  socketBound = true;
  socket.emit('join:rt', 'payouts');
  const onPush = (event: PayoutPush) => {
    const payouts = event?.payouts ?? event?.payload?.payouts;
    applyPayouts(payouts as Record<string, number>);
  };
  socket.on('rt:payouts', onPush);
  // Re-join after reconnect so the server room keeps this socket.
  socket.on('connect', () => socket.emit('join:rt', 'payouts'));
}

function start(): void {
  bindSocket();
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
