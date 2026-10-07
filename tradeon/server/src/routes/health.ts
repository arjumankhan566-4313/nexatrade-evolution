import { Router } from 'express';
import { env } from '../config/env';
import { pool } from '../config/db';
import { engineHealth } from '../otc/runner';
import { getReferenceFeedHealth } from '../referenceFeed';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let database = 'not configured';
  if (env.databaseUrl) {
    try {
      await pool.query('SELECT 1');
      database = 'connected';
    } catch (err) {
      database = `error: ${(err as Error).message}`;
    }
  }
  res.json({
    status: 'ok',
    service: 'nexatrade-v2-server',
    module: 'skeleton + auth',
    uptimeSeconds: Math.floor(process.uptime()),
    database,
  });
});

healthRouter.get('/health/otc', (_req, res) => {
  res.json({
    engine: engineHealth(),
    referenceFeed: getReferenceFeedHealth(),
  });
});
