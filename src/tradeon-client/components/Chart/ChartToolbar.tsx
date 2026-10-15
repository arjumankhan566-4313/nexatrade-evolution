import { formatPrice } from "../../chart/format";

interface Props {
  symbol: string;
  /** Canonical catalogue name, e.g. "Bitcoin (OTC)" — falls back to the symbol. */
  assetName?: string;
  /** Opens the market catalogue (the full OTC instrument list). */
  onOpenMarket: () => void;
  livePrice: number | null;
  status: string;
}

/**
 * The chart's market trigger and live readout. Timeframe and chart-type
 * selection live in the floating toolbar at the bottom-left of the plot
 * (components/Chart/ChartTools.tsx).
 */
export default function ChartToolbar({
  symbol,
  assetName,
  onOpenMarket,
  livePrice,
  status,
}: Props) {
  return (
    <div className="chart-toolbar">
      <div className="chart-toolbar__left">
        <button
          type="button"
          className="chart-market-btn"
          onClick={onOpenMarket}
          aria-haspopup="dialog"
        >
          <span className="chart-market-btn__text">
            <strong>{assetName || symbol}</strong>
            <small>{symbol.replace("-OTC", "")}</small>
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <div className="chart-toolbar__right">
        {livePrice != null && (
          <span className="chart-price" data-status={status}>
            {symbol.replace("-OTC", "")} {formatPrice(livePrice)}
          </span>
        )}
        <span className={`chart-status chart-status--${status}`} title="OTC live stream">
          <i className="chart-status__dot" />
          {status === "live" ? "OTC LIVE" : status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
