/**
 * Micro-JSON encoder for the live OTC feed (Phase 2 · Step 2).
 *
 * The hot socket path (500 ms ticks + reconnect replays) travels as positional
 * tuples instead of keyed objects — the same information in far fewer bytes.
 * Only the SOCKET delivery layer is encoded here: the internal event bus
 * (Redis `otc:ticks` channel / in-process `subscribe()`) keeps the verbose
 * EngineTick JSON, which stays the readable source of truth.
 *
 *   otc:tick   → [symbol, price, bid, ask, sequence, timestamp,
 *                 candle|null, closedCandles, serverTime]
 *   candle     → [time, open, high, low, close, tickCount, finalized]
 *   otc:replay → [symbol, [[price, bid, ask, sequence, timestamp], …], serverTime]
 *
 * `otc:hello`, `otc:snapshot` and `otc:ping` stay keyed JSON: they are cold
 * (once per subscribe, and every 15 s) and must stay self-describing.
 */

export interface WireCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickCount?: number;
  finalized?: boolean;
}

export interface WireTick {
  price: number;
  bid: number;
  ask: number;
  sequence: number;
  timestamp: number;
}

export type CandleTuple = [number, number, number, number, number, number, boolean];
export type TickTuple = [string, number, number, number, number, number, (CandleTuple | null), CandleTuple[], number];
export type ReplayTuple = [string, [number, number, number, number, number][], number];

/** Candle → [time, open, high, low, close, tickCount, finalized] */
export function encodeCandle(candle: WireCandle | null | undefined): CandleTuple | null {
  if (!candle) return null;
  return [
    candle.time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.tickCount ?? 0,
    candle.finalized === true,
  ];
}

/** One live tick, with the candle snapshot captured with that exact tick. */
export function encodeTick(
  symbol: string,
  tick: WireTick,
  candle: WireCandle | null | undefined,
  closedCandles: WireCandle[],
  serverTime: number
): TickTuple {
  return [
    symbol,
    tick.price,
    tick.bid,
    tick.ask,
    tick.sequence,
    tick.timestamp,
    encodeCandle(candle),
    closedCandles.map((c) => encodeCandle(c) as CandleTuple),
    serverTime,
  ];
}

/** Reconnect catch-up burst: [symbol, [[price, bid, ask, sequence, time], …], serverTime] */
export function encodeReplay(symbol: string, ticks: WireTick[], serverTime: number): ReplayTuple {
  return [
    symbol,
    ticks.map((t) => [t.price, t.bid, t.ask, t.sequence, t.timestamp] as [number, number, number, number, number]),
    serverTime,
  ];
}
