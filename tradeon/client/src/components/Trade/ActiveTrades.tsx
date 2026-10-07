/**
 * ActiveTrades — the live "open orders" list for the premium Trade Panel.
 *
 * Positions are the user's REAL open trades (`GET /api/trades`); the marking
 * price is the chart's live OTC quote for the selected market. Each row shows
 * the live countdown to expiry, a progress bar for time elapsed, and a P/L
 * readout that turns green while the position is winning and red while losing.
 */
import { useEffect, useState } from 'react';
import type { UiTrade } from '../../lib/trades';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const digits = n >= 100 ? 2 : n >= 1 ? 4 : 5;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Projected P/L for an open position: proportional to the signed move from the
 * entry price, capped at the payout / the stake. A tiny dead-band keeps it from
 * flickering at exactly the strike.
 */
function projected(t: UiTrade, lastPrice: number | null): number {
  if (!t.entryPrice || lastPrice == null) return 0;
  const move = (lastPrice - t.entryPrice) / t.entryPrice;
  if (Math.abs(move) < 5e-5) return 0;
  const signed = t.direction === 'CALL' ? move : -move;
  return clamp(t.stake * signed * 100, -t.stake, (t.stake * t.payoutRate) / 100);
}

interface Props {
  trades: UiTrade[];
  /** The market the chart is showing — only its positions mark live. */
  symbol: string;
  markPrice: number | null;
}

export default function ActiveTrades({ trades, symbol, markPrice }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  const open = trades.filter((t) => t.status === 'OPEN' || t.status === 'SETTLING');

  return (
    <section className="nxt-card nxt-active">
      <header className="nxt-active__head">
        <span className="nxt-active__title">
          <i />
          Open Trades
        </span>
        <span className="nxt-active__count">{open.length}</span>
      </header>

      {open.length === 0 ? (
        <div className="nxt-empty">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          No open positions
        </div>
      ) : (
        open.map((t) => {
          const marking = t.symbol === symbol ? markPrice : null;
          const pnl = t.pending ? 0 : projected(t, marking);
          const state = pnl > 0.005 ? 'up' : pnl < -0.005 ? 'down' : 'flat';
          const expiresAt = new Date(t.expiresAt).getTime();
          const startedAt = new Date(t.createdAt).getTime();
          const remaining = expiresAt - now;
          const span = Math.max(1, expiresAt - startedAt);
          const elapsed = clamp((now - startedAt) / span, 0, 1);
          const isCall = t.direction === 'CALL';
          return (
            <article key={t.idempotencyKey || t.id} className={`nxt-trade nxt-trade--${state}`}>
              <div className="nxt-trade__top">
                <span className={`nxt-dir nxt-dir--${isCall ? 'up' : 'down'}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    {isCall ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
                  </svg>
                  {isCall ? 'UP' : 'DOWN'}
                </span>
                <span className="nxt-trade__symbol">{t.symbol.replace('-OTC', '')}</span>
                <span className={`nxt-trade__pnl ${state}`}>
                  {state !== 'flat' && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      {state === 'up' ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
                    </svg>
                  )}
                  {t.pending ? 'Confirming…' : fmtMoney(pnl)}
                </span>
              </div>

              <div className="nxt-trade__meta">
                <span>
                  Stake {fmtMoney(t.stake)} · Entry {fmtPrice(t.entryPrice)}
                </span>
                <span className={`nxt-trade__clock ${remaining <= 5000 ? 'urgent' : ''}`}>
                  {fmtClock(remaining)}
                </span>
              </div>

              <span className={`nxt-trade__bar ${state}`} style={{ width: `${elapsed * 100}%` }} />
            </article>
          );
        })
      )}
    </section>
  );
}
