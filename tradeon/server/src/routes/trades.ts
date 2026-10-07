/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Trade REST routes — ported 1:1 from legacy src/controllers/tradeController.js
 * + src/routes/tradeRoutes.js.
 *
 * Endpoints (all require authentication via getSessionUser):
 *   POST   /api/trades                  — place a trade
 *   GET    /api/trades/active            — open positions
 *   GET    /api/trades/history           — closed positions
 *   GET    /api/trades/analytics         — user analytics
 *   GET    /api/trades/leaderboard       — top traders
 *   GET    /api/trades/signals           — RSI-14 trading signals
 *   GET    /api/trades/achievements      — achievement badges
 *   GET    /api/trades/copy/subscriptions
 *   POST   /api/trades/copy/subscribe
 *   POST   /api/trades/copy/unsubscribe
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { Router, type Request, type Response } from 'express';
import { getSessionUser } from '../lib/auth';
import {
  placeTrade,
  resolveTrade,
  settleDue,
  ALLOWED_DURATIONS,
  MIN_AMOUNT,
  MAX_AMOUNT,
} from '../trade/engine';
import {
  pendingForUser,
  closedByUser,
  analytics,
  leaderboard,
  copySubscriptionsFor,
  upsertCopySubscription,
  deactivateCopySubscription,
} from '../trade/store';
import { getEngine, currentSnapshot } from '../otc/runner';
import { getOtcInstrument, loadOtcInstruments } from '../otc/store';
import { one, many, sql, uuid } from '../config/db';
import { rateLimit } from '../lib/http';

export const tradesRouter = Router();

/** Auth guard — identical to legacy `auth` middleware. */
async function requireUser(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized. Please sign in.' });
    return null;
  }
  return user;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/* POST /api/trades — place a trade --------------------------------- */
tradesRouter.post('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  // Legacy 450ms double-click limit (checked locally on the client too).
  const key = `trade:${user.id}`;
  if (!rateLimit(key, 1, 450)) {
    return res.status(429).json({ error: 'Too fast. Please wait a moment.' });
  }

  // Settle due positions before opening a new one (serverless fallback).
  await settleDue().catch(() => {});

  try {
    const trade = await placeTrade(user.id, req.body || {});
    res.json({ trade });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/* GET /api/trades/active — open positions -------------------------- */
tradesRouter.get('/active', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const trades = await pendingForUser(user.id);
  res.json({ trades });
});

/* GET /api/trades/history — closed positions ---------------------- */
tradesRouter.get('/history', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const limit = parseInt(String(req.query.limit), 10) || 100;
  const trades = await closedByUser(user.id, limit);
  res.json({ trades });
});

/* GET /api/trades/analytics — user analytics ---------------------- */
tradesRouter.get('/analytics', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const a = await analytics(user.id);
  res.json({ analytics: a });
});

/* GET /api/trades/leaderboard — top traders ----------------------- */
tradesRouter.get('/leaderboard', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.query.period === 'week') {
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    monday.setUTCHours(0, 0, 0, 0);
    const rows = (await many(
      `SELECT u.id, u.full_name, COUNT(t.id) AS trades,
         COALESCE(SUM(t.profit), 0) AS profit
       FROM users u
       LEFT JOIN trades t ON t.user_id = u.id AND t.status != 'PENDING' AND t.created_at >= $1
       WHERE u.role = 'USER'
       GROUP BY u.id HAVING COUNT(t.id) > 0
       ORDER BY profit DESC LIMIT 10`,
      [monday.toISOString()],
    )) as Record<string, any>[];
    return res.json({
      leaderboard: rows.map((r) => ({ ...r, profit: round2(Number(r.profit)) })),
      contest: {
        name: 'Weekly Nova Contest',
        prize_pool: 500,
        prizes: [250, 150, 100],
        ends_at: new Date(monday.getTime() + 7 * 86400000).toISOString(),
      },
    });
  }

  const lb = await leaderboard(10);
  res.json({ leaderboard: lb });
});

/* GET /api/trades/signals — RSI-14 + short trend per active asset -- */
let signalCache: { at: number; data: any[] } = { at: 0, data: [] };

tradesRouter.get('/signals', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  if (Date.now() - signalCache.at < 15000) {
    return res.json({ signals: signalCache.data, cached: true });
  }

  const out: any[] = [];
  const engine = getEngine();
  if (engine?.running) {
    const instruments = await loadOtcInstruments({ activeOnly: true });
    for (const a of instruments) {
      // Use the engine's 1m finalized candles for RSI calculation.
      const runtime = engine.runtimes.get(a.symbol);
      const candles = runtime?.candles.get('1m')?.finalized || [];
      if (candles.length < 20) continue;
      const closes = candles.map((c) => c.close);
      let gain = 0, loss = 0;
      for (let i = 1; i <= 14; i++) {
        const ch = closes[closes.length - i] - closes[closes.length - i - 1];
        if (ch >= 0) gain += ch; else loss -= ch;
      }
      gain /= 14; loss /= 14;
      const rsi = loss === 0 ? 100 : Math.max(0, Math.min(100, 100 - 100 / (1 + gain / loss)));
      const trendRef = closes[closes.length - 11] || closes[0];
      const trendPct = ((closes[closes.length - 1] - trendRef) / trendRef) * 100;
      const snap = currentSnapshot(engine, a.symbol, '1m');
      out.push({
        symbol: a.symbol,
        display_name: a.display_name,
        rsi: Math.round(rsi * 10) / 10,
        signal: rsi >= 70 ? 'OVERBOUGHT' : rsi <= 30 ? 'OVERSOLD' : 'NEUTRAL',
        suggestion: rsi >= 70 ? 'SELL ZONE' : rsi <= 30 ? 'BUY ZONE' : 'WAIT',
        trend_pct: Math.round(trendPct * 100) / 100,
        price: snap?.price ?? null,
      });
    }
    out.sort((x, y) => Math.abs(50 - x.rsi) - Math.abs(50 - y.rsi));
  }

  signalCache = { at: Date.now(), data: out };
  res.json({ signals: out });
});

/* GET /api/trades/achievements — achievement badges ---------------- */
const ACHIEVEMENT_DEFS = [
  ['FIRST_TRADE', '🎯', 'First Steps', 'Place your first trade', (s: any) => s.total >= 1, (s: any) => [s.total, 1]],
  ['TEN_TRADES', '🔟', 'Getting Serious', 'Close 10 trades', (s: any) => s.total >= 10, (s: any) => [s.total, 10]],
  ['FIFTY_TRADES', '🏗️', 'Half Century', 'Close 50 trades', (s: any) => s.total >= 50, (s: any) => [s.total, 50]],
  ['FIRST_WIN', '✨', 'First Blood', 'Win your first trade', (s: any) => s.wins >= 1, (s: any) => [s.wins, 1]],
  ['STREAK3', '🔥', 'Hot Streak', 'Win 3 trades in a row', (s: any) => s.max_streak >= 3, (s: any) => [s.max_streak, 3]],
  ['STREAK5', '⚡', 'Unstoppable', 'Win 5 trades in a row', (s: any) => s.max_streak >= 5, (s: any) => [s.max_streak, 5]],
  ['PROFIT100', '💰', 'Profit Maker', 'Reach +$100 net P&L', (s: any) => s.net_pnl >= 100, (s: any) => [Math.max(0, s.net_pnl), 100]],
  ['PROFIT1000', '🚀', 'Nova Whale', 'Reach +$1,000 net P&L', (s: any) => s.net_pnl >= 1000, (s: any) => [Math.max(0, s.net_pnl), 1000]],
  ['EXPLORER', '🧭', 'Explorer', 'Trade 5 different markets', (s: any) => s.distinct_symbols >= 5, (s: any) => [s.distinct_symbols, 5]],
  ['INVITER', '👥', 'Community Builder', 'Invite a friend with your referral link', (s: any) => s.referrals >= 1, (s: any) => [s.referrals, 1]],
  ['VERIFIED', '🪪', 'Verified Trader', 'Complete KYC identity verification', (s: any) => s.kyc === 'APPROVED', () => [1, 1]],
  ['FORTRESS', '🛡️', 'Fortress', 'Enable two-factor authentication', (s: any) => s.twofa, () => [1, 1]],
] as const;

tradesRouter.get('/achievements', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const a = await analytics(user.id);
  const streakRows = (await many(
    `SELECT status FROM trades WHERE user_id = $1 AND status != 'PENDING' ORDER BY expires_at ASC`,
    [user.id],
  )) as Record<string, any>[];
  let streak = 0, maxStreak = 0;
  for (const r of streakRows) {
    streak = r.status === 'WIN' ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }

  const distinctRow = await one(`SELECT COUNT(DISTINCT symbol) AS c FROM trades WHERE user_id = $1`, [user.id]);
  const referralRow = await one(`SELECT COUNT(*) AS c FROM users WHERE referred_by = $1`, [user.id]);
  const kycRow = await one(`SELECT kyc_status FROM users WHERE id = $1`, [user.id]);
  const twofaRow = await one(`SELECT totp_enabled FROM users WHERE id = $1`, [user.id]);

  const stats = {
    total: a.total,
    wins: a.wins,
    net_pnl: a.net_pnl,
    max_streak: maxStreak,
    distinct_symbols: Number((distinctRow as Record<string, any>)?.c || 0),
    referrals: Number((referralRow as Record<string, any>)?.c || 0),
    kyc: (kycRow as Record<string, any>)?.kyc_status,
    twofa: Boolean((twofaRow as Record<string, any>)?.totp_enabled),
  };

  const achievements = ACHIEVEMENT_DEFS.map(([code, icon, name, desc, cond, prog]) => {
    const [cur, target] = (prog as (s: any) => [number, number])(stats);
    return {
      code,
      icon,
      name,
      desc,
      earned: (cond as (s: any) => boolean)(stats),
      progress: Math.min(1, target ? cur / target : 0),
      current: cur,
      target,
    };
  });

  res.json({
    achievements,
    stats: {
      ...stats,
      earned_count: achievements.filter((x) => x.earned).length,
      total_count: achievements.length,
    },
  });
});

/* ------------------------- Copy trading ------------------------- */
tradesRouter.get('/copy/subscriptions', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const subs = await copySubscriptionsFor(user.id);
  res.json({ subscriptions: subs });
});

tradesRouter.post('/copy/subscribe', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { leader_id, amount_per_trade } = req.body || {};
  const leader = await one('SELECT id FROM users WHERE id = $1', [leader_id]);
  if (!leader || leader_id === user.id) {
    return res.status(400).json({ error: 'Pick a valid trader to copy (not yourself).' });
  }
  const amt = Math.round(parseFloat(String(amount_per_trade)) * 100) / 100;
  if (!Number.isFinite(amt) || amt < 1 || amt > 10000) {
    return res.status(400).json({ error: 'Amount per trade must be $1-$10,000.' });
  }
  await upsertCopySubscription(user.id, leader_id, amt);
  const leaderName = await one('SELECT full_name FROM users WHERE id = $1', [leader_id]);
  res.json({
    ok: true,
    leader: { id: leader_id, full_name: (leaderName as Record<string, any>)?.full_name },
    amount_per_trade: amt,
  });
});

tradesRouter.post('/copy/unsubscribe', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const { leader_id } = req.body || {};
  await deactivateCopySubscription(user.id, leader_id);
  res.json({ ok: true });
});
