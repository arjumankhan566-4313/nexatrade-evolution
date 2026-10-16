/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — PAYOUT BROADCASTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pushes the live derived payout map over `rt:payouts` on the same cadence
 * as the derivation step (PAYOUT_STEP_MS), so every open terminal, market
 * list and trade ticket sees an admin-tuned rate move within ~1 step with NO
 * page reload and NO polling. The REST `/payouts` endpoint stays as the
 * cold-start / reconnect fallback for clients that join mid-step.
 *
 * Kept in its own module so `otc/payouts.ts` stays a pure function with no
 * socket import (avoids a circular dependency through sockets/realtime).
 */
import { publish } from '../sockets/realtime';
import { livePayoutMap, PAYOUT_STEP_MS } from './payouts';

let payoutTimer: NodeJS.Timeout | null = null;
let lastPayoutStep = -1;

function broadcastPayouts(): void {
  try {
    const step = Math.floor(Date.now() / PAYOUT_STEP_MS);
    if (step === lastPayoutStep) return;
    lastPayoutStep = step;
    publish('payouts', { payouts: livePayoutMap(), stepMs: PAYOUT_STEP_MS, serverTime: Date.now() });
  } catch {
    /* a broken broadcast must never break the loop */
  }
}

/** Start the payout broadcast loop (aligns to PAYOUT_STEP_MS boundaries). */
export function startPayoutBroadcaster(): void {
  if (payoutTimer) return;
  const now = Date.now();
  const firstIn = PAYOUT_STEP_MS - (now % PAYOUT_STEP_MS) + 50;
  const tick = () => {
    broadcastPayouts();
    payoutTimer = setTimeout(tick, PAYOUT_STEP_MS);
    if (typeof payoutTimer.unref === 'function') (payoutTimer as unknown as { unref(): void }).unref();
  };
  payoutTimer = setTimeout(tick, Math.max(50, firstIn));
  if (typeof payoutTimer.unref === 'function') (payoutTimer as unknown as { unref(): void }).unref();
}

/** Stop the payout broadcast loop (graceful shutdown). */
export function stopPayoutBroadcaster(): void {
  if (payoutTimer) {
    clearTimeout(payoutTimer);
    payoutTimer = null;
  }
}
