-- Migration 007: public stream share links.
-- An admin generates an unguessable token linking to one stream. Anyone with the
-- resulting link can watch that stream without an account until the link expires
-- (expires_at, null = never) or is deleted, which revokes access immediately.

CREATE TABLE IF NOT EXISTS stream_shares (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(100),
    expires_at TIMESTAMP,
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS stream_shares_token_idx ON stream_shares(token);
