-- Migration 008: share a saved multiview layout two ways.
--   1. EXTERNAL: an unguessable public link (multiviewer_shares) anyone can open
--      with no account until it expires (expires_at, null = never) or is deleted.
--   2. INTERNAL: grant view-only access to a layout for a specific logged-in user
--      or group (multiviewer_layout_shares) so it shows up in their Multiviewer.

CREATE TABLE IF NOT EXISTS multiviewer_shares (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id VARCHAR NOT NULL REFERENCES multiviewer_layouts(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(100),
    expires_at TIMESTAMP,
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS multiviewer_shares_token_idx ON multiviewer_shares(token);
CREATE INDEX IF NOT EXISTS idx_multiviewer_shares_layout ON multiviewer_shares(layout_id);

CREATE TABLE IF NOT EXISTS multiviewer_layout_shares (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id VARCHAR NOT NULL REFERENCES multiviewer_layouts(id) ON DELETE CASCADE,
    user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
    group_id VARCHAR REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_multiviewer_layout_shares_layout ON multiviewer_layout_shares(layout_id);
CREATE INDEX IF NOT EXISTS idx_multiviewer_layout_shares_user ON multiviewer_layout_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_multiviewer_layout_shares_group ON multiviewer_layout_shares(group_id);
