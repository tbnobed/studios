-- Migration 006: user invitations.
-- An admin invites a user by email; the user receives a link with a single-use
-- token (only its sha256 hash is stored) and sets their own password to activate
-- the account. One invite per user; resending replaces the existing row.

CREATE TABLE IF NOT EXISTS invites (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS invites_token_hash_idx ON invites(token_hash);
