import 'dotenv/config';
import http from 'http';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { pool } from './config/db';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { otcMarketRouter } from './routes/otcMarket';
import { otcAdminRouter } from './routes/otcAdmin';
import { tradesRouter } from './routes/trades';
import { notificationsRouter } from './routes/notifications';
import { adminRouter } from './routes/admin';
import { adminPortalRouter, adminMarketRouter } from './routes/adminPortal';
import { createSocketServer } from './sockets';
import { performanceRouter } from './routes/performance';
import { recordApi } from './performance/collector';
import { ensureEngine, stopEngine } from './otc/runner';
import { bootstrapReferenceFeed, stopReferenceFeed } from './referenceFeed';
import { startTradeEngine, stopTradeEngine, settleDue } from './trade/engine';
import { bootstrapDatabase } from './config/bootstrap';

const app = express();
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// REST controllers are mounted under /api — module by module as approved.
// Performance monitoring middleware — records API request timing.
// Must be before route mounting so res.on('finish') captures all routes.
app.use((req: any, res: any, next: any) => {
  if (req.path.startsWith('/api') && !req.path.startsWith('/api/performance/rum')) {
    const start = Date.now();
    res.on('finish', () => {
      recordApi(req.method, req.path, res.statusCode, Date.now() - start);
    });
  }
  next();
});

app.use('/api', healthRouter);
app.use('/api', adminMarketRouter);
app.use('/api', performanceRouter);
app.use('/api/auth', authRouter);
app.use('/api/market/otc', otcMarketRouter);
app.use('/api/admin', adminPortalRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/otc', otcAdminRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/notifications', notificationsRouter);

// Settle due positions at the start of each request (serverless fallback,
// ported from legacy tradeEngine.settleDue in the API router middleware).
app.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'POST') settleDue().catch(() => {});
  next();
});

const httpServer = http.createServer(app);
const { io, close } = createSocketServer(httpServer);

// Standalone database bootstrap (ported from legacy src/lib/db.js): creates
// the full schema, applies column patches and seeds reference data + the
// owner account before the server accepts traffic. Idempotent on every boot.
// A bootstrap failure is logged but never prevents the server from starting.
bootstrapDatabase()
  .then(() => console.log('[nexatrade] database bootstrap complete'))
  .catch((err: unknown) => {
    console.error('[nexatrade] database bootstrap failed:', (err as Error)?.message || err);
  });

httpServer.listen(env.port, '0.0.0.0', () => {
  console.log(
    `[nexatrade-v2] REST + Socket.io listening on :${env.port} (${env.nodeEnv})`
  );
  // Start the 1s settlement timer (legacy: tradeEngine.start).
  startTradeEngine();
});

process.on('SIGTERM', () => {
  // Graceful shutdown: stop the trade engine, reference feed, flush +
  // checkpoint the OTC engine, release leadership.
  stopTradeEngine();
  stopReferenceFeed();
  stopEngine().catch(() => {});
  close();
  io.close();
  httpServer.close(() => process.exit(0));
});

/**
 * OTC pricing engine bootstrap — ported from legacy src/instrumentation.js.
 * Deliberately NOT spawned inside an API request; the engine is a singleton on
 * globalThis and leadership is elected in the database, so a second process
 * (e.g. the legacy Next.js worker) that owns the lock keeps this one a
 * read-only standby. Never blocks server startup.
 */
if (process.env.OTC_ENGINE_ENABLED === 'false') {
  console.log('[nexatrade] OTC engine disabled via OTC_ENGINE_ENABLED=false');
} else {
  ensureEngine()
    .then((engine) => {
      console.log(
        `[nexatrade] OTC engine ${engine.running ? 'running' : `standby (${engine.leaderMode})`}` +
          `${engine.runtimes?.size ? ` · ${engine.runtimes.size} instruments` : ''}`
      );
      // Real-market reference feed: anchor the synthetic stream toward public
      // market prices once this process is the active leader. The feed itself
      // re-checks leadership every cycle, so a standby never anchors.
      const symbols = engine.running ? [...(engine.runtimes?.keys() ?? [])] : [];
      if (engine.running && symbols.length) {
        bootstrapReferenceFeed(symbols);
      } else {
        // Even on standby, configure so health reports the disabled state.
        bootstrapReferenceFeed([]);
      }
    })
    .catch((err: unknown) => {
      console.warn('[nexatrade] OTC engine did not start:', (err as Error)?.message || err);
    });
}

export { app, pool };
