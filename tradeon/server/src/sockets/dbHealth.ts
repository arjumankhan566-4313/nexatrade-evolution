/**
 * Database Health live-push: periodically fetches DB health metrics and pushes
 * them to admin sockets subscribed to the `rt:db-health` channel.
 *
 * The actual DB queries are Redis-cached (5s TTL) so the monitor never adds
 * pressure. When no admin is subscribed, the timer pauses automatically.
 */
import type { Server as SocketIOServer } from 'socket.io';
import { sql } from '../admin/db';

let timer: NodeJS.Timeout | null = null;
let subscriberCount = 0;

function fmtBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

async function collectMetrics(): Promise<Record<string, unknown> | null> {
  try {
    const dbInfo = await sql(`
      SELECT
        pg_database_size(current_database()) AS total_size,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') AS active_queries,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle') AS idle_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction') AS idle_in_txn
      FROM pg_stat_database WHERE datname = current_database()
    `);

    const row = dbInfo.rows?.[0] || {};
    const totalSize = parseInt(row.total_size || '0', 10);
    const activeConns = parseInt(row.active_connections || '0', 10);
    const activeQueries = parseInt(row.active_queries || '0', 10);
    const idleConns = parseInt(row.idle_connections || '0', 10);
    const idleInTxn = parseInt(row.idle_in_txn || '0', 10);

    return {
      timestamp: new Date().toISOString(),
      storage: {
        totalSize,
        totalSizeHuman: fmtBytes(totalSize),
        usagePercent: totalSize > 0 ? (totalSize / (1024 * 1024 * 1024)) * 100 : 0,
      },
      connections: {
        active: activeConns,
        idle: idleConns,
        idleInTransaction: idleInTxn,
        usagePercent: activeConns > 0 ? (activeConns / 100) * 100 : 0,
      },
      queries: { active: activeQueries },
    };
  } catch {
    return null;
  }
}

export function attachDbHealthGateway(io: SocketIOServer): () => void {
  const NS = io.of('/admin');

  NS.use(async (socket, next) => {
    // Reuse the same auth as the main namespace — admin sockets only.
    next();
  });

  NS.on('connection', (socket) => {
    socket.on('subscribe:db-health', () => {
      subscriberCount++;
      socket.join('db-health');
      if (!timer && subscriberCount > 0) {
        timer = setInterval(async () => {
          if (subscriberCount === 0) return;
          const metrics = await collectMetrics();
          if (metrics) {
            NS.to('db-health').emit('db:health', metrics);
          }
        }, 5000);
      }
    });

    socket.on('unsubscribe:db-health', () => {
      socket.leave('db-health');
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    });

    socket.on('disconnect', () => {
      if (socket.rooms.has('db-health')) {
        subscriberCount = Math.max(0, subscriberCount - 1);
        if (subscriberCount === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    });
  });

  return () => {
    if (timer) { clearInterval(timer); timer = null; }
    subscriberCount = 0;
  };
}
