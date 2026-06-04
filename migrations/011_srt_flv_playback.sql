-- Switch SRT playback from WebRTC (WHEP) to HTTP-FLV.
-- This SRS box exposes HTTP-FLV (not WHEP) for browser playback, which the
-- player renders via mpegts.js. Backfill any existing SRT rows that still hold
-- a legacy WHEP playback URL so older streams play after upgrade.
-- Idempotent and safe to re-run.

UPDATE streams
SET stream_url = 'https://slorg1.obtv.io/live/' || stream_key || '.flv'
WHERE stream_type = 'srt'
  AND stream_key IS NOT NULL
  AND stream_url IS DISTINCT FROM 'https://slorg1.obtv.io/live/' || stream_key || '.flv';
