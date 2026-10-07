/**
 * TRADEON v2 — standalone database bootstrap.
 *
 * Ported 1:1 from legacy src/lib/db.js so the v2 server creates the full
 * schema, applies forward-compatible column patches and seeds reference data
 * (system settings, VIP tiers, market catalogue, payment methods, owner
 * accounts) on startup — with zero dependency on the legacy Next.js code.
 *
 * Everything here is idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF
 * NOT EXISTS and ON CONFLICT guards make every boot safe to re-run, and the
 * catalogue is only reinstalled when ASSET_CATALOG_VERSION changes so admin
 * panel edits are never resurrected.
 */
import bcrypt from 'bcryptjs';
import { pool, sql, one, uuid } from './db';
import { env } from './env';
import { DEFAULT_ASSETS, ASSET_CATALOG_VERSION } from '../lib/assetCatalog';

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  full_name          TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  phone              TEXT NOT NULL DEFAULT '',
  country            TEXT NOT NULL DEFAULT '',
  role               TEXT NOT NULL DEFAULT 'USER',
  balance_real       NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_demo       NUMERIC(18,2) NOT NULL DEFAULT 10000,
  kyc_status         TEXT NOT NULL DEFAULT 'NONE',
  custom_yield_ratio NUMERIC(6,2),
  force_loss_user    BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked         BOOLEAN NOT NULL DEFAULT FALSE,
  token_version      INTEGER NOT NULL DEFAULT 1,
  last_login_at      TIMESTAMPTZ,
  last_login_ip      TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country          TEXT NOT NULL,
  doc_type         TEXT NOT NULL,
  doc_number       TEXT NOT NULL DEFAULT '',
  full_name        TEXT NOT NULL DEFAULT '',
  date_of_birth    TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  doc_front        TEXT NOT NULL DEFAULT '',
  doc_back         TEXT NOT NULL DEFAULT '',
  selfie           TEXT NOT NULL DEFAULT '',
  face_match_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  liveness_score   NUMERIC(6,2) NOT NULL DEFAULT 0,
  liveness_report  TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'PENDING',
  reviewer_note    TEXT NOT NULL DEFAULT '',
  reviewed_by      TEXT,
  submitted_ip     TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  symbol        TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  category      TEXT NOT NULL,
  feed_provider TEXT NOT NULL,
  feed_symbol   TEXT NOT NULL,
  payout_rate   NUMERIC(6,2) NOT NULL DEFAULT 85,
  price_digits  INTEGER NOT NULL DEFAULT 2,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- Canonical market catalogue. The app reads and the admin panel writes this
-- table; assets above is kept only as a legacy install artefact.
CREATE TABLE IF NOT EXISTS markets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol            TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'CRYPTO',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  payout_percentage NUMERIC(6,2) NOT NULL DEFAULT 85,
  provider          TEXT NOT NULL DEFAULT 'BINANCE',
  feed_symbol       TEXT NOT NULL DEFAULT '',
  price_digits      INTEGER NOT NULL DEFAULT 2,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_markets_active_category ON markets (is_active, category, sort_order);

CREATE TABLE IF NOT EXISTS trades (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol           TEXT NOT NULL,
  direction        TEXT NOT NULL,
  stake            NUMERIC(18,2) NOT NULL,
  payout_rate      NUMERIC(6,2) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  account_type     TEXT NOT NULL DEFAULT 'DEMO',
  entry_price      NUMERIC(20,8) NOT NULL,
  exit_price       NUMERIC(20,8),
  market_price     NUMERIC(20,8),
  status           TEXT NOT NULL DEFAULT 'OPEN',
  profit           NUMERIC(18,2),
  is_adjusted      BOOLEAN NOT NULL DEFAULT FALSE,
  adjust_reason    TEXT NOT NULL DEFAULT '',
  price_source     TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  settled_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_open ON trades(status, expires_at);

CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  amount       NUMERIC(18,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  method       TEXT NOT NULL,
  reference    TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'PENDING',
  admin_note   TEXT NOT NULL DEFAULT '',
  processed_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  id                    INTEGER PRIMARY KEY,
  target_win_rate       NUMERIC(6,2) NOT NULL DEFAULT 30,
  enable_force_loss     BOOLEAN NOT NULL DEFAULT FALSE,
  risk_engine_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  max_stake             NUMERIC(18,2) NOT NULL DEFAULT 5000,
  min_stake             NUMERIC(18,2) NOT NULL DEFAULT 1,
  min_deposit           NUMERIC(18,2) NOT NULL DEFAULT 10,
  min_withdrawal        NUMERIC(18,2) NOT NULL DEFAULT 20,
  withdrawal_needs_kyc  BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance_mode      BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  email      TEXT NOT NULL DEFAULT '',
  event      TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'INFO',
  ip         TEXT NOT NULL DEFAULT '',
  device     TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON security_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'INFO',
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif ON notifications(user_id, is_read);

-- Price observations reported by authenticated clients. Used only as a
-- fallback source for settlement when the server cannot reach the upstream
-- market API (each row keeps its origin so it is always auditable).
CREATE TABLE IF NOT EXISTS market_ticks (
  id         BIGSERIAL PRIMARY KEY,
  symbol     TEXT NOT NULL,
  price      NUMERIC(20,8) NOT NULL,
  source     TEXT NOT NULL DEFAULT 'CLIENT',
  user_id    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticks ON market_ticks(symbol, created_at DESC);

/* ---------------- social, gamification & realtime ---------------- */

CREATE TABLE IF NOT EXISTS vip_tiers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  min_volume    NUMERIC(18,2) NOT NULL DEFAULT 0,
  payout_bonus  NUMERIC(6,2) NOT NULL DEFAULT 0,
  cashback_pct  NUMERIC(6,2) NOT NULL DEFAULT 0,
  color         TEXT NOT NULL DEFAULT '#8892a6',
  perks         TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tournaments (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  entry_fee     NUMERIC(18,2) NOT NULL DEFAULT 0,
  prize_pool    NUMERIC(18,2) NOT NULL DEFAULT 0,
  guaranteed    NUMERIC(18,2) NOT NULL DEFAULT 0,
  account_type  TEXT NOT NULL DEFAULT 'DEMO',
  status        TEXT NOT NULL DEFAULT 'SCHEDULED',
  prize_split   TEXT NOT NULL DEFAULT '[50,30,20]',
  max_players   INTEGER NOT NULL DEFAULT 0,
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tour_status ON tournaments(status, starts_at DESC);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pnl           NUMERIC(18,2) NOT NULL DEFAULT 0,
  volume        NUMERIC(18,2) NOT NULL DEFAULT 0,
  trades        INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  prize         NUMERIC(18,2) NOT NULL DEFAULT 0,
  final_rank    INTEGER,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS copy_links (
  id           TEXT PRIMARY KEY,
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leader_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'RATIO',
  ratio        NUMERIC(6,2) NOT NULL DEFAULT 100,
  fixed_stake  NUMERIC(18,2) NOT NULL DEFAULT 5,
  max_stake    NUMERIC(18,2) NOT NULL DEFAULT 50,
  account_type TEXT NOT NULL DEFAULT 'DEMO',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  copied       INTEGER NOT NULL DEFAULT 0,
  pnl          NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, leader_id)
);
CREATE INDEX IF NOT EXISTS idx_copy_leader ON copy_links(leader_id, is_active);

-- Append-only realtime bus. Admin mutations and per-user events are written
-- here and streamed to every open session (SSE).
CREATE TABLE IF NOT EXISTS platform_events (
  id         BIGSERIAL PRIMARY KEY,
  topic      TEXT NOT NULL,
  user_id    TEXT,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_id ON platform_events(id DESC);

/* ---------------- dual-mode payments (Module 5) ---------------- */

-- Admin-managed payment methods for the manual deposit rails (bKash, Nagad,
-- bank, USDT, BTC…). Full CRUD lives under the admin finance panel.
CREATE TABLE IF NOT EXISTS payment_methods (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL DEFAULT 'CRYPTO',     -- CRYPTO | LOCAL | BANK | AUTO
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,               -- e.g. USDT_TRC20, BKASH
  instructions  TEXT NOT NULL DEFAULT '',           -- how to pay
  address       TEXT NOT NULL DEFAULT '',           -- wallet number / IBAN / account
  extra         TEXT NOT NULL DEFAULT '',           -- network tag / branch / QR note
  qr_data       TEXT NOT NULL DEFAULT '',           -- raw QR payload for deposits
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device fingerprints for multi-account / fraud detection.
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  hits        INTEGER NOT NULL DEFAULT 1,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_fp ON device_fingerprints(fingerprint);

/* ---------------- affiliate & 40% commission ("Rafi Leon System") ---------------- */

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id          TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip          TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aff_clicks ON affiliate_clicks(referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id                TEXT PRIMARY KEY,
  referrer_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL DEFAULT 'DEPOSIT', -- DEPOSIT | REVENUE_SHARE | TRADE
  source_id         TEXT NOT NULL DEFAULT '',
  gross_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  commission_rate   NUMERIC(6,2) NOT NULL DEFAULT 40.00,
  commission_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'CREDITED', -- CREDITED | PENDING | CANCELLED
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aff_comm ON affiliate_commissions(referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         NUMERIC(18,2) NOT NULL,
  payout_method  TEXT NOT NULL DEFAULT 'CRYPTO_TRC20',
  payout_details TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  admin_note     TEXT NOT NULL DEFAULT '',
  processed_by   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aff_payouts ON affiliate_payouts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS affiliate_applications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  experience    TEXT NOT NULL DEFAULT '',
  platform      TEXT NOT NULL DEFAULT '',
  audience_size TEXT NOT NULL DEFAULT '',
  reason        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'PENDING',
  admin_note    TEXT NOT NULL DEFAULT '',
  processed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aff_apps ON affiliate_applications(status, created_at DESC);

/* ---------------- OTC / synthetic 24-7 market (SEPARATE from real markets) ----
   These tables back the backend-authoritative OTC engine. They are strictly
   ADDITIVE: no existing table is altered or dropped, so applying this on a
   live database cannot affect users, balances, trades, KYC or settings.
   A rollback is simply DROP TABLE on the six otc_* tables. */

CREATE TABLE IF NOT EXISTS otc_instruments (
  id                  TEXT PRIMARY KEY,
  symbol              TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  market_type         TEXT NOT NULL DEFAULT 'OTC',
  base_asset          TEXT NOT NULL DEFAULT '',
  quote_asset         TEXT NOT NULL DEFAULT '',
  starting_price      NUMERIC(20,8)  NOT NULL DEFAULT 1,
  decimal_precision   INTEGER        NOT NULL DEFAULT 5,
  tick_interval_ms    INTEGER        NOT NULL DEFAULT 1000,
  volatility          NUMERIC(20,10) NOT NULL DEFAULT 0.00005,
  spread              NUMERIC(20,10) NOT NULL DEFAULT 0.00004,
  minimum_price_step  NUMERIC(20,10) NOT NULL DEFAULT 0.00001,
  min_tick_move       NUMERIC(20,10) NOT NULL DEFAULT 0.00001,
  max_tick_move       NUMERIC(20,10) NOT NULL DEFAULT 0.004,
  mean_reversion      NUMERIC(20,10) NOT NULL DEFAULT 0.015,
  payout_percentage   NUMERIC(6,2)   NOT NULL DEFAULT 85,
  min_stake           NUMERIC(18,2)  NOT NULL DEFAULT 1,
  max_stake           NUMERIC(18,2)  NOT NULL DEFAULT 5000,
  exposure_limit      NUMERIC(18,2)  NOT NULL DEFAULT 0,
  trading_status      TEXT NOT NULL DEFAULT 'ENABLED',
  session_status      TEXT NOT NULL DEFAULT 'OPEN',
  price_engine_status TEXT NOT NULL DEFAULT 'STOPPED',
  candle_status       TEXT NOT NULL DEFAULT 'IDLE',
  seed_reference      TEXT NOT NULL DEFAULT '',
  retention_days      INTEGER NOT NULL DEFAULT 14,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otc_instruments_active ON otc_instruments(is_active, sort_order);

-- Raw authoritative ticks. Written in BATCHES by the engine worker, never one
-- synchronous write per browser paint.
CREATE TABLE IF NOT EXISTS otc_price_ticks (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  timestamp       BIGINT NOT NULL,
  sequence_number BIGINT NOT NULL,
  price           NUMERIC(20,8) NOT NULL,
  bid             NUMERIC(20,8) NOT NULL,
  ask             NUMERIC(20,8) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otc_ticks_symbol_ts ON otc_price_ticks(symbol, timestamp DESC);
-- Makes tick inserts idempotent and makes sequence gaps provable.
CREATE UNIQUE INDEX IF NOT EXISTS idx_otc_ticks_symbol_seq ON otc_price_ticks(symbol, sequence_number);

-- Candles are derived ONLY from authoritative ticks. Finalized rows are
-- immutable; a forming row is upserted on the same (symbol, timeframe, start).
CREATE TABLE IF NOT EXISTS otc_candles (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL,
  start_time  BIGINT NOT NULL,
  end_time    BIGINT NOT NULL,
  open        NUMERIC(20,8) NOT NULL,
  high        NUMERIC(20,8) NOT NULL,
  low         NUMERIC(20,8) NOT NULL,
  close       NUMERIC(20,8) NOT NULL,
  tick_count  INTEGER NOT NULL DEFAULT 0,
  finalized   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_otc_candles_unique ON otc_candles(symbol, timeframe, start_time);
CREATE INDEX IF NOT EXISTS idx_otc_candles_lookup ON otc_candles(symbol, timeframe, start_time DESC);

-- Latest authoritative state + PRNG/regime checkpoint. One row per symbol;
-- this is the row the engine restores from after a restart.
CREATE TABLE IF NOT EXISTS otc_market_state (
  symbol           TEXT PRIMARY KEY,
  current_price    NUMERIC(20,8)  NOT NULL DEFAULT 0,
  bid              NUMERIC(20,8)  NOT NULL DEFAULT 0,
  ask              NUMERIC(20,8)  NOT NULL DEFAULT 0,
  sequence_number  BIGINT NOT NULL DEFAULT 0,
  regime_state     TEXT NOT NULL DEFAULT 'normal',
  volatility_state NUMERIC(20,10) NOT NULL DEFAULT 0,
  prng_state       TEXT NOT NULL DEFAULT '',
  seed_reference   TEXT NOT NULL DEFAULT '',
  seed_rotated_at  TIMESTAMPTZ,
  last_tick_time   BIGINT,
  engine_status    TEXT NOT NULL DEFAULT 'STOPPED',
  leader_id        TEXT NOT NULL DEFAULT '',
  leader_heartbeat TIMESTAMPTZ,
  current_candle   TEXT NOT NULL DEFAULT '{}',
  checkpoint_time  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otc_engine_config (
  id                     INTEGER PRIMARY KEY,
  engine_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  tick_retention_days    INTEGER NOT NULL DEFAULT 14,
  checkpoint_interval_ms BIGINT  NOT NULL DEFAULT 5000,
  replay_buffer_size     INTEGER NOT NULL DEFAULT 5000,
  batch_flush_ms         INTEGER NOT NULL DEFAULT 250,
  auto_recover           BOOLEAN NOT NULL DEFAULT TRUE,
  gap_policy             TEXT NOT NULL DEFAULT 'RESUME_WITH_GAP',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit trail: engine start/stop, pause/resume, config + pricing-parameter
-- changes (old → new), seed rotation, leader change, recovery and errors.
CREATE TABLE IF NOT EXISTS otc_engine_events (
  id         BIGSERIAL PRIMARY KEY,
  symbol     TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'INFO',
  actor_id   TEXT,
  actor_role TEXT NOT NULL DEFAULT '',
  old_value  TEXT NOT NULL DEFAULT '',
  new_value  TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otc_events_time ON otc_engine_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otc_events_symbol ON otc_engine_events(symbol, created_at DESC);
`;

/** Forward-compatible column additions (safe to re-run). */
const PATCHES: string[] = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS force_loss_user BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS price_source TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS copied_from TEXT`,
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS tournament_id TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_leader BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS alias TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_tier TEXT NOT NULL DEFAULT 'Standard'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_flag TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS copy_trading_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS tournaments_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sharp_trader_threshold NUMERIC(6,2) NOT NULL DEFAULT 65`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS settings_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS asset_catalog_version INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol, created_at DESC)`,
  // Dual-mode payment columns (Module 5).
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sender_account TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS proof_image TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method_id TEXT`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway_ref TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_order_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_event_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS provider_payout_id TEXT NOT NULL DEFAULT ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_order ON transactions(provider, provider_order_id) WHERE provider_order_id <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_event ON transactions(provider, provider_event_id) WHERE provider_event_id <> ''`,
  // Affiliate & Referral System ("Rafi Leon System")
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,2) NOT NULL DEFAULT 40.00`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_status TEXT NOT NULL DEFAULT 'ACTIVE'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS affiliate_default_rate NUMERIC(6,2) NOT NULL DEFAULT 40.00`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS affiliate_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_applied BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS gateway_config JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS gateway_providers JSONB NOT NULL DEFAULT '[]'::jsonb`,
  // Administrator gateway runtime control (Admin → Finance → ⚡ Gateway config).
  // auto_deposits_enabled: master switch for the ⚡ Automatic tab (live AND demo).
  // demo_gateway_enabled: in-app NexaPay demo checkout (only meaningful without a live key).
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS auto_deposits_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS demo_gateway_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  // Security suite (Spec §6.9): 2FA, login alerts, responsible trading.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS login_alerts BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_limit NUMERIC(18,2)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS self_exclusion_until TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS reality_check_minutes INTEGER NOT NULL DEFAULT 0`,
  // OTC extension (additive). `market_type` separates REAL from OTC so the
  // two can never be confused in reporting; the sequence columns record the
  // authoritative OTC tick a trade was opened/settled against (spec Part 33).
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS market_type TEXT NOT NULL DEFAULT 'REAL'`,
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_sequence BIGINT`,
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS settlement_sequence BIGINT`,
  // Idempotency: a retried submission with the same key can never create a
  // second trade or a second balance deduction (spec Part 34).
  `ALTER TABLE trades ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_idempotency ON trades(idempotency_key) WHERE idempotency_key IS NOT NULL`,
];

async function migrate(): Promise<void> {
  // When the schema is managed externally (e.g. applied through a privileged
  // migration while this process connects with a limited role), skip the
  // CREATE statements instead of failing on permissions.
  const usersTable = await one<{ t: string | null }>(`SELECT to_regclass('public.users') AS t`);
  if (!usersTable?.t) {
    await pool.query(SCHEMA);
  }
  for (const patch of PATCHES) {
    try {
      await pool.query(patch);
    } catch {
      /* older engines without IF NOT EXISTS, or externally managed schema — ignore */
    }
  }
}

/* ------------------------------------------------------------------ *
 * Seed — settings, VIP tiers, market catalogue, payment methods, admins
 * ------------------------------------------------------------------ */

/** Volume-based VIP ladder (admin can create/edit/delete more from the panel). */
const DEFAULT_TIERS: Array<[string, string, number, number, number, string, string, number]> = [
  ['standard', 'Standard', 0, 0, 0, '#8892a6', 'Full market access · 24/7 support', 1],
  ['gold', 'Gold', 25000, 5, 1, '#f5c542', '+5% payout bonus · 1% weekly cashback · priority withdrawals', 2],
  ['vip', 'VIP', 150000, 10, 2.5, '#8b5cf6', '+10% payout bonus · 2.5% cashback · dedicated manager · tournament seats', 3],
];

async function seed(): Promise<void> {
  await sql(`INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  for (const [id, name, minVol, bonus, cashback, color, perks, order] of DEFAULT_TIERS) {
    await sql(
      `INSERT INTO vip_tiers (id, name, min_volume, payout_bonus, cashback_pct, color, perks, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [id, name, minVol, bonus, cashback, color, perks, order]
    );
  }

  // The catalogue is only (re)installed when its version changes, so assets the
  // owner deleted or renamed from the admin panel are never resurrected.
  const verRow = await one<{ asset_catalog_version: number | string }>(
    'SELECT asset_catalog_version FROM system_settings WHERE id = 1'
  );
  const installed = Number(verRow?.asset_catalog_version ?? 0);
  if (installed < ASSET_CATALOG_VERSION) {
    for (const [symbol, name, cat, provider, feed, payout, digits, order] of DEFAULT_ASSETS) {
      await sql(
        `INSERT INTO assets (symbol, display_name, category, feed_provider, feed_symbol, payout_rate, price_digits, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (symbol) DO UPDATE SET display_name=EXCLUDED.display_name,
           category=EXCLUDED.category, feed_provider=EXCLUDED.feed_provider,
           feed_symbol=EXCLUDED.feed_symbol, price_digits=EXCLUDED.price_digits,
           sort_order=EXCLUDED.sort_order`,
        [symbol, name, cat, provider, feed, payout, digits, order]
      );
      // Canonical `markets` catalogue. Conflicts keep the owner's payout and
      // is_active choices (admin panel edits are never overwritten by a boot);
      // new catalogue rows are simply inserted.
      await sql(
        `INSERT INTO markets (symbol, display_name, category, payout_percentage, provider, feed_symbol, price_digits, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (symbol) DO UPDATE SET
           display_name=EXCLUDED.display_name,
           category=EXCLUDED.category,
           provider=EXCLUDED.provider,
           feed_symbol=EXCLUDED.feed_symbol,
           price_digits=EXCLUDED.price_digits,
           sort_order=EXCLUDED.sort_order,
           updated_at=NOW()`,
        [symbol, name, cat, payout, provider, feed, digits, order]
      );
    }
    await sql('UPDATE system_settings SET asset_catalog_version = $1 WHERE id = 1', [ASSET_CATALOG_VERSION]);
    console.log(`[nexatrade] installed market catalogue v${ASSET_CATALOG_VERSION} (${DEFAULT_ASSETS.length} instruments)`);
  }

  // ── SUPER ADMIN (Module 3) ────────────────────────────────────────────
  // The platform owner is hard-protected: seeded on every boot (the password
  // is only set when the account is first provisioned, never overwritten),
  // and no role — including another SUPER_ADMIN — may delete, demote or block
  // it. That guard is enforced in the API layer; here we guarantee existence.
  const SUPER_EMAIL = 'arjumankhan181@gmail.com';
  const superPassword = env.superAdminPassword || (env.nodeEnv !== 'production' ? 'AdminPassword123!' : '');
  const superRow = await sql('SELECT id, password_hash, is_blocked FROM users WHERE email = $1', [SUPER_EMAIL]);
  if (superRow.rows.length === 0 && superPassword.length >= 12) {
    const hash = await bcrypt.hash(superPassword, 12);
    await sql(
      `INSERT INTO users (id, full_name, email, password_hash, role, kyc_status, balance_real, balance_demo, country)
       VALUES ($1,$2,$3,$4,'SUPER_ADMIN','VERIFIED',0,100000,'BD')`,
      [uuid(), 'Arjuman Khan', SUPER_EMAIL, hash]
    );
    console.log(`[nexatrade] provisioned SUPER_ADMIN from SUPER_ADMIN_PASSWORD: ${SUPER_EMAIL}`);
  } else if (superRow.rows.length > 0 && superPassword.length >= 12) {
    // The deployment secret is authoritative and removes any legacy/default
    // credential that may have existed in an older database. Only rotate when
    // it actually changed; serverless cold starts must not revoke every session.
    const current = superRow.rows[0];
    const passwordMatches = await bcrypt.compare(superPassword, current.password_hash).catch(() => false);
    if (!passwordMatches || current.is_blocked) {
      const hash = passwordMatches ? current.password_hash : await bcrypt.hash(superPassword, 12);
      await sql(
        `UPDATE users SET role='SUPER_ADMIN', is_blocked=FALSE, password_hash=$2,
                          token_version=token_version+1 WHERE email=$1`,
        [SUPER_EMAIL, hash]
      );
    } else {
      await sql(`UPDATE users SET role='SUPER_ADMIN' WHERE email=$1`, [SUPER_EMAIL]);
    }
  } else if (superRow.rows.length > 0) {
    // Fail closed: old releases provisioned a public default password. An
    // operator must now configure a strong deployment secret to unlock owner access.
    await sql(
      `UPDATE users SET role='SUPER_ADMIN', is_blocked=TRUE,
                        token_version=token_version + CASE WHEN is_blocked THEN 0 ELSE 1 END WHERE email=$1`,
      [SUPER_EMAIL]
    );
    console.warn('[nexatrade] SUPER_ADMIN_PASSWORD missing/short — protected owner account is locked.');
  } else {
    console.warn('[nexatrade] SUPER_ADMIN_PASSWORD missing/short — protected owner account was not provisioned.');
  }

  // Optional regular ADMIN provisioned only from explicit credentials.
  const email = env.adminEmail.toLowerCase();
  const adminPassword = env.adminPassword;
  if (email && adminPassword.length >= 12) {
    const existing = await sql('SELECT id, password_hash, is_blocked FROM users WHERE email = $1', [email]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await sql(
        `INSERT INTO users (id, full_name, email, password_hash, role, kyc_status, balance_real, balance_demo, country)
         VALUES ($1,$2,$3,$4,'ADMIN','VERIFIED',0,100000,'BD')`,
        [uuid(), env.adminName || 'TRADEON Owner', email, hash]
      );
      console.log(`[nexatrade] seeded admin account: ${email}`);
    } else {
      const current = existing.rows[0];
      const passwordMatches = await bcrypt.compare(adminPassword, current.password_hash).catch(() => false);
      if (!passwordMatches || current.is_blocked) {
        const hash = passwordMatches ? current.password_hash : await bcrypt.hash(adminPassword, 12);
        await sql(
          `UPDATE users SET password_hash=$2, is_blocked=FALSE,
                            token_version=token_version+1 WHERE email=$1`,
          [email, hash]
        );
      }
    }
  } else if (email) {
    const existing = await sql('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) {
      await sql(
        `UPDATE users SET is_blocked=TRUE,
                          token_version=token_version + CASE WHEN is_blocked THEN 0 ELSE 1 END WHERE email=$1`,
        [email]
      );
    }
    console.warn('[nexatrade] ADMIN_PASSWORD missing/short — optional admin account is locked/not provisioned.');
  }

  await seedPaymentMethods();
}

/** Default manual-rail payment methods (installed once; editable from admin). */
async function seedPaymentMethods(): Promise<void> {
  const count = await one<{ n: number | string }>('SELECT COUNT(*)::int AS n FROM payment_methods');
  if (Number(count?.n ?? 0) > 0) return;
  const defaults: Array<[string, string, string, string, string, string, string, string, number]> = [
    ['pm_usdt_trc20', 'CRYPTO', 'USDT · TRON (TRC-20)', 'USDT_TRC20', 'Send USDT on the TRON network to the address below. Approves in ~1 network confirmation.', 'TXYZtradeonUSDTaddressTRC20xxxxx', 'Network: TRC-20 · $1 min', '', 10],
    ['pm_usdt_erc20', 'CRYPTO', 'USDT · Ethereum (ERC-20)', 'USDT_ERC20', 'Send USDT on the Ethereum network to the address below.', '0xtradeonUSDTethereumaddress0000', 'Network: ERC-20', '', 20],
    ['pm_btc', 'CRYPTO', 'Bitcoin (BTC)', 'BITCOIN', 'Send BTC to the deposit address. Credit after 2 confirmations.', 'bc1qtradeonbitcoindepositaddress0000', 'Bitcoin network', '', 30],
    ['pm_bkash', 'LOCAL', 'bKash', 'BKASH', 'Send money to the bKash personal number below, then submit your transaction ID and a screenshot.', '01XXXXXXXXX', 'bKash Personal · Send Money', '', 40],
    ['pm_nagad', 'LOCAL', 'Nagad', 'NAGAD', 'Send money to the Nagad number below, then submit your Transaction ID and screenshot.', '01XXXXXXXXX', 'Nagad Personal · Send Money', '', 50],
    ['pm_bank', 'BANK', 'Bank transfer', 'BANK_TRANSFER', 'Wire to the platform account and include the deposit reference + bank receipt.', 'TRADEON Ltd. · A/C 0000-0000-0000', 'Bank: Demo Commercial Bank · Branch: Dhaka', '', 60],
  ];
  for (const [id, kind, name, code, instructions, address, extra, qr, order] of defaults) {
    await sql(
      `INSERT INTO payment_methods (id, kind, name, code, instructions, address, extra, qr_data, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (code) DO NOTHING`,
      [id, kind, name, code, instructions, address, extra, qr, order]
    );
  }
  console.log(`[nexatrade] installed ${defaults.length} default payment methods`);
}

/**
 * Create the schema, apply patches and seed reference data. Idempotent and
 * safe to run on every boot; call once during server startup.
 */
export async function bootstrapDatabase(): Promise<void> {
  await migrate();
  await seed();
}
