-- Migration: add a stream_type to streams so studios can host both
-- WebRTC (WHEP, low-latency) and HLS (.m3u8) streams. Existing rows default
-- to 'webrtc' to preserve current behavior. Safe to re-run (idempotent).
--
-- Usage (from the host, against your production Postgres):
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < migrations/002_add_stream_type.sql

BEGIN;

-- 1. Create the stream_type enum if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stream_type') THEN
    CREATE TYPE stream_type AS ENUM ('webrtc', 'hls');
  END IF;
END $$;

-- 2. Add the column with a default so existing streams keep working.
ALTER TABLE streams
  ADD COLUMN IF NOT EXISTS stream_type stream_type NOT NULL DEFAULT 'webrtc';

COMMIT;
