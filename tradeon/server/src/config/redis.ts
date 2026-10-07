/**
 * Redis plumbing for the V2 live-price pipeline (approved architecture:
 * engine → Redis pub/sub → Socket.io gateway).
 *
 * • `publishOtcTick` — every authoritative engine tick is cached (latest per
 *   symbol, 60s TTL) and fanned out on the `otc:ticks` channel, so any number
 *   of API processes receive the SAME stream.
 * • `readLatestTick` — fast reconnect catch-up when a client's replay ring
 *   has expired but a fresh tick is still cached.
 *
 * When REDIS_URL is empty the module degrades to a no-op and the Socket.io
 * gateway falls back to the engine's in-process subscription — the engine
 * itself never depends on Redis.
 */
import Redis from 'ioredis';
import { env } from './env';
import type { EngineTick } from '../otc/runner';

export const OTC_TICK_CHANNEL = 'otc:ticks';
const LATEST_KEY = (symbol: string) => `otc:latest:${symbol}`;
const LATEST_TTL_SECONDS = 60;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

export function redisConfigured(): boolean {
  return Boolean(env.redisUrl);
}

function createClient(): Redis {
  return new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

export function getRedisPublisher(): Redis | null {
  if (!redisConfigured()) return null;
  if (!publisher) {
    publisher = createClient();
    publisher.connect().catch((err) => {
      console.warn('[redis] publisher connect failed:', (err as Error).message);
    });
  }
  return publisher;
}

export function getRedisSubscriber(): Redis | null {
  if (!redisConfigured()) return null;
  if (!subscriber) {
    subscriber = createClient();
    subscriber.connect().catch((err) => {
      console.warn('[redis] subscriber connect failed:', (err as Error).message);
    });
  }
  return subscriber;
}

/** Cache the latest tick per symbol and fan it out (best-effort). */
export async function publishOtcTick(tick: EngineTick): Promise<void> {
  const client = getRedisPublisher();
  if (!client) return;
  try {
    const payload = JSON.stringify(tick);
    await Promise.all([
      client.set(LATEST_KEY(tick.symbol), payload, 'EX', LATEST_TTL_SECONDS),
      client.publish(OTC_TICK_CHANNEL, payload),
    ]);
  } catch {
    /* delivery is best-effort; the database checkpoint is authoritative */
  }
}

/** Latest cached tick for a symbol, or null. */
export async function readLatestTick(symbol: string): Promise<EngineTick | null> {
  const client = getRedisPublisher();
  if (!client) return null;
  try {
    const raw = await client.get(LATEST_KEY(String(symbol).toUpperCase()));
    return raw ? (JSON.parse(raw) as EngineTick) : null;
  } catch {
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  await Promise.all([
    publisher?.quit().catch(() => {}),
    subscriber?.quit().catch(() => {}),
  ]);
  publisher = null;
  subscriber = null;
}
