/** Direct legacy port for the admin activity chart. */
/**
 * Live market data (server side).
 *
 * Crypto        → Binance public REST/WS (no API key required).
 * Forex / metals→ Finnhub or Polygon when a key is configured, otherwise
 *                 key-free public providers (open.er-api.com, gold-api, Yahoo).
 *
 * NOTHING here fabricates a price. If every upstream provider is unreachable
 * the function returns null and the caller degrades gracefully (chart shows
 * "feed offline", settlement retries instead of inventing a candle).
 */
import { many, one, sql } from '../db';
import { ensureRelay, getRelayQuote, relayStatus } from './finnhubStream';
import { COMMODITY_MAP, yahooSymbol, finnhubSymbol, isFxPair, fxLegs } from './symbols';

import { exchangeAssets, observedCandles, quoteIsTradable, latestAggregateTradeQuote } from './marketIntegrity';
import { CRYPTO_ICONS } from './assetIconMap';
import { fetchYahooChart, yahooQuote, yahooCandles, yahooMarketState, providerEpochMs } from './marketProviders';
import { aggregateCandles } from './intervalCandles.js';
export { yahooSymbol, finnhubSymbol };

const BINANCE_REST = process.env.BINANCE_REST || 'https://data-api.binance.vision';
const FINNHUB = 'https://finnhub.io/api/v1';
const POLYGON = 'https://api.polygon.io';

const g = globalThis;
if (!g.__nexaMarket) g.__nexaMarket = { quotes: new Map(), candles: new Map() };
const store = g.__nexaMarket;
store.pending ||= new Map(); store.observations ||= new Map(); store.fetchedAt ||= new Map();
export async function syncFreeAssets() {
  if(store.catalogUntil>Date.now()) return;
  if(store.catalogPromise) return store.catalogPromise;
  store.catalogPromise=(async()=>{
    try {
      const [data]=await Promise.all([fetchJson(BINANCE_REST+'/api/v3/exchangeInfo',{},8000),fetchJson(BINANCE_REST+'/api/v3/time',{},8000).then(clock=>{
        if(Number(clock?.serverTime)>0){store.clockOffset=Number(clock.serverTime)-Date.now();store.clockSyncedAt=Date.now();}
      })]);
      const rows=exchangeAssets(data);
      if(!rows.length) return;
      const symbols=rows.map(r=>r.symbol),names=rows.map(r=>r.base+' / USDT'),digits=rows.map(r=>r.digits);
      await sql(`INSERT INTO markets (symbol,display_name,category,provider,feed_symbol,payout_percentage,price_digits,sort_order)
        SELECT s,n,'CRYPTO','BINANCE',LOWER(s),85,d,1000+ordinality::int
        FROM UNNEST($1::text[],$2::text[],$3::int[]) WITH ORDINALITY AS t(s,n,d,ordinality)
        ON CONFLICT (symbol) DO NOTHING`,[symbols,names,digits]);
      store.exchangeSymbols=new Set(symbols); store.catalogUntil=Date.now()+3600000;
    } catch {store.catalogUntil=Date.now()+30000;}
  })().finally(()=>{store.catalogPromise=null;});
  return store.catalogPromise;
}

const QUOTE_TTL = 1000; // ms
const CANDLE_TTL = 20_000;

async function fetchJson(url, opts = {}, timeout = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'user-agent': 'TRADEON/1.0', accept: 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ *
 * Asset registry
 * ------------------------------------------------------------------ */
export async function listAssets() {
  const rows = await many(
    `SELECT symbol, display_name, category, provider, feed_symbol, payout_percentage, price_digits, is_active, sort_order
     FROM markets WHERE is_active = TRUE ORDER BY sort_order ASC`
  );
  return rows.filter(r=>r.provider!=='BINANCE'||((!store.exchangeSymbols||store.exchangeSymbols.has(r.symbol))&&CRYPTO_ICONS.has(r.symbol.replace(/USDT$/,'').toLowerCase()))).map((r) => ({
    symbol: r.symbol,
    name: r.display_name,
    category: r.category,
    provider: r.provider,
    feedSymbol: r.feed_symbol,
    payoutRate: Number(r.payout_percentage),
    digits: Number(r.price_digits),
  }));
}

/** OTC symbols are a SEPARATE market type — never resolved from `markets`. */
const isOtcLike = (symbol) => typeof symbol === 'string' && symbol.toUpperCase().endsWith('-OTC');

/**
 * Resolve an OTC instrument as an asset. Strictly additive: real symbols are
 * unaffected, and a failure here can never break the real-market path.
 */
async function getOtcAsset(symbol) {
  if (!isOtcLike(symbol)) return null;
  try {
    const r = await one(
      `SELECT symbol, display_name, payout_percentage, decimal_precision, is_active, session_status, trading_status
         FROM otc_instruments WHERE symbol = $1`,
      [String(symbol).toUpperCase()]
    );
    if (!r) return null;
    return {
      symbol: r.symbol,
      name: r.display_name,
      category: 'OTC',
      provider: 'OTC',
      marketType: 'OTC',
      synthetic: true,
      feedSymbol: r.symbol,
      payoutRate: Number(r.payout_percentage),
      digits: Number(r.decimal_precision),
      isActive: r.is_active !== false,
      sessionStatus: r.session_status,
      tradingStatus: r.trading_status,
    };
  } catch {
    return null;
  }
}

export async function getAsset(symbol) {
  const otc = await getOtcAsset(symbol);
  if (otc) return otc;
  const r = await one('SELECT * FROM markets WHERE symbol = $1', [symbol]);
  if (!r) return null;
  return {
    symbol: r.symbol,
    name: r.display_name,
    category: r.category,
    provider: r.provider,
    feedSymbol: r.feed_symbol,
    payoutRate: Number(r.payout_percentage),
    digits: Number(r.price_digits),
    isActive: Boolean(r.is_active),
  };
}

/* ------------------------------------------------------------------ *
 * Quotes
 * ------------------------------------------------------------------ */
async function fetchCryptoQuotes(symbols) {
  if (!symbols.length) return {};
  const data = await fetchJson(
    `${BINANCE_REST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  );
  const rows = Array.isArray(data) ? data : [data];
  const now = Date.now();
  return Object.fromEntries(
    rows
      .filter((row) => symbols.includes(row?.symbol) && Number(row?.lastPrice) > 0)
      .map((row) => [row.symbol, {
        price: Number(row.lastPrice),
        changePct: Number(row.priceChangePercent || 0),
        high: Number(row.highPrice || 0),
        low: Number(row.lowPrice || 0),
        volume: Number(row.quoteVolume || 0),
        source: 'BINANCE',
        ts: Number(row.closeTime) || now, realtime:true,
      }])
  );
}

async function fetchFinnhub(symbol, asset) {
  const key = process.env.FINNHUB_API_KEY;
  const mapped = finnhubSymbol(symbol, asset?.category);
  if (!key || !mapped) return null;
  const d = await fetchJson(`${FINNHUB}/quote?symbol=${encodeURIComponent(mapped)}&token=${key}`);
  const ts=providerEpochMs(d?.t);
  return d?.c && ts ? { price:Number(d.c), source:'FINNHUB', ts, realtime:true, changePct:Number.isFinite(Number(d.dp)) ? Number(d.dp) : null } : null;
}

async function fetchPolygon(symbol, asset) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;
  const cat = asset?.category;
  if (cat === 'FOREX' && isFxPair(symbol)) {
    const [a, b] = fxLegs(symbol);
    const d = await fetchJson(`${POLYGON}/v1/conversion/${a}/${b}?amount=1&precision=6&apiKey=${key}`);
    const ts=providerEpochMs(d?.last?.timestamp);
    // An indicative conversion endpoint does not establish a tradable tick stream.
    return d?.converted && ts ? { price:Number(d.converted), source:'POLYGON', ts, realtime:false, delayed:true, reference:true } : null;
  }
  const tick = cat === 'STOCK' ? symbol : COMMODITY_MAP[symbol]?.polygon;
  if (!tick) return null;
  const d = await fetchJson(`${POLYGON}/v2/aggs/ticker/${tick}/prev?adjusted=true&apiKey=${key}`);
  const c = d?.results?.[0]?.c;
  const ts=providerEpochMs(d?.results?.[0]?.t);
  return c && ts ? { price:Number(c), source:'POLYGON', ts, realtime:false, delayed:true, reference:true, volume:d.results[0].v ?? null } : null;
}

async function fetchYahoo(symbol, asset) {
  const mapped = asset?.category === 'INDEX' ? asset.feedSymbol : yahooSymbol(symbol, asset?.category);
  if (!mapped) return null;
  const result=await fetchYahooChart(mapped,'1m','1d',fetchJson);
  return yahooQuote(result,asset?.category,Date.now()+(store.clockOffset||0));
}

async function fetchFreeFx(symbol, asset) {
  if (asset?.category === 'FOREX' && isFxPair(symbol)) {
    const [a, b] = fxLegs(symbol);
    let d=store.fxRates?.get(a);
    if(!d || Date.now()>d.expires){d=await fetchJson(`https://open.er-api.com/v6/latest/${a}`);store.fxRates ||= new Map();store.fxRates.set(a,{...d,expires:Date.now()+3600000});}
    const rate = d?.rates?.[b];
    return rate ? { price: Number(rate), source:'ER-API', ts:Number(d.time_last_update_unix)*1000, realtime:false, reference:true } : null;
  }
  const metal = COMMODITY_MAP[symbol]?.metal;
  if (metal) {
    const d = await fetchJson(`https://api.gold-api.com/price/${metal}`);
    return d?.price ? { price: Number(d.price), source:'GOLD-API', ts:Date.parse(d.updatedAt), realtime:true, volume:null } : null;
  }
  return null;
}

async function fetchNonCryptoQuote(symbol, asset) {
  // 1) real-time push feed (Finnhub WebSocket relay, long-running hosts)
  const pushed = getRelayQuote(symbol);
  if (pushed) return pushed;
  // 2) request/response providers, best first
  const providers = COMMODITY_MAP[symbol]?.metal ? [fetchFreeFx] : [fetchFinnhub, fetchPolygon, fetchYahoo, fetchFreeFx];
  for (const p of providers) {
    try {
      const q = await p(symbol, asset);
      if (q?.price) return q;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

/**
 * Latest prices for a list of symbols.
 * Falls back to (a) the short-lived process cache and (b) authenticated client
 * tick observations recorded in the database, always flagging the source.
 */
export async function getQuotes(symbols) {
  // OTC instruments are priced by the OTC engine, never by a real provider.
  const otcSymbols = (symbols || []).filter(isOtcLike);
  if (otcSymbols.length) {
    const { getOtcQuotes } = await import('../../otc/service');
    const otcQuotes = await getOtcQuotes(otcSymbols).catch(() => ({}));
    const rest = await getQuotesReal((symbols || []).filter((s) => !isOtcLike(s)));
    return { ...rest, ...otcQuotes };
  }
  return getQuotesReal(symbols);
}

async function getQuotesReal(symbols) {
  const now = Date.now();
  const result = {};
  const stale = [];

  for (const s of symbols) {
    const cached = store.quotes.get(s);
    const ttl=cached?.marketClosed ? 60000 : cached?.reference ? 30000 : cached?.realtime===false ? 5000 : QUOTE_TTL;
    if (cached && now-(store.fetchedAt.get(s)||0)<ttl) result[s] = cached;
    else stale.push(s);
  }
  if (!stale.length) return result;

  const assets = await listAssets();
  const byS = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  const crypto = stale.filter((s) => byS[s]?.provider === 'BINANCE');
  const others = stale.filter((s) => byS[s] && byS[s].provider !== 'BINANCE');
  if (others.length) ensureRelay(others.map((s) => byS[s]).filter(Boolean));

  if (crypto.length) {
    try {
      Object.assign(result, await fetchCryptoQuotes(crypto));
    } catch {
      /* offline — handled below */
    }
  }
  await Promise.all(
    others.map(async (s) => {
      if(!store.pending.has(s)) store.pending.set(s,fetchNonCryptoQuote(s,byS[s]).finally(()=>store.pending.delete(s)));
      const q = await store.pending.get(s);
      if (q) result[s] = q;
    })
  );

  for (const s of stale) {
    if (result[s]) {
      store.quotes.set(s,result[s]); store.fetchedAt.set(s,Date.now());
      if(result[s].source==='GOLD-API'){const samples=store.observations.get(s)||[];if(samples.at(-1)?.ts!==result[s].ts)samples.push({ts:result[s].ts,price:result[s].price});store.observations.set(s,samples.slice(-5000));}
    } else {
      const cached = store.quotes.get(s);
      if (cached) result[s] = { ...cached, stale: true };
    }
  }
  return result;
}

export function feedStatus() {
  return { finnhubRelay: relayStatus() };
}

/** Single authoritative price used for opening / settling a trade. */
export async function getSettlementPrice(symbol) {
  const asset=await getAsset(symbol);
  if(!asset?.isActive)return null;
  if(asset.provider==='OTC') {
    // Backend-authoritative OTC entry price — the current engine tick.
    const { otcEntryPrice } = await import('../../otc/service');
    const p = await otcEntryPrice(symbol).catch(() => null);
    return p ? { price: p.price, source: 'OTC', sequence: p.sequence } : null;
  }
  if(asset.provider==='BINANCE') {
    try {
      // Only the latest actual transaction can establish a fresh execution price.
      // The 24-hour ticker's rolling closeTime advances even when no trade occurs.
      const needClock=Date.now()-(store.clockSyncedAt||0)>60000;
      const [trades]=await Promise.all([
        fetchJson(`${BINANCE_REST}/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=1`,{},4000),
        needClock ? fetchJson(`${BINANCE_REST}/api/v3/time`,{},4000).then(clock=>{
          if(Number(clock?.serverTime)>0){store.clockOffset=Number(clock.serverTime)-Date.now();store.clockSyncedAt=Date.now();}
        }) : null,
      ]);
      const trade=latestAggregateTradeQuote(trades);
      return quoteIsTradable(trade,Date.now()+(store.clockOffset||0)) ? trade : null;
    } catch { return null; }
  }
  const quotes = await getQuotes([symbol]);
  const q = quotes[symbol];
  if (quoteIsTradable(q,Date.now()+(store.clockOffset||0))) return { price:Number(q.price),source:q.source };

  // Browser-supplied ticks are useful diagnostics but are attacker-controlled;
  // they must never decide a real or demo financial outcome. If authoritative
  // providers are unavailable, callers retry and eventually void safely.
  return null;
}

/** Record a client-observed price (used only as a settlement fallback). */
export async function recordTick(symbol, price, userId) {
  if (!Number.isFinite(price) || price <= 0) return;
  await sql(`INSERT INTO market_ticks (symbol, price, source, user_id) VALUES ($1,$2,'CLIENT',$3)`, [
    symbol,
    price,
    userId,
  ]);
  // Opportunistic cleanup so the table stays small.
  if (Math.random() < 0.02) {
    await sql(`DELETE FROM market_ticks WHERE created_at < NOW() - INTERVAL '1 hour'`);
  }
}

/* ------------------------------------------------------------------ *
 * Candles (OHLC history to seed the chart)
 * ------------------------------------------------------------------ */
const BINANCE_INTERVAL = { '1s': '1s', '5s': '1s', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h' };

export async function getCandles(symbol, interval = '1m', limit = 300) {
  const key = `${symbol}:${interval}:${limit}`;
  const cached = store.candles.get(key);
  if (cached && Date.now() - cached.ts < CANDLE_TTL) return cached.data;

  const asset = await getAsset(symbol);
  if (!asset) return null;
  let candles = null;

  try {
    if (asset.provider === 'OTC') {
      const { getOtcCandles } = await import('../../otc/service');
      candles = await getOtcCandles(symbol, interval, limit);
    } else if (asset.provider === 'BINANCE') {
      const iv = BINANCE_INTERVAL[interval] || '1m';
      const rows = await fetchJson(
        `${BINANCE_REST}/api/v3/klines?symbol=${symbol}&interval=${iv}&limit=${Math.min(interval==='5s'?limit*5:limit,1000)}`
      );
      candles = rows.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      }));
      if(interval==='5s')candles=aggregateCandles(candles,5,1).slice(-limit);
     } else if(COMMODITY_MAP[symbol]?.metal){
      await getQuotes([symbol]);
      candles=observedCandles(store.observations.get(symbol),({'1s':1,'1m':60,'5m':300,'15m':900,'1h':3600}[interval]||60),limit);
    } else {
      const mapped = asset.category === 'INDEX' ? asset.feedSymbol : yahooSymbol(symbol, asset.category);
      if (mapped) {
        const range = ['1m','1s','5s'].includes(interval) ? '1d' : interval === '5m' ? '5d' : '1mo';
        let res=await fetchYahooChart(mapped,['1s','5s'].includes(interval)?'1m':interval,range,fetchJson);
        candles=yahooCandles(res,interval,limit,asset.category);
        if(!candles.length && range==='1d') {
          res=await fetchYahooChart(mapped,'1m','5d',fetchJson);
          candles=yahooCandles(res,interval,limit,asset.category);
        }
        store.candleMeta ||= new Map();
        store.candleMeta.set(key,{source:'YAHOO',realtime:false,delayed:true,...yahooMarketState(res.meta,Date.now()+(store.clockOffset||0))});
      }
    }
  } catch {
    candles = null;
  }

  if (candles?.length) store.candles.set(key, { ts: Date.now(), data: candles });
  return candles;
}

export function candleFeedMetadata(symbol, interval='1m', limit=300) {
  return store.candleMeta?.get(`${symbol}:${interval}:${limit}`) || null;
}
