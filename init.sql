-- OBTV Studio Manager Database Initialization
-- This script sets up the initial database structure

-- Create database if it doesn't exist (handled by docker-compose)
-- CREATE DATABASE IF NOT EXISTS obtv_studio;

-- Connect to the database
\c obtv_studio;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sessions table for express-session storage
CREATE TABLE IF NOT EXISTS sessions (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
ALTER TABLE sessions ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);

-- Create user role enum
CREATE TYPE user_role AS ENUM ('admin', 'viewer');

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) UNIQUE,
    password TEXT NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role user_role NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create studios table
CREATE TABLE IF NOT EXISTS studios (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    location VARCHAR(100),
    description TEXT,
    color_code VARCHAR(7),
    image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create stream status enum
CREATE TYPE stream_status AS ENUM ('online', 'offline', 'error');

-- Create stream type enum (WebRTC/WHEP vs HLS/.m3u8)
CREATE TYPE stream_type AS ENUM ('webrtc', 'hls');

-- Create streams table
CREATE TABLE IF NOT EXISTS streams (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id VARCHAR NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    stream_url TEXT NOT NULL,
    stream_type stream_type NOT NULL DEFAULT 'webrtc',
    resolution VARCHAR(20) DEFAULT '1080p',
    fps INTEGER DEFAULT 30,
    status stream_status NOT NULL DEFAULT 'offline',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_studio_permissions table for role-based access
CREATE TABLE IF NOT EXISTS user_studio_permissions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    studio_id VARCHAR NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, studio_id)
);

-- Create favorites table: per-user favorite streams, up to 8 per page and up
-- to 5 pages (40 total). page is 1-5, position is 0-7.
CREATE TABLE IF NOT EXISTS favorites (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id VARCHAR NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    page INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT favorites_user_stream_unique UNIQUE(user_id, stream_id)
);

-- Create multiviewer_layouts table: per-user saved mosaics. layout_type is one
-- of '2x2','3x3','4x4','featured'. slots is an ordered JSON array of stream ids
-- (or null for an empty slot) sized to the layout's slot count.
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

-- Insert default admin user (password: admin123)
INSERT INTO users (id, username, email, first_name, last_name, password, role) VALUES 
    ('admin-user-id-12345', 'admin', 'admin@obtv.live', 'Admin', 'User', '$2b$10$2LO.379Pa7N3HcWZ6Xvy6.okmNOASrXIdBWfyCqsslJUJXOWK4v0K', 'admin')
ON CONFLICT (id) DO NOTHING;

-- Insert default studios
INSERT INTO studios (id, name, description, location) VALUES 
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal', 'Southern California Studio', 'Los Angeles, CA'),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex', 'Plex Media Studio', 'Austin, TX'),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving', 'Irving Production Studio', 'Irving, TX'),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville', 'Nashville Music Studio', 'Nashville, TN')
ON CONFLICT (id) DO NOTHING;

-- Insert default streams for each studio
INSERT INTO streams (studio_id, name, description, stream_url, resolution, fps) VALUES 
    -- SoCal streams
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Main Camera', 'Primary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal1', '1080p', 30),
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Camera 2', 'Secondary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal2', '1080p', 30),
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Camera 3', 'Third studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal3', '1080p', 30),
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Camera 4', 'Fourth studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal4', '1080p', 30),
    
    -- Plex streams
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Main Camera', 'Primary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex1', '1080p', 30),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Camera 2', 'Secondary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex2', '1080p', 30),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Camera 3', 'Third studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex3', '1080p', 30),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Camera 4', 'Fourth studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex4', '1080p', 30),
    
    -- Irving streams
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Main Camera', 'Primary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving1', '1080p', 30),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Camera 2', 'Secondary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving2', '1080p', 30),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Camera 3', 'Third studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving3', '1080p', 30),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Camera 4', 'Fourth studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving4', '1080p', 30),
    
    -- Nashville streams
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Main Camera', 'Primary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville1', '1080p', 30),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Camera 2', 'Secondary studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville2', '1080p', 30),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Camera 3', 'Third studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville3', '1080p', 30),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Camera 4', 'Fourth studio camera feed', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville4', '1080p', 30)
ON CONFLICT DO NOTHING;

-- Permission groups: a reusable bundle of stream grants shared by all members.
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

-- Individual per-stream grants for a single user (add-only, no deny).
CREATE TABLE IF NOT EXISTS user_stream_permissions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id VARCHAR NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT user_stream_perms_user_stream_unique UNIQUE (user_id, stream_id)
);

-- Admin role users see every stream automatically, so no grants are seeded here.

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_streams_studio_id ON streams(studio_id);
CREATE INDEX IF NOT EXISTS idx_user_studio_permissions_user_id ON user_studio_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_studio_permissions_studio_id ON user_studio_permissions(studio_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_group_stream_permissions_group_id ON group_stream_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_stream_permissions_stream_id ON group_stream_permissions(stream_id);
CREATE INDEX IF NOT EXISTS idx_user_stream_permissions_user_id ON user_stream_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stream_permissions_stream_id ON user_stream_permissions(stream_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_stream_id ON favorites(stream_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at timestamps
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_studios_updated_at BEFORE UPDATE ON studios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_streams_updated_at BEFORE UPDATE ON streams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();