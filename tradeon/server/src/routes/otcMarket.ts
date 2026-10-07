/**
 * OTC market REST routes — ported 1:1 from the legacy Next.js API routes
 * (src/app/api/market/otc/{assets,snapshot,candles}) with identical response
 * shapes and status codes, now as Express endpoints under /api/market/otc.
 */
import { Router } from 'express';
import {
  listOtcAssets,
  listOtcPayouts,
  getOtcSnapshot,
  getOtcCandles,
  getOtcCandlesBefore,
  otcStatus,
  isOtcSymbol,
  OTC_TIMEFRAMES,
  OTC_DISCLOSURE,
} from '../otc/service';
import { otcIconUrlVersioned } from '../otc/instrumentIcons';
import { PAYOUT_STEP_MS } from '../otc/payouts';

export const otcMarketRouter = Router();

const fail = (res: import('express').Response, message: string, status = 400) =>
  res.status(status).json({ error: message });

/* GET /api/market/otc/assets — the OTC instrument catalogue. */
otcMarketRouter.get('/assets', async (_req, res) => {
  const assets = await listOtcAssets();
  res.json({
    // `icon` is the instrument's official bundled artwork (company mark, coin
    // mark, currency flags, …) — the trading UI renders it next to the name.
    assets: assets.map((a) => ({
      ...a,
      icon: otcIconUrlVersioned(a.symbol, a.category, a.base),
    })),
    total: assets.length,
    marketType: 'OTC',
    synthetic: true,
    disclosure: OTC_DISCLOSURE,
    serverTime: Date.now(),
  });
});

/**
 * GET /api/market/otc/payouts — the live payout every OTC instrument is
 * offering right now, for all six categories. Read-only and in-memory (no
 * database roundtrip), so the market list and the header tabs can refresh it
 * on a short interval and show rates that actually move.
 */
otcMarketRouter.get('/payouts', (_req, res) => {
  const payouts = listOtcPayouts();
  res.json({
    payouts,
    total: Object.keys(payouts).length,
    stepMs: PAYOUT_STEP_MS,
    serverTime: Date.now(),
  });
});

/**
 * GET /api/market/otc/snapshot — authoritative snapshot for one instrument:
 * current price, forming candle, latest sequence and LIVE/PAUSED/DISABLED
 * status. The client merges this with the REST history.
 */
otcMarketRouter.get('/snapshot', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const timeframe = String(req.query.interval || '1m');
  if (!symbol) return fail(res, 'symbol is required.');
  if (!isOtcSymbol(symbol)) return fail(res, 'Not an OTC symbol.');

  const [snapshot, status] = await Promise.all([getOtcSnapshot(symbol, timeframe), otcStatus(symbol)]);
  if (!snapshot) return fail(res, 'Unknown OTC market.', 404);
  res.json({ snapshot, status, serverTime: Date.now() });
});

/**
 * GET /api/market/otc/candles — OTC candle history. Renders immediately from
 * persisted candles; the client then opens the Socket.io gateway and merges
 * the authoritative snapshot. With `before`, returns a paginated page of
 * older candles (nextCursor + hasMore) for deep-history lazy loading.
 */
otcMarketRouter.get('/candles', async (req, res) => {
  const symbol = String(req.query.symbol || '').toUpperCase();
  const timeframe = String(req.query.interval || req.query.timeframe || '1m');
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 300), 2000);
  const before = req.query.before ? String(req.query.before) : null;
  if (!symbol) return fail(res, 'symbol is required.');
  if (!isOtcSymbol(symbol)) return fail(res, 'Not an OTC symbol.');
  if (!OTC_TIMEFRAMES.some((t) => t.value === timeframe)) return fail(res, 'Unsupported OTC timeframe.');

  // Paginated deep-history mode.
  if (before) {
    const result = await getOtcCandlesBefore(symbol, timeframe, Number(before), limit);
    return res.json({
      candles: result.candles,
      feed: 'OTC',
      marketType: 'OTC',
      synthetic: true,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      serverTime: Date.now(),
    });
  }

  const candles = await getOtcCandles(symbol, timeframe, limit);
  const snapshot = await getOtcSnapshot(symbol, timeframe);
  res.json({
    candles,
    feed: 'OTC',
    marketType: 'OTC',
    synthetic: true,
    snapshot,
    serverTime: Date.now(),
  });
});
