-- Rust-Oleum vendor portal schema. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS vendor_responses (
  vendor_id               TEXT PRIMARY KEY,
  vendor_name             TEXT,
  choice                  TEXT,
  choice_label            TEXT,
  choice_submitted_at     TIMESTAMPTZ,
  timeframe               TEXT,
  timeframe_label         TEXT,
  timeframe_submitted_at  TIMESTAMPTZ,
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS response_events (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_id    TEXT        NOT NULL,
  stage        TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  ip_hash      TEXT,
  user_agent   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS response_events_vendor_idx
  ON response_events (vendor_id, received_at DESC);

CREATE INDEX IF NOT EXISTS response_events_ip_recent_idx
  ON response_events (ip_hash, received_at DESC);

-- Dashboard snapshot from the Cleaners one-pager Excel (one row per vendor).
CREATE TABLE IF NOT EXISTS vendor_metrics (
  vendor_id     TEXT PRIMARY KEY,
  vendor_name   TEXT,
  rank          INT,
  dashboard     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE vendor_metrics ADD COLUMN IF NOT EXISTS rank INT;
ALTER TABLE vendor_metrics ADD COLUMN IF NOT EXISTS dashboard JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE vendor_metrics ADD COLUMN IF NOT EXISTS vendor_name TEXT;
ALTER TABLE vendor_metrics ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS vendor_download_files (
  vendor_id   TEXT PRIMARY KEY,
  pathname    TEXT NOT NULL,
  filename    TEXT NOT NULL,
  byte_size   BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_uploads (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vendor_id     TEXT NOT NULL,
  pathname      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type  TEXT,
  byte_size     BIGINT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, pathname)
);

CREATE INDEX IF NOT EXISTS vendor_uploads_vendor_idx
  ON vendor_uploads (vendor_id, uploaded_at DESC);
