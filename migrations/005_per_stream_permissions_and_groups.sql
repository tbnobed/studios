-- Migration 005: granular per-stream permissions + permission groups.
-- Replaces whole-studio access (user_studio_permissions, kept but unused) with:
--   * user_stream_permissions: individual add-only grants for a single user
--   * groups + group_stream_permissions: a reusable bundle of stream grants
--   * user_groups: many-to-many membership (a user can be in multiple groups)
-- Access = admin role OR any individual grant OR any grant from any group the
-- user belongs to. Add-only; there is no deny.

-- Permission groups.
CREATE TABLE IF NOT EXISTS groups (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Group membership (many-to-many between users and groups).
CREATE TABLE IF NOT EXISTS user_groups (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id VARCHAR NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT user_groups_user_group_unique UNIQUE (user_id, group_id)
);

-- Streams a group grants access to (presence of a row = granted).
CREATE TABLE IF NOT EXISTS group_stream_permissions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id VARCHAR NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    stream_id VARCHAR NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT group_stream_perms_group_stream_unique UNIQUE (group_id, stream_id)
);

-- Individual per-stream grants for a single user (add-only).
CREATE TABLE IF NOT EXISTS user_stream_permissions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id VARCHAR NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT user_stream_perms_user_stream_unique UNIQUE (user_id, stream_id)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_group_stream_permissions_group_id ON group_stream_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_stream_permissions_stream_id ON group_stream_permissions(stream_id);
CREATE INDEX IF NOT EXISTS idx_user_stream_permissions_user_id ON user_stream_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stream_permissions_stream_id ON user_stream_permissions(stream_id);

-- Backfill: turn each existing whole-studio grant into per-stream grants for
-- every stream in that studio, so current users keep the access they had.
INSERT INTO user_stream_permissions (user_id, stream_id)
SELECT usp.user_id, s.id
FROM user_studio_permissions usp
JOIN streams s ON s.studio_id = usp.studio_id
WHERE usp.can_view = true
ON CONFLICT (user_id, stream_id) DO NOTHING;
