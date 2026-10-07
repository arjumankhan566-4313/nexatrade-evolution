/**
 * MultiChartPage — the multi-chart workspace.
 *
 * Ported from legacy src/app/dashboard/multi/page.jsx, which rendered up to
 * four ECharts `TradeChart` cells. V2 has no charting library: every cell
 * mounts the native Canvas engine (CanvasChart) with its own OTC instrument and
 * timeframe, and the engine owns that cell's live OTC subscription.
 */
import { useEffect, useMemo, useState } from 'react';
import CanvasChart from '../../components/Chart/CanvasChart';
import { api } from '../../lib/api';
import '../../styles/legacy-pages.css';
import '../../styles/multi-chart.css';

interface OtcAsset {
  symbol: string;
  name: string;
  category: string;
}

interface Slot {
  symbol: string;
  timeframe: string;
}

/* Display labels for the OTC asset categories (mirrors lib/assetCatalog). */
const CATEGORY_LABELS: Record<string, string> = {
  CRYPTO: 'Crypto',
  FOREX: 'Currency',
  STOCK: 'Stocks',
  COMMODITY: 'Commodities',
  INDEX: 'Indices',
};

const LAYOUTS = [
  { id: 1, label: '1 chart' },
  { id: 2, label: '2 charts' },
  { id: 4, label: '4 charts' },
];
const TIMEFRAMES = ['1m', '5m', '15m', '1h'];
const DEFAULT_SLOTS: Slot[] = [
  { symbol: 'BTCUSD-OTC', timeframe: '1m' },
  { symbol: 'ETHUSD-OTC', timeframe: '1m' },
  { symbol: 'EURUSD-OTC', timeframe: '1m' },
  { symbol: 'XAUUSD-OTC', timeframe: '1m' },
];

export default function MultiChartPage() {
  const [layout, setLayout] = useState(4);
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [assets, setAssets] = useState<OtcAsset[]>([]);

  useEffect(() => {
    api<{ assets: OtcAsset[] }>('/market/otc/assets')
      .then((res) => {
        if (res.data?.assets) setAssets(res.data.assets);
      })
      .catch(() => {
        /* the cells keep their default instruments */
      });
  }, []);

  /* Grouped for the per-cell market picker (same categories as the terminal drawer). */
  const grouped = useMemo(() => {
    const out = new Map<string, OtcAsset[]>();
    for (const asset of assets) {
      const list = out.get(asset.category);
      if (list) list.push(asset);
      else out.set(asset.category, [asset]);
    }
    return [...out.entries()];
  }, [assets]);

  const update = (index: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));

  const visible = slots.slice(0, layout);

  return (
    <div className="legacy-page multi-workspace">
      <header className="multi-head">
        <div>
          <h1>Multi-chart workspace</h1>
          <p>Up to four live OTC markets side by side — each with its own timeframe.</p>
        </div>
        <div className="multi-layouts">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={layout === l.id ? 'active' : ''}
              onClick={() => setLayout(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <div className={`multi-grid cols-${layout}`}>
        {visible.map((slot, index) => (
          <section key={index} className="multi-cell">
            <div className="multi-cell-head">
              <select
                className="input"
                value={slot.symbol}
                onChange={(e) => update(index, { symbol: e.target.value })}
                aria-label={`Chart ${index + 1} market`}
              >
                {grouped.length === 0 && <option value={slot.symbol}>{slot.symbol}</option>}
                {grouped.map(([category, list]) => (
                  <optgroup key={category} label={CATEGORY_LABELS[category] || category}>
                    {list.map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="multi-tfs">
                {TIMEFRAMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={slot.timeframe === t ? 'active' : ''}
                    onClick={() => update(index, { timeframe: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="multi-cell-chart">
              <CanvasChart symbol={slot.symbol} timeframe={slot.timeframe} dedicatedSocket />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
