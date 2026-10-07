/** Direct legacy port for the admin activity chart. */
/**
 * Finnhub real-time WebSocket relay (forex / metals / commodities).
 *
 * Module 4.1 asks for a true streaming feed for non-crypto instruments. Crypto
 * is streamed by the browser straight from Binance; for FX we cannot expose the
 * provider key to the client, so the server keeps ONE upstream socket open and
 * fans the ticks out to every browser through /api/market/stream (SSE).
 *
 * Node 22 ships a global WebSocket, so no extra dependency is required.
 *
 * On serverless hosts a socket cannot outlive a request — the relay simply
 * never reaches "live" there and `market.js` transparently falls back to the
 * REST providers. On a long-running host (Render, VPS, Docker) it upgrades
 * itself to a genuine push feed within a second of the first request.
 */
const FINNHUB_WS = 'wss://ws.finnhub.io';

import { finnhubSymbol } from './symbols';

/**
 * The relay is symbol-agnostic: any instrument in the catalogue that Finnhub
 * can name (FX & metals through OANDA, equities by plain ticker) is streamable.
 * Mappings are learned as pages subscribe, so adding an asset in the admin
 * panel makes it streamable with no code change.
 */
const g = globalThis;
if (!g.__nexaFinnhub) {
  g.__nexaFinnhub = {
    socket: null, status: 'idle', prices: new Map(), subscribed: new Set(),
    map: new Map(), reverse: new Map(), retry: 0, timer: null,
  };
}
const relay = g.__nexaFinnhub;

function canRun() {
  if (!process.env.FINNHUB_API_KEY) return false;
  // Serverless functions are frozen between requests — a socket is pointless.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  if (typeof WebSocket === 'undefined') return false;
  return true;
}

/** Accepts asset objects ({symbol, category}) or bare symbols. */
function learn(entries) {
  for (const entry of entries) {
    const symbol = typeof entry === 'string' ? entry : entry?.symbol;
    if (!symbol) continue;
    const category =
      typeof entry === 'string'
        ? /^[A-Z]{6}$/.test(symbol) ? 'FOREX' : 'COMMODITY'
        : entry.category;
    if (category === 'CRYPTO' || category === 'INDEX') continue; // Binance / no WS feed
    const mapped = finnhubSymbol(symbol, category);
    if (!mapped) continue;
    relay.map.set(symbol, mapped);
    relay.reverse.set(mapped, symbol);
  }
}

function subscribe(entries) {
  learn(entries);
  if (relay.status !== 'live' || !relay.socket) return;
  // Finnhub caps concurrent subscriptions — keep the most recently requested.
  for (const entry of entries) {
    const symbol = typeof entry === 'string' ? entry : entry?.symbol;
    const mapped = relay.map.get(symbol);
    if (!mapped || relay.subscribed.has(mapped)) continue;
    if (relay.subscribed.size >= 50) break;
    relay.subscribed.add(mapped);
    try {
      relay.socket.send(JSON.stringify({ type: 'subscribe', symbol: mapped }));
    } catch {
      /* socket closing — the reconnect will resubscribe */
    }
  }
}

function connect() {
  if (!canRun() || relay.status === 'connecting' || relay.status === 'live') return;
  relay.status = 'connecting';

  let socket;
  try {
    socket = new WebSocket(`${FINNHUB_WS}?token=${process.env.FINNHUB_API_KEY}`);
  } catch {
    relay.status = 'offline';
    return;
  }
  relay.socket = socket;

  socket.addEventListener('open', () => {
    relay.status = 'live';
    relay.retry = 0;
    const pending = [...relay.subscribed].map((m) => relay.reverse.get(m)).filter(Boolean);
    relay.subscribed.clear();
    subscribe(pending.length ? pending : [...relay.map.keys()]);
    console.log(`[finnhub] realtime relay connected (${relay.subscribed.size} symbols)`);
  });

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
      if (msg?.type !== 'trade' || !Array.isArray(msg.data)) return;
      for (const tick of msg.data) {
        const symbol = relay.reverse.get(tick.s);
        if (!symbol || !Number.isFinite(tick.p) || !Number.isFinite(tick.t) || tick.t <= 0) continue;
        const previous=relay.prices.get(symbol);
        if(previous && tick.t < previous.ts) continue;
        relay.prices.set(symbol, { price:Number(tick.p), source:'FINNHUB_WS', ts:Number(tick.t), realtime:true });
      }
    } catch {
      /* ignore malformed frames */
    }
  });

  const drop = () => {
    if (relay.status === 'closed') return;
    relay.status = 'offline';
    relay.subscribed.clear();
    relay.retry += 1;
    clearTimeout(relay.timer);
    relay.timer = setTimeout(connect, Math.min(30_000, 2000 * 2 ** Math.min(relay.retry, 4)));
    relay.timer.unref?.();
  };
  socket.addEventListener('close', drop);
  socket.addEventListener('error', drop);
}

/** Ensures the relay is running and subscribed to the given symbols. */
export function ensureRelay(entries = []) {
  if (!canRun()) return false;
  learn(entries);
  connect();
  subscribe(entries);
  return true;
}

/** Fresh push-quote for a symbol, or null when the relay has nothing recent. */
export function getRelayQuote(symbol, maxAgeMs = 15_000) {
  const q = relay.prices.get(symbol);
  if (!q) return null;
  return Date.now() - q.ts <= maxAgeMs ? { ...q } : null;
}

export function relayStatus() {
  return {
    status: relay.status,
    symbols: relay.prices.size,
    subscriptions: relay.subscribed.size,
    enabled: canRun(),
  };
}
