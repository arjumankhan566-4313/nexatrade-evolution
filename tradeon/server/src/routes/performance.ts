/**
 * Public performance RUM (Real-User Monitoring) endpoint.
 *
 * POST /api/performance/rum — accepts batched performance data from the browser.
 * No admin auth required (collects from all users), but rate-limited and
 * sanitized. No personal data is stored — only performance metrics.
 */
import { Router } from 'express';
import { recordRum } from '../performance/collector';

export const performanceRouter = Router();

// Simple in-memory rate limiter (per IP, per minute)
const rateMap = new Map();
const RATE_LIMIT = 30; // max 30 beacons/min/IP

performanceRouter.post('/performance/rum', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const window = 60000;

  // Clean old entries
  if (rateMap.has(ip)) {
    const entries = (rateMap.get(ip) ?? []).filter((t: number) => now - t < window);
    if (entries.length >= RATE_LIMIT) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    entries.push(now);
    rateMap.set(ip, entries);
  } else {
    rateMap.set(ip, [now]);
  }

  // Accept single or batched entries
  const data = req.body;
  if (Array.isArray(data)) {
    for (const entry of data) recordRum(entry);
  } else if (data) {
    recordRum(data);
  }

  // 204 No Content — beacon doesn't need a response body
  res.status(204).end();
});
