
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cachedFetch, getCached, subscribe } from './apiCache';

const serverSnapshot = () => undefined;

/** Read the current key synchronously; old-key responses cannot replace it. */
export function useCachedApi(key, fetcher, { ttl, enabled = true, deps = [] } = {}) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [failure, setFailure] = useState(null);
  const observe = useCallback(callback => enabled ? subscribe(key, callback) : () => {}, [key, enabled]);
  const snapshot = useCallback(() => enabled ? getCached(key) : undefined, [key, enabled]);
  const data = useSyncExternalStore(observe, snapshot, serverSnapshot);
  const error = failure?.key === key ? failure.error : null;

  const load = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;
    const read = fetcherRef.current;
    try {
      const result = await cachedFetch(key, read, { ttl, forceRefresh });
      setFailure(current => current?.key === key ? null : current);
      return result;
    } catch (error) {
      setFailure({ key, error });
    }
  }, [key, ttl, enabled]);

  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => load(true), [load]);
  return { data, isLoading: enabled && data === undefined && !error, error, refresh };
}
