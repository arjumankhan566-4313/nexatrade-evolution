/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXATRADE V2 — REFERENCE FEED PROVIDER SYMBOL MAPPING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ported 1:1 from legacy src/lib/symbols.js. Maps each OTC instrument's
 * `referenceSymbol` (e.g. BTCUSDT, EURUSD, XAUUSD, AAPL, SPX500) to the ticker
 * each public provider expects, so the feed poller never invents a symbol.
 *
 *   • CRYPTO   → Binance REST ticker symbol (BTCUSDT)
 *   • FOREX    → Yahoo Finance FX pair (EURUSD=X)
 *   • COMMODITY→ Yahoo futures (GC=F / SI=F …) — metals also have gold-api fallback
 *   • STOCK    → plain ticker (AAPL)
 *   • INDEX    → Yahoo index (^GSPC …)
 */
import { otcInstrument, referenceSymbolFor, type InstrumentSeed } from '../otc/instruments';

/** Commodity futures → Yahoo ticker (legacy COMMODITY_MAP.yahoo). */
const COMMODITY_YAHOO: Record<string, string> = {
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  XPTUSD: 'PL=F',
  XPDUSD: 'PA=F',
  WTIUSD: 'CL=F',
  BRENTUSD: 'BZ=F',
  NATGASUSD: 'NG=F',
  COPPERUSD: 'HG=F',
};

/** Metals that gold-api can price key-free (legacy fallback). */
const GOLD_API_METALS: Record<string, string> = {
  XAUUSD: 'XAU',
  XAGUSD: 'XAG',
  XPTUSD: 'XPT',
  XPDUSD: 'XPD',
};

/** Yahoo index symbol map (legacy `^` prefix convention). */
const INDEX_YAHOO: Record<string, string> = {
  SPX500: '^GSPC',
  NAS100: '^NDX',
  US30: '^DJI',
  US2000: '^RUT',
  UK100: '^FTSE',
  GER40: '^GDAXI',
  FRA40: '^FCHI',
  JPN225: '^N225',
  HK50: '^HSI',
  AUS200: '^AXJO',
  VIX: '^VIX',
};

export type ProviderKind = 'binance' | 'yahoo' | 'goldapi';

export interface ProviderTarget {
  kind: ProviderKind;
  /** The symbol the provider expects (or null if no feed exists). */
  symbol: string;
  /** A secondary key-free fallback symbol (gold-api metal code) if any. */
  fallbackSymbol?: string;
}

const isFxPair = (s: string) => /^[A-Z]{6}$/.test(s);

export function providerTarget(otcSymbol: string): ProviderTarget | null {
  const instrument: InstrumentSeed | null = otcInstrument(otcSymbol);
  if (!instrument) return null;
  const ref = referenceSymbolFor(otcSymbol);
  if (!ref) return null;
  switch (instrument.logicalCategory) {
    case 'CRYPTO':
      return { kind: 'binance', symbol: ref };
    case 'FOREX':
      // Metals quoted as a /USD pair (XAUUSD, XAGUSD …) are not Yahoo FX pairs;
      // route them through the futures ticker with a key-free gold-api fallback,
      // exactly like their COMMODITY siblings.
      if (COMMODITY_YAHOO[ref]) {
        return { kind: 'yahoo', symbol: COMMODITY_YAHOO[ref], fallbackSymbol: GOLD_API_METALS[ref] };
      }
      if (isFxPair(ref)) return { kind: 'yahoo', symbol: `${ref}=X` };
      return { kind: 'yahoo', symbol: `${ref}=X` };
    case 'COMMODITY':
      return { kind: 'yahoo', symbol: COMMODITY_YAHOO[ref] || '', fallbackSymbol: GOLD_API_METALS[ref] };
    case 'STOCK':
      return { kind: 'yahoo', symbol: ref };
    case 'INDEX':
      return { kind: 'yahoo', symbol: INDEX_YAHOO[ref] || `^${ref}` };
    default:
      return null;
  }
}

/** Every active OTC symbol → its provider target (deduplicated). */
export function allProviderTargets(otcSymbols: string[]): { otcSymbol: string; target: ProviderTarget }[] {
  const out: { otcSymbol: string; target: ProviderTarget }[] = [];
  for (const s of otcSymbols) {
    const target = providerTarget(s);
    if (target && target.symbol) out.push({ otcSymbol: s, target });
  }
  return out;
}
