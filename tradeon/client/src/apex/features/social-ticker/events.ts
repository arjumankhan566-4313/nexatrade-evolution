/**
 * Event model + generator for the live social ticker.
 *
 * In DEMO_MODE the ticker fabricates realistic-looking activity from the data
 * below: masked identities, non-round amounts and a deliberately irregular
 * cadence. When DEMO_MODE is off, `toTickerEvent` maps a real socket payload
 * into the same shape so the component needs no change.
 */

import { MASKED_IDENTITIES } from './identities';

export type TickerEventKind = 'profit' | 'deposit' | 'withdrawal';

export type TickerEvent = {
  id: string;
  kind: TickerEventKind;
  /** Masked handle shown in bold. */
  mask: string;
  /** Verb phrase, e.g. "just won" / "deposited" / "withdrew". */
  action: string;
  /** Emphasised value, e.g. "+86% on BTCUSD" / "$1,245.50". */
  value: string;
};

/** Shape of a real platform-activity message on the socket channel. */
export type SocialActivityPayload = {
  kind?: string;
  mask?: string;
  symbol?: string;
  percent?: number;
  amount?: number;
};

/** Display symbols (the `-OTC` suffix is dropped for the ticker copy). */
const MARKETS = [
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'XRPUSD',
  'ADAUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'US30',
  'NASDAQ',
  'TSLA',
  'AAPL',
  'NVDA',
  'AMZN',
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** `1234.5` → `$1,234.50` */
function usd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Non-round payout percentage, always positive. */
function profitPercent(): number {
  return randInt(18, 412);
}

/** Amount with a deliberately uneven cent value so deposits never look staged. */
function depositAmount(): number {
  const whole = randInt(120, 9800);
  const cents = randInt(1, 99); // never .00
  return whole + cents / 100;
}

/** Withdrawals mix round and uneven cents, like a real ledger. */
function withdrawalAmount(): number {
  const whole = randInt(250, 12400);
  const cents = pick([0, 0, 0, 25, 40, 50, 75, 90]);
  return whole + cents / 100;
}

/**
 * Gap before the next toast, drawn from 4–15s. Returned via `Math.random()` so
 * the rhythm is never metronomic — a fixed interval is exactly what reads as
 * fake.
 */
export function randomDelayMs(): number {
  return Math.round(4000 + Math.random() * 11000);
}

/** Build one fabricated activity event. */
export function createTickerEvent(): TickerEvent {
  const identity = pick(MASKED_IDENTITIES);
  // Profit is weighted highest: the ticker exists to show momentum.
  const roll = Math.random();
  const kind: TickerEventKind = roll < 0.5 ? 'profit' : roll < 0.8 ? 'deposit' : 'withdrawal';

  const base = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mask: identity.mask,
  };

  if (kind === 'profit') {
    return {
      ...base,
      kind,
      action: 'just won',
      value: `+${profitPercent()}% on ${pick(MARKETS)}`,
    };
  }
  if (kind === 'deposit') {
    return { ...base, kind, action: 'deposited', value: usd(depositAmount()) };
  }
  return { ...base, kind, action: 'withdrew', value: usd(withdrawalAmount()) };
}

function normalizeKind(kind: string | undefined): TickerEventKind | null {
  if (kind === 'profit' || kind === 'win' || kind === 'payout') return 'profit';
  if (kind === 'deposit') return 'deposit';
  if (kind === 'withdrawal' || kind === 'withdraw') return 'withdrawal';
  return null;
}

/**
 * Map a real socket payload into a `TickerEvent`. Returns null for anything
 * unrecognised so a malformed message is simply ignored.
 */
export function toTickerEvent(payload: SocialActivityPayload): TickerEvent | null {
  const kind = normalizeKind(payload?.kind);
  if (!kind) return null;

  const mask = payload.mask?.trim() || pick(MASKED_IDENTITIES).mask;
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (kind === 'profit') {
    const percent =
      typeof payload.percent === 'number' ? Math.round(payload.percent) : profitPercent();
    const symbol = payload.symbol?.replace(/-OTC$/i, '') || pick(MARKETS);
    return { id, kind, mask, action: 'just won', value: `+${percent}% on ${symbol}` };
  }
  if (kind === 'deposit') {
    return {
      id,
      kind,
      mask,
      action: 'deposited',
      value: usd(typeof payload.amount === 'number' ? payload.amount : depositAmount()),
    };
  }
  return {
    id,
    kind,
    mask,
    action: 'withdrew',
    value: usd(typeof payload.amount === 'number' ? payload.amount : withdrawalAmount()),
  };
}
