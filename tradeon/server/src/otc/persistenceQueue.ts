// Single-flight drain: writes cannot overlap or discard ticks after a DB error.
// Ported 1:1 from legacy src/lib/otc/persistenceQueue.js.
export function drainTickQueue<TTick, TCandle>(
  engine: { flushPromise: Promise<number> | null; tickQueue: (TTick | TCandle)[] },
  write: (queue: (TTick | TCandle)[]) => Promise<number>
): Promise<number> {
  if (engine.flushPromise) return engine.flushPromise;
  if (!engine.tickQueue.length) return Promise.resolve(0);
  const queue = engine.tickQueue;
  engine.tickQueue = [];
  engine.flushPromise = Promise.resolve()
    .then(() => write(queue))
    .catch((error: unknown) => {
      // Inserts/upserts are idempotent, so a partially written batch is safe
      // to retry.
      engine.tickQueue = [...queue, ...engine.tickQueue];
      throw error;
    })
    .finally(() => {
      engine.flushPromise = null;
    });
  return engine.flushPromise;
}
