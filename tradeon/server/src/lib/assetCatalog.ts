/**
 * TRADEON market catalogue — 150+ tradable instruments.
 *
 * Ported 1:1 from legacy src/lib/assetCatalog.js so the v2 server can seed
 * the `assets` and `markets` tables on boot without any legacy code.
 *
 * Every row is [symbol, displayName, category, feedProvider, feedSymbol, payout, digits, sortOrder].
 *
 *  CRYPTO    → Binance public WebSocket / REST (no API key needed)
 *  FOREX     → Finnhub (OANDA) → Polygon → Yahoo → key-free FX providers
 *  COMMODITY → Finnhub (OANDA) → Yahoo futures
 *  STOCK     → Finnhub → Polygon → Yahoo
 *  INDEX     → Yahoo index quotes (Finnhub/Polygon when a key exists)
 *
 * `feedSymbol` always stores the *canonical upstream* ticker; per-provider
 * translation happens in the market provider layer.
 */

export type AssetCategory = 'CRYPTO' | 'FOREX' | 'COMMODITY' | 'STOCK' | 'INDEX';

/** [symbol, displayName, category, feedProvider, feedSymbol, payout, digits, sortOrder] */
export type AssetRow = [string, string, AssetCategory, string, string, number, number, number];

/* ---------------------------------------------------------------- crypto */
// [base, name, payout, digits]
const CRYPTO: Array<[string, string, number, number]> = [
  ['BTC', 'Bitcoin', 88, 2], ['ETH', 'Ethereum', 88, 2], ['BNB', 'BNB', 86, 2],
  ['SOL', 'Solana', 87, 3], ['XRP', 'XRP', 86, 4], ['ADA', 'Cardano', 85, 4],
  ['DOGE', 'Dogecoin', 85, 5], ['AVAX', 'Avalanche', 85, 3], ['DOT', 'Polkadot', 84, 4],
  ['LINK', 'Chainlink', 85, 3], ['TRX', 'TRON', 84, 5], ['LTC', 'Litecoin', 85, 2],
  ['BCH', 'Bitcoin Cash', 84, 2], ['ATOM', 'Cosmos', 84, 3], ['XLM', 'Stellar', 83, 5],
  ['NEAR', 'NEAR Protocol', 84, 3], ['APT', 'Aptos', 84, 3], ['ARB', 'Arbitrum', 84, 4],
  ['OP', 'Optimism', 84, 4], ['FIL', 'Filecoin', 83, 3], ['ICP', 'Internet Computer', 83, 3],
  ['HBAR', 'Hedera', 83, 5], ['VET', 'VeChain', 82, 5], ['INJ', 'Injective', 84, 3],
  ['SUI', 'Sui', 85, 4], ['SEI', 'Sei', 83, 4], ['TIA', 'Celestia', 83, 3],
  ['RUNE', 'THORChain', 82, 3], ['AAVE', 'Aave', 84, 2], ['ALGO', 'Algorand', 82, 4],
  ['FTM', 'Fantom', 82, 4], ['SAND', 'The Sandbox', 82, 4], ['MANA', 'Decentraland', 82, 4],
  ['AXS', 'Axie Infinity', 82, 3], ['GALA', 'Gala', 81, 5], ['CHZ', 'Chiliz', 81, 5],
  ['GRT', 'The Graph', 82, 5], ['LDO', 'Lido DAO', 83, 3], ['MKR', 'Maker', 84, 1],
  ['SNX', 'Synthetix', 82, 3], ['CRV', 'Curve DAO', 82, 4], ['UNI', 'Uniswap', 84, 3],
  ['ETC', 'Ethereum Classic', 83, 2], ['THETA', 'Theta Network', 81, 4], ['EOS', 'EOS', 81, 4],
  ['FLOW', 'Flow', 81, 4], ['KAVA', 'Kava', 81, 4], ['NEO', 'Neo', 82, 2],
  ['IOTA', 'IOTA', 81, 4], ['PEPE', 'Pepe', 85, 8], ['SHIB', 'Shiba Inu', 84, 8],
  ['WIF', 'dogwifhat', 84, 4], ['BONK', 'Bonk', 83, 8], ['JUP', 'Jupiter', 83, 4],
  ['PYTH', 'Pyth Network', 83, 4], ['STX', 'Stacks', 82, 4], ['IMX', 'Immutable', 82, 4],
];

/* ----------------------------------------------------------------- forex */
// [pair, payout, digits]
const FOREX: Array<[string, number, number]> = [
  ['EURUSD', 85, 5], ['GBPUSD', 85, 5], ['USDJPY', 85, 3], ['USDCHF', 84, 5],
  ['USDCAD', 84, 5], ['AUDUSD', 84, 5], ['NZDUSD', 83, 5], ['EURGBP', 83, 5],
  ['EURJPY', 83, 3], ['EURCHF', 82, 5], ['EURAUD', 82, 5], ['EURCAD', 82, 5],
  ['GBPJPY', 83, 3], ['GBPCHF', 82, 5], ['GBPAUD', 81, 5], ['GBPCAD', 81, 5],
  ['AUDJPY', 82, 3], ['AUDNZD', 81, 5], ['AUDCAD', 81, 5], ['AUDCHF', 81, 5],
  ['NZDJPY', 81, 3], ['CADJPY', 81, 3], ['CADCHF', 81, 5], ['CHFJPY', 81, 3],
  ['NZDCAD', 80, 5], ['NZDCHF', 80, 5], ['USDSGD', 80, 5], ['USDHKD', 79, 5],
  ['USDTRY', 78, 4], ['USDMXN', 79, 4], ['USDZAR', 79, 4], ['USDINR', 78, 3],
  ['USDBDT', 78, 3], ['USDSEK', 79, 4], ['USDNOK', 79, 4],
];

/* ------------------------------------------------------------ commodities */
// [symbol, name, payout, digits]
const COMMODITY: Array<[string, string, number, number]> = [
  ['XAUUSD', 'Gold / USD', 85, 2], ['XAGUSD', 'Silver / USD', 84, 3],
  ['XPTUSD', 'Platinum / USD', 82, 2], ['XPDUSD', 'Palladium / USD', 81, 2],
  ['WTIUSD', 'Crude Oil WTI', 84, 2], ['BRENTUSD', 'Crude Oil Brent', 83, 2],
  ['NATGASUSD', 'Natural Gas', 82, 3], ['COPPERUSD', 'Copper', 81, 4],
];

/* ---------------------------------------------------------------- stocks */
// [ticker, name, payout]
const STOCK: Array<[string, string, number]> = [
  ['AAPL', 'Apple Inc.', 82], ['MSFT', 'Microsoft', 82], ['GOOGL', 'Alphabet', 82],
  ['AMZN', 'Amazon', 82], ['META', 'Meta Platforms', 82], ['TSLA', 'Tesla', 83],
  ['NVDA', 'NVIDIA', 83], ['NFLX', 'Netflix', 81], ['AMD', 'AMD', 82],
  ['INTC', 'Intel', 80], ['IBM', 'IBM', 79], ['ORCL', 'Oracle', 80],
  ['CRM', 'Salesforce', 80], ['ADBE', 'Adobe', 80], ['PYPL', 'PayPal', 80],
  ['UBER', 'Uber', 80], ['SHOP', 'Shopify', 80], ['COIN', 'Coinbase', 82],
  ['MSTR', 'MicroStrategy', 82], ['BABA', 'Alibaba', 80], ['DIS', 'Walt Disney', 79],
  ['KO', 'Coca-Cola', 78], ['PEP', 'PepsiCo', 78], ['MCD', "McDonald's", 78],
  ['NKE', 'Nike', 79], ['WMT', 'Walmart', 78], ['JPM', 'JPMorgan Chase', 79],
  ['BAC', 'Bank of America', 79], ['GS', 'Goldman Sachs', 79], ['V', 'Visa', 79],
  ['MA', 'Mastercard', 79], ['XOM', 'Exxon Mobil', 79], ['CVX', 'Chevron', 79],
  ['PFE', 'Pfizer', 78], ['JNJ', 'Johnson & Johnson', 78], ['BA', 'Boeing', 80],
  ['T', 'AT&T', 78], ['QCOM', 'Qualcomm', 80], ['SBUX', 'Starbucks', 78],
  ['PLTR', 'Palantir', 82], ['SPOT', 'Spotify', 80],
];

/* --------------------------------------------------------------- indices */
// [symbol, name, yahoo, payout, digits]
const INDEX: Array<[string, string, string, number, number]> = [
  ['SPX500', 'S&P 500', '^GSPC', 83, 2], ['NAS100', 'NASDAQ 100', '^NDX', 83, 2],
  ['US30', 'Dow Jones 30', '^DJI', 82, 2], ['US2000', 'Russell 2000', '^RUT', 81, 2],
  ['UK100', 'FTSE 100', '^FTSE', 81, 2], ['GER40', 'DAX 40', '^GDAXI', 81, 2],
  ['FRA40', 'CAC 40', '^FCHI', 80, 2], ['JPN225', 'Nikkei 225', '^N225', 81, 2],
  ['HK50', 'Hang Seng', '^HSI', 80, 2], ['AUS200', 'ASX 200', '^AXJO', 80, 2],
  ['VIX', 'Volatility Index', '^VIX', 80, 2],
];

function build(): AssetRow[] {
  const rows: AssetRow[] = [];
  let order = 0;

  for (const [base, name, payout, digits] of CRYPTO) {
    rows.push([`${base}USDT`, `${name} / USDT`, 'CRYPTO', 'BINANCE', `${base.toLowerCase()}usdt`, payout, digits, (order += 10)]);
  }
  order = 10_000;
  for (const [pair, payout, digits] of FOREX) {
    rows.push([pair, `${pair.slice(0, 3)} / ${pair.slice(3)}`, 'FOREX', 'FX', pair, payout, digits, (order += 10)]);
  }
  order = 20_000;
  for (const [sym, name, payout, digits] of COMMODITY) {
    rows.push([sym, name, 'COMMODITY', 'FX', sym, payout, digits, (order += 10)]);
  }
  order = 30_000;
  for (const [tick, name, payout] of STOCK) {
    rows.push([tick, name, 'STOCK', 'EQUITY', tick, payout, 2, (order += 10)]);
  }
  order = 40_000;
  for (const [sym, name, yahoo, payout, digits] of INDEX) {
    rows.push([sym, name, 'INDEX', 'INDEX', yahoo, payout, digits, (order += 10)]);
  }
  return rows;
}

export const DEFAULT_ASSETS: AssetRow[] = build();

export const ASSET_CATEGORIES: AssetCategory[] = ['CRYPTO', 'FOREX', 'COMMODITY', 'STOCK', 'INDEX'];

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  CRYPTO: 'Crypto',
  FOREX: 'Currency',
  COMMODITY: 'Commodities',
  STOCK: 'Stocks',
  INDEX: 'Indices',
};

/** Bumped whenever the shipped catalogue changes; see config/bootstrap.ts. */
export const ASSET_CATALOG_VERSION = 3;
