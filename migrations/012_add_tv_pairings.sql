-- Migration: add the tv_pairings table used by the TV ("10-foot") sign-in flow.
-- The /tv device shows a QR code + short user code; a logged-in phone approves
-- the userCode, which sets user_id + approved, and the TV's next poll mints a
-- JWT. Rows are short-lived (expires_at) and single-use.
-- Without this table, POST /api/tv/pair/start fails with
-- 'relation "tv_pairings" does not exist' and the QR/pairing code never loads.
-- Safe to re-run (idempotent).
--
-- Usage (from the host, against your production Postgres):
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < migrations/012_add_tv_pairings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS tv_pairings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    device_code VARCHAR(64) NOT NULL UNIQUE,
    user_code VARCHAR(12) NOT NULL UNIQUE,
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    approved BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tv_pairings_device_code_idx ON tv_pairings(device_code);
CREATE UNIQUE INDEX IF NOT EXISTS tv_pairings_user_code_idx ON tv_pairings(user_code);

COMMIT;
