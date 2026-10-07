/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE V2 — REFERENCE FEED PROVIDERS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Key-free public market-data fetchers, ported from the legacy REST fallback
 * providers (market.js / marketProviders.js / gold-api). NOTHING here invents
 * a price: on any failure (HTTP error, parse error, missing field) the
 * function returns `null` and the engine continues from its last state
 * (OTC is 24/7, spec §6).
 *
 *   • Binance  → public REST ticker price (crypto, no API key)
 *   • Yahoo    → /v8/finance/chart regular market price (FX/stock/index/commodity)
 *   • gold-api → key-free metal spot (XAU/XAG/XPT/XPD fallback)
 *
 * Finnhub/Polygon streaming is intentionally NOT ported here: the legacy relay
 * needed a server WebSocket + SSE fan-out, but the V2 engine only needs a
 * periodic anchor price, which REST polling provides with far less surface
 * area. When FINNHUB_API_KEY / POLYGON_API_KEY are configured they can be
 * added later without touching the manager.
 */
import type { ProviderKind } from './symbols';

const BINANCE_REST = process.env.BINANCE_REST || 'https://data-api.binance.vision';
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const GOLD_API = 'https://api.gold-api.com/price';

async function fetchJson(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'nexatrade-v2/1.0' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Binance public ticker price (e.g. BTCUSDT). No key. */
async function fetchBinance(symbol: string): Promise<number | null> {
  const data = await fetchJson(`${BINANCE_REST}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  const price = Number(data?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Yahoo Finance chart → latest regular market price. */
async function fetchYahoo(symbol: string): Promise<number | null> {
  const data = await fetchJson(`${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1m&range=1d`);
  const meta = data?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (Number.isFinite(price) && price > 0) return price;
  // Some commodities/index futures only expose previous close outside hours.
  const prev = Number(meta?.chartPreviousClose || meta?.previousClose);
  return Number.isFinite(prev) && prev > 0 ? prev : null;
}

/** gold-api key-free spot price for a metal code (XAU/XAG/XPT/XPD). */
async function fetchGoldApi(metal: string): Promise<number | null> {
  const data = await fetchJson(`${GOLD_API}/${encodeURIComponent(metal)}`);
  const price = Number(data?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function fetchReferencePrice(
  kind: ProviderKind,
  symbol: string,
  fallbackSymbol?: string
): Promise<number | null> {
  if (kind === 'binance') return fetchBinance(symbol);
  if (kind === 'yahoo') {
    const p = await fetchYahoo(symbol);
    if (p != null) return p;
    if (fallbackSymbol) return fetchGoldApi(fallbackSymbol);
    return null;
  }
  return null;
}
