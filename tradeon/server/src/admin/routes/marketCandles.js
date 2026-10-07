import { getCandles, candleFeedMetadata } from '../lib/market.js';
import { json, fail, route } from '../http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  const requestedInterval = url.searchParams.get('interval') || '1m';
  const interval = ['1s','5s','1m','5m','15m','1h'].includes(requestedInterval) ? requestedInterval : '1m';
  const requestedLimit = Number(url.searchParams.get('limit') || 300);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1,Math.min(Math.floor(requestedLimit),1000)) : 300;
  if (!symbol) return fail('symbol is required.');

  const candles = await getCandles(symbol, interval, limit);
  if (!candles?.length) return json({ candles: [], feed: 'OFFLINE' }, 200);
  const metadata=candleFeedMetadata(symbol,interval,limit);
  return json({ candles, feed:metadata?.realtime===false ? 'DELAYED' : 'LIVE', ...metadata });
});
