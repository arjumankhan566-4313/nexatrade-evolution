-- Migration 0001 — enable TimescaleDB and create the V2 candle hypertable.
--
-- Applied under explicit user approval (Option A: new table, existing tables
-- untouched). A full pg_dump backup was taken BEFORE applying this file.
-- Existing tables (otc_candles, otc_price_ticks, otc_instruments, ...) are
-- NOT modified: this only creates the extension and one new empty table.
--
-- Time column is timestamptz (the V2 API converts epoch-milliseconds to
-- timestamptz on write). The primary key includes the partition column, as
-- TimescaleDB requires. Existing otc_candles data can be back-filled later
-- with a separate, explicitly approved migration.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS public.v2_candles (
  symbol     text        NOT NULL,
  timeframe  text        NOT NULL,
  time       timestamptz NOT NULL,
  open       numeric     NOT NULL,
  high       numeric     NOT NULL,
  low        numeric     NOT NULL,
  close      numeric     NOT NULL,
  tick_count integer     NOT NULL DEFAULT 0,
  finalized boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (symbol, timeframe, time)
);

SELECT create_hypertable(
  'public.v2_candles',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);
