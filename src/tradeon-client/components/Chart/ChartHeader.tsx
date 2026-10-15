/**
 * ChartHeader — the trading screen's top bar.
 *
 * Left:  the starred (favorite) markets as quick-access tabs — ONLY starred
 *        ones. A market that was merely opened on the chart is never pinned
 *        here, and starring a market puts it in the FIRST slot immediately.
 *        Clicking a tab switches the chart. Each tab's payout is the live rate
 *        from `stores/payoutStore`, not the catalogue's static base.
 * Right: the notification bell (the account's own notification centre — never a
 *        link into Support), the account switcher (Live ⇄ Demo, email and UID —
 *        `components/layout/AccountMenu`, shared with the terminal topbar) and
 *        the deposit / withdrawal actions.
 *
 * Every favorite comes from `stores/favoritesStore`, so starring an instrument
 * in the market selector puts it up here immediately.
 */
import { useMemo } from "react";
import { Link } from "@/tradeon-client/compat/react-router-dom";
import AssetLogo from "../Market/AssetLogo";
import AccountMenu from "../layout/AccountMenu";
import NotificationsBell from "../layout/NotificationsBell";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useLivePayouts } from "../../stores/payoutStore";
import type { OtcAsset } from "../../hooks/useOtcAssets";

interface Props {
  assets: OtcAsset[];
  symbol: string;
  onSelect: (symbol: string) => void;
}

export default function ChartHeader({ assets, symbol, onSelect }: Props) {
  const { symbols: favorites, toggle } = useFavoritesStore();
  const payouts = useLivePayouts();
  const rateOf = (a: OtcAsset) => payouts[a.symbol] ?? a.payoutRate;

  // Quick-access tabs: ONLY starred markets. The store prepends a new star, so
  // the market the user just favorited lands in the first slot; a market that is
  // merely open on the chart stays out of the bar until it is starred.
  const tabs = useMemo(() => {
    const bySymbol = new Map(assets.map((a) => [a.symbol, a]));
    return favorites.map((s) => bySymbol.get(s)).filter((a): a is OtcAsset => Boolean(a));
  }, [assets, favorites]);

  return (
    <header className="chdr">
      <div className="chdr__left">
        <span className="chdr__brand" aria-hidden="true">
          N
        </span>

        <div className="chdr__tabs" role="tablist" aria-label="Open markets">
          {tabs.map((a) => {
            const starred = favorites.includes(a.symbol);
            return (
              <div key={a.symbol} className={`chdr__tab ${a.symbol === symbol ? "is-active" : ""}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={a.symbol === symbol}
                  className="chdr__tab-main"
                  onClick={() => onSelect(a.symbol)}
                >
                  <AssetLogo icon={a.icon} name={a.name || a.symbol} size={22} />
                  <span className="chdr__tab-text">
                    <strong>{a.name || a.symbol}</strong>
                    <small>{rateOf(a)}%</small>
                  </span>
                </button>
                {starred && (
                  <button
                    type="button"
                    className="chdr__tab-x"
                    aria-label={`Remove ${a.name || a.symbol} from favorites`}
                    onClick={() => toggle(a.symbol)}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          {tabs.length === 0 && <span className="chdr__hint">Star a market to pin it here</span>}
        </div>
      </div>

      <div className="chdr__right">
        <NotificationsBell buttonClassName="chdr__icon" />

        <AccountMenu variant="chart" />

        <Link to="/dashboard/wallet" className="chdr__cta chdr__cta--deposit">
          Deposit
        </Link>
        <Link to="/dashboard/wallet" className="chdr__cta chdr__cta--withdraw">
          Withdrawal
        </Link>
      </div>
    </header>
  );
}
