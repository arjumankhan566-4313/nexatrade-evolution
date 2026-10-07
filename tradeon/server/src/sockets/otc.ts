/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE OTC — SOCKET.IO GATEWAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The approved V2 delivery layer replaces the legacy SSE route
 * (/api/market/otc/stream) with Redis pub/sub + Socket.io. The protocol is a
 * 1:1 mapping of the legacy events:
 *
 *   hello    → 'otc:hello'    { serverTime, symbols, timeframe }
 *   snapshot → 'otc:snapshot' { snapshot, status, serverTime }  (per symbol)
 *   replay   → 'otc:replay'   [symbol, [[price,bid,ask,seq,time], …], serverTime]
 *   tick     → 'otc:tick'     [symbol, price, bid, ask, sequence, timestamp,
 *                              candle, closedCandles, serverTime]
 *   ping     → 'otc:ping'    { serverTime, sequences }          (every 15s)
 *
 * The tick source is the Redis `otc:ticks` channel when REDIS_URL is set
 * (multi-process safe); without Redis the gateway subscribes to the engine's
 * in-process stream directly. closedCandles are only attached when a new
 * candle was just finalized — exactly like the legacy route.
 *
 * Phase 2 · Step 2 — `otc:tick` and `otc:replay` are Micro-JSON tuples (see
 * microJson.ts) so the hot feed travels far smaller. The internal event bus is
 * untouched: Redis `otc:ticks` and the in-process stream stay verbose JSON.
 */
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { encodeTick, encodeReplay } from './microJson';
import { ensureEngine, getEngine, subscribe, type EngineTick, type OtcEngine } from '../otc/runner';
import {
  getOtcSnapshot,
  otcStatus,
  isOtcSymbol,
  OTC_TIMEFRAMES,
  replayFrom,
} from '../otc/service';
import {
  getRedisSubscriber,
  readLatestTick,
  redisConfigured,
  OTC_TICK_CHANNEL,
} from '../config/redis';

const MAX_SYMBOLS = 8;

interface Connection {
  timeframe: string;
  symbols: Set<string>;
  /** Only delivered finalized timestamps can advance (ring caps at 20). */
  lastFinalizedTime: Map<string, number>;
  heartbeat: NodeJS.Timeout;
  /** Tracks whether this socket currently counts as an active subscriber. */
  counted: boolean;
}

/** Increment the engine's live connection counter. */
function incConnections(engine: OtcEngine | null) {
  if (engine) engine.connectionCount++;
}
/** Decrement the engine's live connection counter (never below zero). */
function decConnections(engine: OtcEngine | null) {
  if (engine) engine.connectionCount = Math.max(0, engine.connectionCount - 1);
}

export function attachOtcGateway(io: SocketIOServer): () => void {
  const connections = new Map<Socket, Connection>();

  const sendTick = (socket: Socket, state: Connection, tick: EngineTick) => {
    if (!state.symbols.has(tick.symbol)) return;
    const engine = getEngine();
    // Redis delivery can lag the local runtime by one or more ticks. Use the
    // candle captured with THIS tick, never a newer in-process close.
    const candleState = tick.candles?.[state.timeframe]
      ?? engine?.runtimes?.get(tick.symbol)?.candles?.get(state.timeframe);
    const finalizedTime = candleState?.finalized?.[candleState.finalized.length - 1]?.time ?? 0;
    const previousTime = state.lastFinalizedTime.get(tick.symbol) ?? 0;
    // Micro-JSON tuple (Phase 2 · Step 2) — the same fields as the keyed
    // payload, encoded by microJson.encodeTick.
    socket.emit(
      'otc:tick',
      encodeTick(
        tick.symbol,
        tick,
        candleState?.current || null,
        // Only include closed candles when a new one was just finalized.
        finalizedTime > previousTime ? (candleState?.finalized?.slice(-2) || []) : [],
        Date.now()
      )
    );
    if (finalizedTime > previousTime) state.lastFinalizedTime.set(tick.symbol, finalizedTime);
  };

  // ── tick source: Redis pub/sub when available, else in-process engine ──────
  let detachInProcess: (() => void) | null = null;
  if (redisConfigured()) {
    const sub = getRedisSubscriber();
    if (sub) {
      // Subscribe only once the connection is writable (enableOfflineQueue is
      // false, so an eager subscribe fails). 'ready' also re-fires after a
      // reconnect, and re-subscribing an active channel is a no-op.
      const subscribeChannel = () => {
        sub.subscribe(OTC_TICK_CHANNEL).catch((err) => {
          console.warn('[otc:gateway] redis subscribe failed:', (err as Error).message);
        });
      };
      if (sub.status === 'ready') subscribeChannel();
      else sub.on('ready', subscribeChannel);
      sub.on('message', (_channel: string, message: string) => {
        try {
          const tick = JSON.parse(message) as EngineTick;
          for (const [socket, state] of connections) {
            sendTick(socket, state, tick);
          }
        } catch {
          /* a malformed message must never break the gateway */
        }
      });
    }
  } else {
    // The engine singleton may not exist yet at gateway-attach time (it boots
    // right after the HTTP server); subscribe once it is up.
    ensureEngine()
      .then(() => {
        detachInProcess = subscribe((tick) => {
          for (const [socket, state] of connections) {
            sendTick(socket, state, tick);
          }
        });
      })
      .catch(() => {});
  }

  io.on('connection', (socket) => {
    const state: Connection = {
      timeframe: '1m',
      symbols: new Set(),
      lastFinalizedTime: new Map(),
      counted: false,
      heartbeat: setInterval(() => {
        if (!state.symbols.size) return;
        const engine = getEngine();
        const sequences: Record<string, number> = {};
        for (const symbol of state.symbols) {
          const runtime = engine?.runtimes?.get(symbol);
          if (runtime) sequences[symbol] = runtime.state.sequence;
        }
        socket.emit('otc:ping', { serverTime: Date.now(), sequences });
      }, 15_000),
    };
    connections.set(socket, state);

    socket.on('otc:subscribe', async (payload: { symbols?: string[]; timeframe?: string; since?: number }) => {
      const timeframe = OTC_TIMEFRAMES.some((t) => t.value === (payload?.timeframe || '1m'))
        ? (payload?.timeframe as string)
        : '1m';
      const symbols = (payload?.symbols || [])
        .map((s: string) => String(s).trim().toUpperCase())
        .filter((s: string) => s && isOtcSymbol(s))
        .slice(0, MAX_SYMBOLS);
      const since = Number(payload?.since) || 0;

      state.timeframe = timeframe;
      state.symbols = new Set(symbols);
      state.lastFinalizedTime.clear();

      // Track active OTC subscribers for the admin console subscriber count.
      if (symbols.length > 0 && !state.counted) {
        incConnections(getEngine());
        state.counted = true;
      } else if (symbols.length === 0 && state.counted) {
        decConnections(getEngine());
        state.counted = false;
      }

      socket.emit('otc:hello', { serverTime: Date.now(), symbols, timeframe });

      await ensureEngine().catch(() => {});

      // ── 1. authoritative snapshot per instrument ─────────────────────────
      for (const symbol of symbols) {
        const [snapshot, status] = await Promise.all([
          getOtcSnapshot(symbol, timeframe).catch(() => null),
          otcStatus(symbol).catch(() => null),
        ]);
        if (snapshot) socket.emit('otc:snapshot', { snapshot, status, serverTime: Date.now() });
      }

      // ── 2. replay anything the reconnecting client missed ─────────────────
      if (since > 0) {
        for (const symbol of symbols) {
          const ticks = replayFrom(symbol, since);
          if (ticks?.length) {
            socket.emit('otc:replay', encodeReplay(symbol, ticks, Date.now()));
          } else {
            // Ring expired — deliver the freshest cached tick if it is newer
            // than the client's last sequence.
            const latest = await readLatestTick(symbol).catch(() => null);
            if (latest && latest.sequence > since) {
              socket.emit('otc:replay', encodeReplay(symbol, [latest], Date.now()));
            }
          }
        }
      }
    });

    socket.on('otc:unsubscribe', () => {
      state.symbols.clear();
      state.lastFinalizedTime.clear();
      if (state.counted) {
        decConnections(getEngine());
        state.counted = false;
      }
    });

    socket.on('disconnect', () => {
      clearInterval(state.heartbeat);
      if (state.counted) {
        decConnections(getEngine());
        state.counted = false;
      }
      connections.delete(socket);
    });
  });

  return () => {
    detachInProcess?.();
    for (const [, state] of connections) clearInterval(state.heartbeat);
    connections.clear();
  };
}
