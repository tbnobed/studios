-- Add SRT stream support.
-- SRT is an ingest protocol; SRS republishes it as WebRTC under an opaque
-- stream key. stream_key ties the SRT publish + WHEP playback together;
-- srt_source_url is set only for PULL streams (an external SRT source SRS pulls).
-- Idempotent and safe to re-run.

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block; keep it as a
-- standalone statement. IF NOT EXISTS requires PostgreSQL 12+ (we use 15).
ALTER TYPE stream_type ADD VALUE IF NOT EXISTS 'srt';

ALTER TABLE streams ADD COLUMN IF NOT EXISTS stream_key VARCHAR;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS srt_source_url TEXT;
