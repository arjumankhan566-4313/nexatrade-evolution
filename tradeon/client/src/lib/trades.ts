/**
 * Trade types + API helpers — adapted from legacy lib/apiClient.js money/fmt helpers
 * and the legacy trade history page data contract.
 *
 * The V2 backend returns snake_case TradeRow fields; these helpers map them
 * to the camelCase shape the legacy UI components expect, keeping the
 * ported components unchanged.
 */

import { api } from './api';

/* ── UI-facing trade shape (matches legacy convention) ── */
export interface UiTrade {
  id: string;
  symbol: string;
  direction: 'CALL' | 'PUT';
  stake: number;
  entryPrice: number;
  exitPrice: number | null;
  payoutRate: number;
  duration: number;
  status: string; // OPEN | SETTLING | WON | LOST | VOID
  accountType: string;
  profit: number | null;
  createdAt: string;
  expiresAt: string;
  pending?: boolean;
  idempotencyKey?: string;
}

/* ── V2 backend TradeRow (snake_case, WIN/LOSS) ── */
interface V2Trade {
  id: string;
  user_id: string;
  asset_pair: string;
  direction: string;
  amount: number;
  entry_price: number;
  exit_price: number | null;
  payout_rate: number;
  duration_seconds: number;
  status: string; // PENDING | WIN | LOSS
  is_adjusted: boolean;
  account_type: string;
  result_profit: number | null;
  created_at: string;
  expired_at: string;
  copied_from: string;
}

/** Map V2 status → legacy display status. */
function mapStatus(s: string): string {
  if (s === 'PENDING') return 'OPEN';
  if (s === 'WIN') return 'WON';
  if (s === 'LOSS') return 'LOST';
  return s;
}

/** Map a V2 TradeRow to the UI shape. */
export function mapTrade(t: V2Trade): UiTrade {
  return {
    id: t.id,
    symbol: t.asset_pair,
    direction: t.direction as 'CALL' | 'PUT',
    stake: Number(t.amount),
    entryPrice: Number(t.entry_price),
    exitPrice: t.exit_price != null ? Number(t.exit_price) : null,
    payoutRate: Number(t.payout_rate),
    duration: Number(t.duration_seconds),
    status: mapStatus(t.status),
    accountType: t.account_type,
    profit: t.result_profit != null ? Number(t.result_profit) : null,
    createdAt: t.created_at,
    expiresAt: t.expired_at,
  };
}

/* ── Analytics shape (maps V2 analytics → legacy stats) ── */
export interface TradeStats {
  total: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number;
}

interface V2Analytics {
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
  net_pnl: number;
}

export function mapStats(a: V2Analytics): TradeStats {
  return {
    total: a.total,
    wins: a.wins,
    losses: a.losses,
    pnl: a.net_pnl,
    winRate: a.win_rate,
  };
}

/* ── API calls ── */

/** Fetch active + history trades combined (matches legacy `/api/trades?limit=200`). */
export async function fetchAllTrades(limit = 200): Promise<{ trades: UiTrade[]; stats: TradeStats }> {
  const [activeRes, historyRes, analyticsRes] = await Promise.all([
    api<{ trades: V2Trade[] }>('/trades/active'),
    api<{ trades: V2Trade[] }>(`/trades/history?limit=${limit}`),
    api<{ analytics: V2Analytics }>('/trades/analytics'),
  ]);

  const active = (activeRes.data?.trades || []).map(mapTrade);
  const history = (historyRes.data?.trades || []).map(mapTrade);
  // Combine: active first (newest), then history
  const trades = [...active, ...history];
  const stats = analyticsRes.data?.analytics
    ? mapStats(analyticsRes.data.analytics)
    : { total: 0, wins: 0, losses: 0, pnl: 0, winRate: 0 };

  return { trades, stats };
}

/* ── Formatting helpers (ported from legacy apiClient.js) ── */

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPrice(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
