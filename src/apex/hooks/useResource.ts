import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResourceState } from '../providers/types';

/**
 * Loads a provider call into loading / ready / error state with a retry hook.
 * Stale resolutions are discarded, so switching inputs never paints old data.
 */
export function useResource<T>(loader: () => Promise<T>, key = ''): ResourceState<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<ResourceState<T>['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);

    loaderRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(cause instanceof Error ? cause.message : 'Unexpected provider failure.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { data, status, error, reload };
}
