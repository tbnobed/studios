-- Migration 004: per-user saved multiviewer layouts (mosaics).
-- layout_type is one of '2x2','3x3','4x4','featured'. slots is an ordered JSON
-- array of stream ids (or null for an empty slot) sized to the layout's slot
-- count. is_default marks the layout auto-loaded for the user.

CREATE TABLE IF NOT EXISTS multiviewer_layouts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    layout_type VARCHAR(20) NOT NULL DEFAULT '2x2',
    slots JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS IDX_multiviewer_layouts_user ON multiviewer_layouts(user_id);
-- At most one default layout per user, enforced at the DB level (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS multiviewer_layouts_one_default_per_user
    ON multiviewer_layouts(user_id) WHERE is_default = true;
