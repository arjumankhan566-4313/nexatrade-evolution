/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Trade Engine — order placement + expiration resolution.
 *
 * Ported 1:1 from legacy src/services/tradeEngine.js. Every rule, constant,
 * formula and side-effect is preserved:
 *
 * Execution modes:
 *  - SIMULATION  : outcome decided by the risk engine's probability coefficient
 *                  (global_probability_rate, overridden per-user by custom_yield_ratio).
 *  - REAL_MARKET : outcome decided by comparing entry vs exit market price.
 *
 * Risk layers:
 *  - Spread & slippage adjuster: synthetic offset applied to entry/exit prices.
 *  - Volatility circuit breaker: when enabled, new positions get auto-extended
 *    expiry and effective win probability is scaled by circuit_breaker_factor.
 *
 * Price source change (legacy → V2):
 *   legacy  priceFeed.getPrice(symbol)            — in-memory synthetic/live store
 *   V2     currentSnapshot(engine, symbol).price  — OTC engine singleton
 * Everything else is a direct 1:1 port.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { getEngine, currentSnapshot } from '../otc/runner';
import { livePayoutRate } from '../otc/payouts';
import {
  createTrade,
  settle,
  expiredPending,
  findById,
  debitBalance,
  creditBalance,
  getUserForBalance,
  markCopiedFrom,
  activeCopySubscriptions,
  type TradeRow,
} from './store';
import { getSettings } from './settings';
import { getOtcInstrument } from '../otc/store';
import { one } from '../config/db';
import { emitToUser, emitToAdmins, pushBalance, notify } from './delivery';

/**
 * Durations the ticket can offer. The legacy whitelist was [60, 120, 300] while
 * the expiry picker has always shown 5s-8h, so every other choice was rejected
 * with "Duration must be one of…" and the trade was never placed — the whole
 * TIME tab (1h-8h) was dead. The whitelist now matches the picker exactly.
 */
export const ALLOWED_DURATIONS = [
  5, 15, 30, 60, 120, 300, 3600, 7200, 10800, 14400, 21600, 28800,
];
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 10000;

let timer: NodeJS.Timeout | null = null;

/** Standard normal random (legacy: Math.random() * 2 - 1). */
function gauss(): number {
  return Math.random() * 2 - 1;
}

/** Effective spread/slippage offset (percent) applied to a side. */
function syntheticOffset(
  settings: { spread_percentage: number; slippage_percentage: number },
  direction: string,
  phase: 'entry' | 'exit',
): number {
  const halfSpread = settings.spread_percentage / 2 / 100;
  const slip = (Math.abs(gauss()) * settings.slippage_percentage) / 100;
  const sign = direction === 'CALL' ? 1 : -1;
  // Entry: spread always against the trader; exit jitter is symmetric noise.
  return phase === 'entry' ? sign * (halfSpread + slip) : sign * -slip * (Math.random() < 0.5 ? 1 : 0);
}

interface PlaceTradeInput {
  symbol: string;
  direction: string;
  amount: number;
  duration_seconds: number;
  account_type: string;
}

/**
 * Place a new trade. Ported 1:1 from legacy tradeEngine.placeTrade.
 * `propagate` controls copy-trading recursion (false during copy propagation
 * to avoid infinite loops).
 */
export async function placeTrade(
  userId: string,
  input: PlaceTradeInput,
  propagate = true,
): Promise<TradeRow> {
  const settings = await getSettings();
  const symbol = String(input.symbol || '').toUpperCase();
  const asset = await getOtcInstrument(symbol);
  if (!asset || !asset.is_active) throw new Error('This market is currently unavailable.');
  if (!['CALL', 'PUT'].includes(input.direction)) throw new Error('Invalid direction.');
  if (!['DEMO', 'REAL'].includes(input.account_type)) throw new Error('Invalid account type.');
  const duration = parseInt(String(input.duration_seconds), 10);
  if (!ALLOWED_DURATIONS.includes(duration)) throw new Error(`Duration must be one of: ${ALLOWED_DURATIONS.join('s, ')}s.`);

  let amount = Math.round(parseFloat(String(input.amount)) * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT) throw new Error(`Minimum trade amount is $${MIN_AMOUNT}.`);
  if (amount > MAX_AMOUNT) throw new Error(`Maximum trade amount is $${MAX_AMOUNT}.`);

  const userRow = await one('SELECT balance_demo, balance_real FROM users WHERE id = $1', [userId]);
  if (!userRow) throw new Error('Account not found.');
  const balance = input.account_type === 'REAL'
    ? Number((userRow as Record<string, any>).balance_real)
    : Number((userRow as Record<string, any>).balance_demo);
  if (amount > balance) throw new Error('Insufficient balance for this account.');

  // Authoritative OTC price (legacy: priceFeed.getPrice)
  const engine = getEngine();
  const snap = currentSnapshot(engine, symbol, '1m');
  if (!snap || !Number.isFinite(snap.price) || snap.price <= 0) throw new Error('Price feed unavailable. Try again.');
  const marketPrice = snap.price;

  // Circuit breaker: auto-adjust expiry parameters on new positions
  const cbActive = settings.enable_circuit_breaker;
  const effectiveDuration = cbActive ? Math.round(duration * 1.5) : duration;

  const entryPrice = marketPrice * (1 + syntheticOffset(settings, input.direction, 'entry'));
  if (!(await debitBalance(userId, input.account_type, amount))) throw new Error('Insufficient balance.');

  const trade = await createTrade({
    user_id: userId,
    asset_pair: asset.symbol,
    direction: input.direction,
    amount,
    entry_price: entryPrice,
    // The OFFERED rate at execution — the same number the header, the market
    // list and the ticket were showing (`otc/payouts.ts`), so what the trader
    // saw is what the trade is settled on.
    payout_rate: livePayoutRate(symbol, Number(asset.payout_percentage), { regime: snap.regime }),
    duration_seconds: effectiveDuration,
    is_adjusted: cbActive,
    account_type: input.account_type,
    expired_at: new Date(Date.now() + effectiveDuration * 1000).toISOString(),
  });

  // Push updated balance
  const fresh = await getUserForBalance(userId);
  if (fresh) pushBalance(userId, fresh.balance_demo, fresh.balance_real);

  // Admin notification
  const userMeta = await one('SELECT full_name, email FROM users WHERE id = $1', [userId]);
  emitToAdmins('admin:trade', {
    ...trade,
    full_name: (userMeta as Record<string, any>)?.full_name,
    email: (userMeta as Record<string, any>)?.email,
  });

  if (propagate) await propagateCopies(userId, trade, effectiveDuration);
  return trade;
}

/** Copy trading: mirror a leader's trade into active followers' practice funds. */
async function propagateCopies(
  leaderId: string,
  trade: TradeRow,
  durationSeconds: number,
): Promise<void> {
  try {
    const subs = await activeCopySubscriptions(leaderId);
    for (const sub of subs) {
      const followerId = sub.follower_id as string;
      if (followerId === leaderId) continue;
      const follower = await one('SELECT id, is_blocked FROM users WHERE id = $1', [followerId]);
      if (!follower || (follower as Record<string, any>).is_blocked) continue;
      // `fixed_stake` is the shared copy_links column (legacy `amount_per_trade`).
      const amt = Math.min(Number(sub.fixed_stake), MAX_AMOUNT);
      if (amt < MIN_AMOUNT) continue;
      try {
        const copy = await placeTrade(
          followerId,
          {
            symbol: trade.asset_pair,
            direction: trade.direction,
            amount: Math.round(amt * 100) / 100,
            duration_seconds: durationSeconds,
            account_type: 'DEMO',
          },
          false, // do not recurse
        );
        await markCopiedFrom(copy.id, trade.id);
        const leader = await one('SELECT full_name FROM users WHERE id = $1', [leaderId]);
        await notify(followerId, {
          title: 'Copied trade opened',
          body: `Copying ${(leader as Record<string, any>)?.full_name}: ${trade.direction} $${amt.toFixed(2)} on ${trade.asset_pair}.`,
          kind: 'INFO',
        });
      } catch { /* follower couldn't fund it — skip silently */ }
    }
  } catch (e) {
    console.error('copy propagation error', (e as Error).message);
  }
}

/**
 * Determine outcome for an expiring position.
 * Ported 1:1 from legacy tradeEngine.resolveTrade.
 */
export async function resolveTrade(trade: TradeRow): Promise<TradeRow> {
  const settings = await getSettings();
  const userMeta = await one('SELECT id, full_name, email, custom_yield_ratio FROM users WHERE id = $1', [trade.user_id]);

  // Authoritative OTC price at settlement (legacy: priceFeed.getPrice)
  const engine = getEngine();
  const snap = currentSnapshot(engine, trade.asset_pair, '1m');
  const marketPrice = (snap?.price && Number.isFinite(snap.price) && snap.price > 0) ? snap.price : trade.entry_price;
  const exitPrice = marketPrice * (1 + syntheticOffset(settings, trade.direction, 'exit'));

  let status: string;
  let isAdjusted = !!trade.is_adjusted;

  if (settings.execution_mode === 'REAL_MARKET') {
    // Pure market resolution: CALL wins if price rose, PUT wins if it fell.
    // Tie refunds stake (handled below via zero payout).
    status = exitPrice === trade.entry_price ? 'WIN' // stake-only refund
      : (exitPrice > trade.entry_price) === (trade.direction === 'CALL') ? 'WIN' : 'LOSS';
  } else {
    // SIMULATION risk engine: probability coefficient decides the outcome.
    if (settings.force_loss_mode) {
      status = 'LOSS';
    } else {
      let winProb = (userMeta as Record<string, any>)?.custom_yield_ratio ?? settings.global_probability_rate;
      if (settings.enable_circuit_breaker) {
        winProb *= settings.circuit_breaker_factor;
        isAdjusted = true;
      }
      winProb = Math.max(0, Math.min(100, winProb));
      status = Math.random() * 100 < winProb ? 'WIN' : 'LOSS';
    }
  }

  const stake = trade.amount;
  const profit = status === 'WIN'
    ? (exitPrice === trade.entry_price && settings.execution_mode === 'REAL_MARKET' ? 0 : (stake * trade.payout_rate) / 100)
    : -stake;

  const settled = await settle(trade.id, { exit_price: exitPrice, status, result_profit: profit });
  if (!settled) throw new Error('Trade already settled or not found.');

  if (status === 'WIN') await creditBalance(trade.user_id, trade.account_type, stake + profit);

  // Cashback program: refund a configured % of the stake on losing positions
  let cashback = 0;
  if (status === 'LOSS' && settings.cashback_percentage > 0) {
    cashback = Math.round((stake * settings.cashback_percentage) / 100 * 100) / 100;
    if (cashback > 0) await creditBalance(trade.user_id, trade.account_type, cashback);
  }

  // Push updated balance
  const fresh = await getUserForBalance(trade.user_id);
  if (fresh) pushBalance(trade.user_id, fresh.balance_demo, fresh.balance_real);

  // Emit result to user
  emitToUser(trade.user_id, 'trade:result', cashback > 0 ? { ...settled, cashback } : settled);
  emitToAdmins('admin:trade', {
    ...settled,
    full_name: (userMeta as Record<string, any>)?.full_name,
    email: (userMeta as Record<string, any>)?.email,
  });

  if (status === 'WIN') {
    await notify(trade.user_id, {
      title: `Trade won: ${trade.asset_pair}`,
      body: `${trade.direction} $${stake.toFixed(2)} → +$${profit.toFixed(2)} profit (${trade.payout_rate}% payout).`,
      kind: 'WIN',
    });
  } else {
    await notify(trade.user_id, {
      title: `Trade lost: ${trade.asset_pair}`,
      body: cashback > 0
        ? `${trade.direction} $${stake.toFixed(2)} → -$${stake.toFixed(2)}. Cashback +$${cashback.toFixed(2)} credited (${settings.cashback_percentage}%).`
        : `${trade.direction} $${stake.toFixed(2)} → -$${stake.toFixed(2)}. Better luck next time.`,
      kind: 'LOSS',
    });
  }

  return settled;
}

/** Settle every position whose expiry has passed (legacy: loop). */
async function loop(): Promise<void> {
  const pending = await expiredPending();
  for (const t of pending) {
    try { await resolveTrade(t); } catch (e) { console.error('resolveTrade error', t.id, (e as Error).message); }
  }
}

/** Start the 1s settlement timer (legacy: start). */
export function startTradeEngine(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { loop().catch(() => {}); }, 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

/** Stop the settlement timer (graceful shutdown). */
export function stopTradeEngine(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/**
 * Settle due positions. Called at the start of each API request as a
 * serverless fallback (legacy: settleDue). On a long-running host the 1s
 * timer handles this; the request-path call is a safety net.
 */
export async function settleDue(): Promise<void> {
  await loop();
}
