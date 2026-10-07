/**
 * Performance live-push: periodically pushes aggregated performance metrics
 * to admin sockets subscribed to the `rt:perf` channel.
 *
 * When no admin is subscribed, the timer pauses automatically.
 * The collector samples process health + socket stats at 5s intervals.
 * The store writes rollups to Redis at 30s intervals.
 */
import type { Server as SocketIOServer } from 'socket.io';
import { getSnapshot, sampleProcessHealth, sampleSocketStats, setIo } from '../performance/collector';
import { writeRollup } from '../performance/store';
import { getAutoOptimize } from '../performance/store';

let pushTimer: NodeJS.Timeout | null = null;
let sampleTimer: NodeJS.Timeout | null = null;
let rollupTimer: NodeJS.Timeout | null = null;
let autoOptTimer: NodeJS.Timeout | null = null;
let subscriberCount = 0;

export function attachPerformanceGateway(io: SocketIOServer): () => void {
  setIo(io);
  const NS = io.of('/admin');

  NS.on('connection', (socket) => {
    socket.on('subscribe:perf', () => {
      subscriberCount++;
      socket.join('perf');

      if (!sampleTimer) {
        // Sample process health + socket stats every 5s
        sampleTimer = setInterval(() => {
          sampleProcessHealth();
          sampleSocketStats();
        }, 5000);
        // Initial sample
        sampleProcessHealth();
        sampleSocketStats();
      }

      if (!pushTimer) {
        // Push snapshot to subscribers every 3s
        pushTimer = setInterval(() => {
          if (subscriberCount === 0) return;
          const snapshot = getSnapshot();
          NS.to('perf').emit('perf:snapshot', snapshot);
        }, 3000);
        // Immediate first push
        const snapshot = getSnapshot();
        NS.to('perf').emit('perf:snapshot', snapshot);
      }

      if (!rollupTimer) {
        // Write rollups to Redis every 30s
        rollupTimer = setInterval(async () => {
          const snap = getSnapshot();
          for (const range of ['1h', '24h', '7d'] as const) {
            await writeRollup(range, {
              ts: Date.now(),
              apiCount: snap.api.total,
              apiP50: snap.api.p50,
              apiP95: snap.api.p95,
              apiErrors: Math.round((snap.api.errorRate / 100) * snap.api.total),
              rumCount: snap.rum.total,
              rumLcp: snap.rum.admin.lcpP75 || snap.rum.user.lcpP75 || 0,
              rumInp: snap.rum.admin.inpP75 || snap.rum.user.inpP75 || 0,
              rumCls: snap.rum.admin.clsP75 || snap.rum.user.clsP75 || 0,
              speedScore: snap.speedScore,
              rssMB: snap.process?.rssMB || 0,
              cpu: snap.process?.cpuPercent || 0,
              elLag: snap.process?.eventLoopLagMs || 0,
              socketClients: snap.socket?.connectedClients || 0,
            }).catch(() => {});
          }
        }, 30000);
      }

      if (!autoOptTimer) {
        // Auto-optimize check every 15s
        autoOptTimer = setInterval(async () => {
          try {
            const state = await getAutoOptimize();
            if (!state.enabled || !state.rules) return;
            const snap = getSnapshot();
            const now = Date.now();

            for (const rule of state.rules) {
              if (!rule.enabled) continue;
              if (now - (rule.lastRun || 0) < rule.cooldownMs) continue;

              const metricValue = getMetricValue(snap, rule.trigger.metric);
              const triggered = evaluateTrigger(metricValue, rule.trigger);

              if (triggered) {
                // Only safe, non-destructive actions
                if (rule.action === 'cache-refresh') {
                  const { clearCache } = await import('../performance/store');
                  await clearCache('otc:latest:');
                  rule.lastRun = now;
                  NS.to('perf').emit('perf:auto-action', {
                    rule: rule.id,
                    action: rule.action,
                    timestamp: new Date().toISOString(),
                    trigger: `${rule.trigger.metric}=${metricValue} ${rule.trigger.op} ${rule.trigger.value}`,
                  });
                } else if (rule.action === 'cache-warmup') {
                  // Warmup is a no-op in dev (no hot data to preload)
                  rule.lastRun = now;
                  NS.to('perf').emit('perf:auto-action', {
                    rule: rule.id,
                    action: rule.action,
                    timestamp: new Date().toISOString(),
                    trigger: `${rule.trigger.metric}=${metricValue} ${rule.trigger.op} ${rule.trigger.value}`,
                  });
                }
              }
            }

            // Persist updated lastRun times
            await import('../performance/store').then(s => s.setAutoOptimize(state));
          } catch { /* best-effort */ }
        }, 15000);
      }
    });

    socket.on('unsubscribe:perf', () => {
      socket.leave('perf');
      subscriberCount = Math.max(0, subscriberCount - 1);
      cleanupTimers();
    });

    socket.on('disconnect', () => {
      if (socket.rooms.has('perf')) {
        subscriberCount = Math.max(0, subscriberCount - 1);
        cleanupTimers();
      }
    });
  });

  return () => {
    cleanupTimers(true);
  };
}

function cleanupTimers(force = false) {
  if (force || subscriberCount === 0) {
    if (pushTimer) { clearInterval(pushTimer); pushTimer = null; }
    if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
    if (rollupTimer) { clearInterval(rollupTimer); rollupTimer = null; }
    if (autoOptTimer) { clearInterval(autoOptTimer); autoOptTimer = null; }
    if (force) subscriberCount = 0;
  }
}

function getMetricValue(snap: any, metric: string): number {
  switch (metric) {
    case 'apiP95': return snap.api?.p95 || 0;
    case 'rumLcp': return snap.rum?.admin?.lcpP75 || snap.rum?.user?.lcpP75 || 0;
    case 'rumInp': return snap.rum?.admin?.inpP75 || snap.rum?.user?.inpP75 || 0;
    case 'errorRate': return snap.api?.errorRate || 0;
    case 'elLag': return snap.process?.eventLoopLagMs || 0;
    default: return 0;
  }
}

function evaluateTrigger(value: number, trigger: { op: string; value: number }): boolean {
  switch (trigger.op) {
    case '>': return value > trigger.value;
    case '<': return value < trigger.value;
    case '>=': return value >= trigger.value;
    case '<=': return value <= trigger.value;
    default: return false;
  }
}
