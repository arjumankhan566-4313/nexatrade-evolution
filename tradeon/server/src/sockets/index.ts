import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';
import { attachOtcGateway } from './otc';
import { attachDbHealthGateway } from './dbHealth';
import { attachPerformanceGateway } from './performance';
import { setRealtimeServer } from './realtime';
import { closeRedis } from '../config/redis';
import { verifyToken, isStaff } from '../lib/auth';

/**
 * One Socket.io server with the OTC market gateway attached (the Redis-backed
 * live price engine replaces the Module 1 demo timer). `setRealtimeServer`
 * exposes publish() for admin notification events.
 *
 * Authentication (ported from legacy src/services/websocket.js): sockets
 * authenticate from `?token=` or `auth.token`, then join `user:<id>` and
 * `admins` rooms so the trade engine can deliver `trade:result`, `balance`
 * and `notification` events to the right users.
 */
export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // ── Phase 2 · Step 2 — socket compression ─────────────────────────────
    // The tick payload is already an order of magnitude smaller as a tuple
    // (see microJson.ts); these options compress what is left on every
    // transport that can negotiate compression: the HTTP long-polling
    // fallback (httpCompression) and non-browser clients, which can request
    // per-message deflate over WebSocket. A browser WebSocket cannot ask for
    // the permessage-deflate extension, so browser clients gain from the
    // Micro-JSON tuple, not from the frame compression.
    // The internal event bus is untouched: Redis `otc:ticks` and the in-process
    // engine stream keep their verbose JSON payloads.
    perMessageDeflate: {
      threshold: 256,
      zlibDeflateOptions: { level: 6 },
    },
    httpCompression: { threshold: 256 },
  });

  setRealtimeServer(io);

  // ── Auth middleware (legacy: io.use) ─────────────────────────────────────
  // Reads the JWT from ?token= / auth.token, OR from the nexa_admin /
  // nexa_session cookies (needed for iframe-based preview where the token
  // is in an httpOnly cookie that JS cannot read).
  io.use(async (socket, next) => {
    let token: string | undefined = (socket.handshake.auth?.token || socket.handshake.query?.token) as string | undefined;
    if (!token && socket.handshake.headers.cookie) {
      const cookies = String(socket.handshake.headers.cookie);
      const m = cookies.match(/(?:^|;\s*)nexa_admin=([^;]+)/) || cookies.match(/(?:^|;\s*)nexa_session=([^;]+)/);
      if (m) token = decodeURIComponent(m[1]);
    }
    const payload = await verifyToken(token);
    if (!payload?.sub) {
      socket.data.userId = null;
      socket.data.role = null;
    } else {
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
    }
    next();
  });

  io.on('connection', (socket) => {
    // Join user/admin rooms for trade delivery events.
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`);
    if (socket.data.role && isStaff(socket.data.role)) socket.join('admins');

    // Join realtime event channels (admin notifications, asset updates, etc.)
    socket.on('join:rt', (channel: unknown) => {
      if (typeof channel === 'string' && channel.length > 0 && channel.length < 60) {
        socket.join(`rt:${channel}`);
      }
    });

    // Leave a realtime channel (the client's useLiveEvents emits this on
    // unmount — without it every mount/unmount cycle left a ghost member in
    // the server-side room, an event + memory leak).
    socket.on('leave:rt', (channel: unknown) => {
      if (typeof channel === 'string' && channel.length > 0 && channel.length < 60) {
        socket.leave(`rt:${channel}`);
      }
    });

    socket.emit('server:hello', { service: 'nexatrade-v2-server', at: new Date().toISOString() });
    socket.on('disconnect', () => {});
  });

  const detachOtc = attachOtcGateway(io);
  const detachDbHealth = attachDbHealthGateway(io);
  const detachPerf = attachPerformanceGateway(io);

  return {
    io,
    close: () => {
      detachOtc();
      detachDbHealth();
      detachPerf();
      closeRedis().catch(() => {});
    },
  };
}
