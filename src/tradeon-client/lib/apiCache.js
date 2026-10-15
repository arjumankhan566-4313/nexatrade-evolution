/** In-memory, session-scoped stale-while-revalidate snapshots for dashboard read models. */
const DEFAULT_TTL = 30_000;
const REVALIDATE_AT = 0.8;
const cache = new Map();
const inFlight = new Map();
const listeners = new Map();

export function getCached(key) {
  return cache.get(key)?.data;
}

export function isStale(key) {
  const entry = cache.get(key);
  return !entry || Date.now() >= entry.revalidateAt;
}

function notify(key) {
  listeners.get(key)?.forEach((callback) => callback(getCached(key)));
}

export function setCached(key, data, ttl = DEFAULT_TTL) {
  const now = Date.now();
  // A mutation/newer snapshot must supersede any older GET still in flight.
  inFlight.delete(key);
  cache.set(key, { data, expiresAt: now + ttl, revalidateAt: now + ttl * REVALIDATE_AT });
  notify(key);
}

export function invalidate(key) {
  const keys = key instanceof RegExp ? new Set([...cache.keys(), ...inFlight.keys()]) : [key];
  for (const candidate of keys) {
    if (key instanceof RegExp) {
      key.lastIndex = 0;
      if (!key.test(candidate)) continue;
    }
    cache.delete(candidate);
    inFlight.delete(candidate);
    notify(candidate);
  }
}

/** Also detaches pending reads so an old session cannot repopulate the cache. */
export function invalidateAll() {
  cache.clear();
  inFlight.clear();
  for (const key of listeners.keys()) notify(key);
}

function fetchFresh(key, fetcher, ttl) {
  if (inFlight.has(key)) return inFlight.get(key);
  const request = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      if (inFlight.get(key) === request) setCached(key, data, ttl);
      return data;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  // Store pending requests even on a cold cache (including warmup + page mount).
  inFlight.set(key, request);
  return request;
}

export function cachedFetch(key, fetcher, { ttl = DEFAULT_TTL, forceRefresh = false } = {}) {
  const entry = cache.get(key);
  if (!entry || forceRefresh) return fetchFresh(key, fetcher, ttl);
  if (isStale(key)) fetchFresh(key, fetcher, ttl).catch(() => {});
  // Even an expired snapshot paints immediately; a failed refresh keeps it intact.
  return Promise.resolve(entry.data);
}

export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  const callbacks = listeners.get(key);
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
    if (!callbacks.size) listeners.delete(key);
  };
}

export function prefetchApi(key, fetcher, { ttl = DEFAULT_TTL } = {}) {
  return cachedFetch(key, fetcher, { ttl }).catch(() => null);
}
