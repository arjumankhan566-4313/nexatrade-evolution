/**
 * MarketSelector — the OTC market catalogue, anchored exactly like a tier-1
 * platform's market list: flush with the left edge of the chart, directly
 * below the asset indicator (never a centred modal on desktop).
 *
 * Every row shows the instrument's official artwork, its name, its LIVE payout
 * (the same rate the top header tabs show — `stores/payoutStore`) and a star
 * that pins it to the first slot of the top header's quick-access tabs.
 */
import { useMemo, useState } from 'react';
import {
  MARKET_TABS,
  MARKET_TAB_LABELS,
  type MarketTab,
  type OtcAsset,
} from '../../hooks/useOtcAssets';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useLivePayouts } from '../../stores/payoutStore';
import AssetLogo from './AssetLogo';
import '../../styles/market-selector.css';

interface Props {
  assets: OtcAsset[];
  loading: boolean;
  symbol: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
}

export default function MarketSelector({ assets, loading, symbol, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<MarketTab>('ALL');
  const [query, setQuery] = useState('');
  const { symbols: favorites, toggle } = useFavoritesStore();
  const payouts = useLivePayouts();

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: assets.length };
    for (const a of assets) c[a.category] = (c[a.category] ?? 0) + 1;
    return c;
  }, [assets]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = assets.filter((a) => {
      if (tab !== 'ALL' && a.category !== tab) return false;
      if (!q) return true;
      return a.symbol.toLowerCase().includes(q) || (a.name ?? '').toLowerCase().includes(q);
    });
    // Starred instruments are pinned above the rest: starring row 4 moves it
    // straight to slot 1, in the same newest-first order as the header tabs.
    // Non-favorites keep the catalogue order (Array#sort is stable).
    const rank = new Map(favorites.map((s, i) => [s, i]));
    const at = (s: string) => (rank.has(s) ? (rank.get(s) as number) : Number.POSITIVE_INFINITY);
    return matches.slice().sort((a, b) => at(a.symbol) - at(b.symbol));
  }, [assets, tab, query, favorites]);

  return (
    <div className="mkt" role="dialog" aria-label="Select market">
      <button type="button" className="mkt__backdrop" aria-label="Close markets" onClick={onClose} />

      <div className="mkt__panel">
        <header className="mkt__head">
          <h2 className="mkt__title">Markets</h2>
          <button type="button" className="mkt__close" onClick={onClose} aria-label="Close market list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <label className="mkt__search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.2-3.2" />
          </svg>
          <input
            className="mkt__search"
            type="search"
            placeholder="SEARCH ASSET…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </label>

        <div className="mkt__tabs">
          {MARKET_TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`mkt__tab ${t === tab ? 'is-active' : ''}`}
              onClick={() => setTab(t)}
            >
              <span>{MARKET_TAB_LABELS[t]}</span>
              <em>{counts[t] ?? 0}</em>
            </button>
          ))}
        </div>

        <div className="mkt__colhead">
          <span>ASSET</span>
          <span>PAYOUT</span>
        </div>

        <div className="mkt__list">
          {loading && !assets.length && <p className="mkt__empty">Loading markets…</p>}
          {!loading && !rows.length && <p className="mkt__empty">No markets match your search.</p>}
          {rows.map((a) => {
            const starred = favorites.includes(a.symbol);
            return (
              <div
                key={a.symbol}
                data-symbol={a.symbol}
                className={`mkt__row ${a.symbol === symbol ? 'is-active' : ''}`}
              >
                <button
                  type="button"
                  className={`mkt__star ${starred ? 'is-on' : ''}`}
                  aria-pressed={starred}
                  aria-label={starred ? `Remove ${a.name || a.symbol} from favorites` : `Add ${a.name || a.symbol} to favorites`}
                  onClick={() => toggle(a.symbol)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 20l1-6-4.3-4.2 6-.9z" />
                  </svg>
                </button>

                <button type="button" className="mkt__pick" onClick={() => onSelect(a.symbol)}>
                  <AssetLogo icon={a.icon} name={a.name || a.symbol} size={26} />
                  <span className="mkt__row-main">
                    <strong>{a.name || a.symbol}</strong>
                    <small>{a.symbol.replace('-OTC', '')}</small>
                  </span>
                </button>

                <span className="mkt__row-payout">{payouts[a.symbol] ?? a.payoutRate}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
