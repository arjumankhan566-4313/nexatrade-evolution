// Central environment access. Only this module reads process.env — everything
// else imports from here, so the migration map stays auditable in one place.
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins,
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  // OTC engine + real-market reference feed.
  otcEngineEnabled: process.env.OTC_ENGINE_ENABLED !== 'false',
  referenceFeedEnabled: process.env.OTC_REFERENCE_FEED_ENABLED !== 'false',
  referenceFeedIntervalMs: Number(process.env.OTC_REFERENCE_FEED_INTERVAL_MS ?? 30000),
  // Optional paid providers (key-free public providers are the default).
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? '',
  polygonApiKey: process.env.POLYGON_API_KEY ?? '',
  // Owner account provisioning (used by config/bootstrap.ts at startup).
  // NO built-in default password — the operator must supply one.
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? '',
  adminInitialPassword: process.env.ADMIN_INITIAL_PASSWORD ?? '',
  adminEmail: process.env.ADMIN_EMAIL ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  adminName: process.env.ADMIN_NAME ?? '',
} as const;

if (env.nodeEnv === 'production' && !env.jwtSecret) {
  // Mirrors the legacy app's production rule — fail fast, never guess a secret.
  throw new Error('JWT_SECRET is required in production');
}
