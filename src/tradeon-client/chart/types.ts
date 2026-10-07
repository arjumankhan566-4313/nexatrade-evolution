/**
 * Shared types for the custom HTML5 Canvas charting module.
 *
 * Candle and tick shapes mirror the server OTC gateway contract 1:1
 * (see platform-v2/server/src/sockets/otc.ts), so the client never redefines
 * candle formation — it consumes the authoritative engine candle directly.
 */
export interface Candle {
  time: number;
  startTime?: number;
  endTime?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: null;
  tickCount: number;
  finalized: boolean;
}

/** Server `otc:tick` payload (subset the chart consumes). */
export interface OtcTick {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  sequence: number;
  timestamp: number;
  candle: Candle | null;
  closedCandles?: Candle[];
  serverTime: number;
}

/** Server `otc:snapshot` payload (subset). */
export interface OtcSnapshotPayload {
  snapshot: {
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    sequence: number;
    currentCandle: Candle | null;
    sessionStatus: string;
    tradingStatus: string;
  } | null;
  status: { status?: string } | null;
  serverTime: number;
}

export interface OtcHelloPayload {
  serverTime: number;
  symbols: string[];
  timeframe: string;
}

export interface OtcReplayPayload {
  symbol: string;
  ticks: { price: number; bid: number; ask: number; sequence: number; timestamp: number }[];
  serverTime: number;
}

/* ── Micro-JSON wire tuples (Phase 2 · Step 2) ───────────────────────────────
   The live OTC socket feed travels as positional tuples: the same 500 ms tick
   costs roughly half the bytes of keyed JSON. The server encoder lives in
   platform-v2/server/src/sockets/microJson.ts; these parsers are the ONLY
   place the client touches the wire shape, so the rest of the app keeps the
   readable Candle / OtcTick objects. */

export type CandleTuple = [number, number, number, number, number, number, boolean];
export type ReplayTickTuple = [number, number, number, number, number];
/** [symbol, price, bid, ask, sequence, timestamp, candle, closedCandles, serverTime] */
export type OtcTickTuple = [
  string,
  number,
  number,
  number,
  number,
  number,
  CandleTuple | null,
  CandleTuple[],
  number,
];
/** [symbol, [[price, bid, ask, sequence, timestamp], …], serverTime] */
export type OtcReplayTuple = [string, ReplayTickTuple[], number];

/** [time, open, high, low, close, tickCount, finalized] → Candle */
export function candleFromTuple(t: CandleTuple | null | undefined): Candle | null {
  if (!t) return null;
  return {
    time: t[0],
    open: t[1],
    high: t[2],
    low: t[3],
    close: t[4],
    tickCount: t[5],
    finalized: t[6],
  };
}

export function parseOtcTick(t: OtcTickTuple): OtcTick {
  return {
    symbol: t[0],
    price: t[1],
    bid: t[2],
    ask: t[3],
    sequence: t[4],
    timestamp: t[5],
    candle: candleFromTuple(t[6]),
    closedCandles: (t[7] || []).map(candleFromTuple).filter((c): c is Candle => c !== null),
    serverTime: t[8],
  };
}

export function parseOtcReplay(t: OtcReplayTuple): OtcReplayPayload {
  return {
    symbol: t[0],
    ticks: (t[1] || []).map((r) => ({
      price: r[0],
      bid: r[1],
      ask: r[2],
      sequence: r[3],
      timestamp: r[4],
    })),
    serverTime: t[2],
  };
}

/**
 * An anchored overlay is stored in DATA coordinates (candle index + price),
 * never pixels. The render engine transforms it every frame via indexToX /
 * priceToY, so the mark stays glued to its candle through zoom and pan.
 */
export interface OverlayLine {
  id: string;
  price: number;
  color: string;
  label: string;
  dashed?: boolean;
  /**
   * Candle index the mark is anchored to. When set, the engine only lets the
   * line's price influence the Y scale while that candle is on screen —
   * otherwise a mark panned far off-view would stretch the axis and squash the
   * visible candles. Undefined = always counted.
   */
  index?: number;
}

export interface OverlayDot {
  id: string;
  /** Index into the live candle array — moves with its candle. */
  index: number;
  price: number;
  color: string;
  hollow?: boolean;
  label?: string;
}

export interface ChartOverlays {
  lines: OverlayLine[];
  dots: OverlayDot[];
}

export interface ChartTheme {
  bg: string;
  grid: string;
  axisText: string;
  up: string;
  down: string;
  priceLine: string;
  priceLabelBg: string;
  priceLabelText: string;
  crosshair: string;
  crosshairText: string;
}

export const DEFAULT_THEME: ChartTheme = {
  bg: '#0b0e11',
  grid: '#1a2230',
  axisText: '#8b95a7',
  // Binance's own candle palette (the trade panel uses the same pair), so the
  // series reads exactly like the exchange the owner asked us to match.
  up: '#0ecb81',
  down: '#f6465d',
  priceLine: '#ffffff',
  priceLabelBg: '#2986ff',
  priceLabelText: '#ffffff',
  crosshair: '#5b6677',
  crosshairText: '#c7ccd6',
};
