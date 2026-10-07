/**
 * Realtime event bus for admin/asset notifications — the Express+Socket.io
 * port of the legacy `publish(channel, payload)` admin SSE helper. Emits on a
 * per-channel room so only subscribed admin sockets receive the event.
 */
import type { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setRealtimeServer(server: SocketIOServer): void {
  io = server;
}

export function getRealtimeServer(): SocketIOServer | null {
  return io;
}

/** Publish an event on a named channel (legacy: publish('assets', {...})). */
export function publish(channel: string, payload: Record<string, unknown>): void {
  if (!io) return;
  try {
    io.to(`rt:${channel}`).emit(`rt:${channel}`, payload);
  } catch {
    /* a broken publish must never break the request */
  }
}
