/**
 * useOtcAssets — the public OTC instrument catalogue.
 *
 * This is the SAME 361-instrument registry the admin OTC console manages
 * (`GET /api/market/otc/assets`), fetched once per page load and shared: the
 * trading panel reads the real name, payout rate and category instead of the
 * old hardcoded per-symbol maps.
 *
 * The category tabs mirror the legacy dashboard market drawer order.
 *
 * `payoutRate` here is the catalogue's rate at fetch time. The rate that is
 * actually OFFERED moves continuously and is read from the shared live feed
 * (`stores/payoutStore`, backed by `GET /api/market/otc/payouts`); this value
 * is only the cold-start fallback for a screen that has not polled yet.
 */
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import { useChartConfigStore } from '../stores/chartConfigStore';

export interface OtcAsset {
  symbol: string;
  name: string;
  category: string; // CRYPTO | STOCK | FOREX | COMMODITY | INDEX
  payoutRate: number;
  digits: number;
  base: string;
  quote: string;
  /** Official bundled artwork URL (company/coin mark, currency flags, …). */
  icon?: string | null;
  sessionStatus?: string;
  engineStatus?: string;
}

/** Drawer tab order — All, then the five catalogue categories. */
export const MARKET_TABS = ['ALL', 'CRYPTO', 'STOCK', 'FOREX', 'INDEX', 'COMMODITY'] as const;
export type MarketTab = (typeof MARKET_TABS)[number];

export const MARKET_TAB_LABELS: Record<MarketTab, string> = {
  ALL: 'All',
  CRYPTO: 'Crypto',
  STOCK: 'Stocks',
  FOREX: 'Currency',
  INDEX: 'Indices',
  COMMODITY: 'Commodities',
};

/** One shared request per page load — the catalogue is public and static. */
let cached: OtcAsset[] | null = null;
let inflight: Promise<OtcAsset[]> | null = null;

/** Bump the catalogue cache when the admin changes an instrument (live sync). */
export function invalidateOtcCatalogue(): void {
  cached = null;
  inflight = null;
}

function loadCatalogue(): Promise<OtcAsset[]> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api<{ assets: OtcAsset[] }>('/market/otc/assets')
      .then((res) => {
        cached = res.data?.assets ?? [];
        return cached;
      })
      .catch(() => [])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useOtcAssets(): { assets: OtcAsset[]; loading: boolean } {
  const [assets, setAssets] = useState<OtcAsset[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    loadCatalogue().then((list) => {
      if (!alive) return;
      setAssets(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Admin→user instant live sync (no page reload): the admin console
  // publishes `rt:assets` on every instrument create/update/status change.
  // Re-fetch the catalogue when it lands so the market list, the ticket
  // header and the panel reflect it within ~1s. `rt:settings` similarly
  // reloads the chart config (countdown pill colour).
  useEffect(() => {
    let alive = true;
    const onAssets = () => {
      if (!alive) return;
      invalidateOtcCatalogue();
      setLoading(true);
      loadCatalogue().then((list) => {
        if (!alive) return;
        setAssets(list);
        setLoading(false);
      });
    };
    const onSettings = () => {
      void useChartConfigStore.getState().loadFromServer();
    };
    socket.emit('join:rt', 'assets');
    socket.emit('join:rt', 'settings');
    socket.on('rt:assets', onAssets);
    socket.on('rt:settings', onSettings);
    const onConnect = () => {
      socket.emit('join:rt', 'assets');
      socket.emit('join:rt', 'settings');
    };
    socket.on('connect', onConnect);
    return () => {
      alive = false;
      socket.off('rt:assets', onAssets);
      socket.off('rt:settings', onSettings);
      socket.off('connect', onConnect);
      socket.emit('leave:rt', 'assets');
      socket.emit('leave:rt', 'settings');
    };
  }, []);

  return { assets, loading };
}
