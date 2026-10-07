/** Direct legacy port for the admin activity chart. */
/**
 * Per-provider symbol translation for the whole NexaTrade catalogue.
 * Kept in its own module so the market layer and the WebSocket relay can both
 * use it without importing each other.
 */
export const COMMODITY_MAP = {
  XAUUSD:    { yahoo: 'GC=F', oanda: 'XAU_USD',   polygon: 'C:XAUUSD', metal: 'XAU' },
  XAGUSD:    { yahoo: 'SI=F', oanda: 'XAG_USD',   polygon: 'C:XAGUSD', metal: 'XAG' },
  XPTUSD:    { yahoo: 'PL=F', oanda: 'XPT_USD',   polygon: 'C:XPTUSD', metal: 'XPT' },
  XPDUSD:    { yahoo: 'PA=F', oanda: 'XPD_USD',   polygon: 'C:XPDUSD', metal: 'XPD' },
  WTIUSD:    { yahoo: 'CL=F', oanda: 'WTICO_USD', polygon: 'C:WTIUSD' },
  BRENTUSD:  { yahoo: 'BZ=F', oanda: 'BCO_USD' },
  NATGASUSD: { yahoo: 'NG=F', oanda: 'NATGAS_USD' },
  COPPERUSD: { yahoo: 'HG=F', oanda: 'XCU_USD' },
};

export const isFxPair = (s) => /^[A-Z]{6}$/.test(s);
export const fxLegs = (s) => [s.slice(0, 3), s.slice(3)];

/** Yahoo Finance ticker for any non-crypto instrument. */
export function yahooSymbol(symbol, category) {
  if (category === 'INDEX') return symbol.startsWith('^') ? symbol : null;
  if (category === 'COMMODITY') return COMMODITY_MAP[symbol]?.yahoo || null;
  if (category === 'STOCK') return symbol;
  if (category === 'FOREX' && isFxPair(symbol)) return `${symbol}=X`;
  return null;
}

/** Finnhub ticker (OANDA CFD feed for FX/metals, plain ticker for equities). */
export function finnhubSymbol(symbol, category) {
  if (category === 'FOREX' && isFxPair(symbol)) {
    const [a, b] = fxLegs(symbol);
    return `OANDA:${a}_${b}`;
  }
  if (category === 'COMMODITY') {
    const o = COMMODITY_MAP[symbol]?.oanda;
    return o ? `OANDA:${o}` : null;
  }
  if (category === 'STOCK') return symbol;
  return null;
}

