import { useCallback, useEffect, useRef, useState } from 'react';
import { api, useLiveEvents } from '../lib/legacyInfra';

/** Read live admin state without blanking the catalogue on each refresh. */
export function useAdminOtcConsole() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await api('/api/admin/otc', { signal: controller.signal });
      if (!controller.signal.aborted) {
        setData(result);
        setError(null);
      }
    } catch (err: any) {
      if (!controller.signal.aborted) setError(err?.message || 'Failed to load OTC console.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, []);

  useLiveEvents({ scope: 'admin', topics: ['assets', 'settings'], onEvent: () => { void load(); } });

  useEffect(() => {
    void load();
    // Do not overlap reads or poll background tabs; resume on the next interval.
    const timer = setInterval(() => {
      if (!document.hidden && !request.current) void load();
    }, 3000);
    return () => {
      clearInterval(timer);
      request.current?.abort();
      request.current = null;
    };
  }, [load]);

  return { data, loading, error, load };
}
