/** Direct legacy port for the admin activity chart. */
/** Public quote parsing. Provider timestamps are kept separate from request time. */
export const YAHOO_CHART_ORIGINS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

export async function fetchYahooChart(symbol, interval, range, fetchJson) {
  let lastError;
  for (const origin of YAHOO_CHART_ORIGINS) {
    try {
      const payload = await fetchJson(`${origin}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, {
        headers: { 'user-agent': 'Mozilla/5.0 TRADEON' },
      }, 4000);
      const result = payload?.chart?.result?.[0];
      if (!result?.meta || payload?.chart?.error) throw new Error('Market data unavailable');
      return result;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Market data unavailable');
}

export function yahooMarketState(meta, now = Date.now()) {
  const regular = meta?.currentTradingPeriod?.regular;
  const start = Number(regular?.start) * 1000, end = Number(regular?.end) * 1000;
  const known = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const marketClosed = known ? now < start || now >= end : null;
  return {
    marketClosed,
    marketState: marketClosed == null ? 'UNKNOWN' : marketClosed ? 'CLOSED' : 'OPEN',
    nextOpen: known && now < start ? start : null,
    exchangeTimezone: meta?.exchangeTimezoneName || null,
  };
}

export function yahooQuote(result, category, now = Date.now()) {
  const meta = result?.meta, price = Number(meta?.regularMarketPrice), ts = Number(meta?.regularMarketTime) * 1000;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts) || ts <= 0) return null;
  const index = result?.timestamp?.findLastIndex(t => Number(t) * 1000 <= ts) ?? -1;
  const reportedVolume = result?.indicators?.quote?.[0]?.volume?.[index];
  const previousClose = Number(meta?.previousClose || meta?.chartPreviousClose);
  return {
    price, source: 'YAHOO', ts, realtime: false, delayed: true,
    changePct: previousClose > 0 ? (price / previousClose - 1) * 100 : null,
    // Currency feeds do not report traded volume; a provider's zero is not volume evidence.
    volume: category === 'FOREX' || reportedVolume == null ? null : Number(reportedVolume),
    ...yahooMarketState(meta, now),
  };
}

export function yahooCandles(result, interval = '1m', limit = 300, category) {
  const q = result?.indicators?.quote?.[0];
  if (!Array.isArray(result?.timestamp) || !q) return [];
  const seconds = { '1s': 60, '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }[interval] || 60;
  const buckets = new Map();
  result.timestamp.forEach((rawTime, i) => {
    const time = Math.floor(Number(rawTime) / seconds) * seconds;
    const values = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if (!Number.isFinite(time) || time <= 0 || values.some(value => value == null || !Number.isFinite(Number(value)) || Number(value) <= 0)) return;
    const [open, high, low, close] = values.map(Number);
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) return;
    const rawVolume = q.volume?.[i];
    const volume = category === 'FOREX' || rawVolume == null || !Number.isFinite(Number(rawVolume)) || Number(rawVolume) < 0 ? null : Number(rawVolume);
    const previous = buckets.get(time);
    // Yahoo includes an extra current snapshot timestamp in the same minute.
    // Merge its prices into that minute instead of creating an off-grid candle.
    buckets.set(time, previous ? {
      time, open: previous.open, high: Math.max(previous.high, high), low: Math.min(previous.low, low), close,
      volume: previous.volume == null ? volume : volume == null ? previous.volume : Math.max(previous.volume, volume),
    } : { time, open, high, low, close, volume });
  });
  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-Math.max(1, limit));
}

/** Polygon conversion timestamps may be milliseconds or nanoseconds. */
export function providerEpochMs(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value >= 1e17 ? Math.floor(value / 1e6) : value >= 1e14 ? Math.floor(value / 1e3) : value < 1e11 ? value * 1000 : value;
}
