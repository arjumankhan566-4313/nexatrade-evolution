/** Combine reported sub-candles without interpolating prices or empty periods. */
export function aggregateCandles(rows, seconds = 5, timeUnit = 1) {
  const buckets = new Map();
  for (const row of rows || []) {
    if (![row.time, row.open, row.high, row.low, row.close].every(Number.isFinite)) continue;
    const time = Math.floor(row.time / (seconds * timeUnit)) * seconds * timeUnit;
    const previous = buckets.get(time);
    const parts = new Map(previous?._parts || []);
    parts.set(row.time, { ...row });
    buckets.set(time, combineParts(time, parts));
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function combineParts(time, parts) {
  const rows = [...parts.values()].sort((a, b) => a.time - b.time);
  const last = rows.at(-1);
  return {
    time, open: rows[0].open, close: last.close,
    high: Math.max(...rows.map(r => r.high)), low: Math.min(...rows.map(r => r.low)),
    volume: rows.every(r => Number.isFinite(r.volume)) ? rows.reduce((n, r) => n + r.volume, 0) : null,
    lastTradeId: last.lastTradeId ?? null, _parts: [...parts],
  };
}

/** Replace a cumulative 1s frame, retaining earlier seconds of its 5s candle. */
export function mergeIntervalPart(previous, part, seconds = 5, timeUnit = 1000) {
  const time = Math.floor(part.time / (seconds * timeUnit)) * seconds * timeUnit;
  if (previous?.time > time) return previous;
  const parts = new Map(previous?.time === time ? previous._parts : []);
  const earlier = parts.get(part.time);
  if (earlier?.lastTradeId != null && part.lastTradeId != null && part.lastTradeId < earlier.lastTradeId) return previous;
  parts.set(part.time, part);
  return combineParts(time, parts);
}
