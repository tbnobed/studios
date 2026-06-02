-- Migration: add per-user favorite streams. Each user can favorite up to 8
-- streams per page and up to 5 pages (40 total). page is 1-5, position is 0-7.
-- Safe to re-run (idempotent).
--
-- Usage (from the host, against your production Postgres):
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < migrations/003_add_favorites.sql

BEGIN;

CREATE TABLE IF NOT EXISTS favorites (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id VARCHAR NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    page INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT favorites_user_stream_unique UNIQUE(user_id, stream_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_stream_id ON favorites(stream_id);

COMMIT;
