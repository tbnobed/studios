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

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR UNIQUE,
    username VARCHAR UNIQUE,
    first_name VARCHAR,
    last_name VARCHAR,
    profile_image_url VARCHAR,
    password_hash VARCHAR,
    role VARCHAR DEFAULT 'viewer' CHECK (role IN ('admin', 'operator', 'viewer')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create studios table
CREATE TABLE IF NOT EXISTS studios (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL UNIQUE,
    description TEXT,
    location VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create streams table
CREATE TABLE IF NOT EXISTS streams (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    studio_id VARCHAR NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    stream_url VARCHAR NOT NULL,
    resolution VARCHAR DEFAULT '1080p',
    fps INTEGER DEFAULT 30,
    status VARCHAR DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create user_studio_permissions table for role-based access
CREATE TABLE IF NOT EXISTS user_studio_permissions (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    studio_id VARCHAR NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
    permission_level VARCHAR DEFAULT 'viewer' CHECK (permission_level IN ('admin', 'operator', 'viewer')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, studio_id)
);

-- Insert default studios
INSERT INTO studios (id, name, description, location) VALUES 
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal', 'Southern California Studio', 'Los Angeles, CA'),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex', 'Plex Media Studio', 'Austin, TX'),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving', 'Irving Production Studio', 'Irving, TX'),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville', 'Nashville Music Studio', 'Nashville, TN')
ON CONFLICT (id) DO NOTHING;

-- Insert default streams for each studio
INSERT INTO streams (studio_id, name, stream_url, resolution, fps) VALUES 
    -- SoCal streams
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Main Camera', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal1', '1080p', 30),
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Camera 2', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal2', '1080p', 30),
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Camera 3', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal3', '1080p', 30),
    ('4813376b-ea45-47ca-b7d5-0090b1f2aab7', 'SoCal Camera 4', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Socal4', '1080p', 30),
    
    -- Plex streams
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Main Camera', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex1', '1080p', 30),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Camera 2', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex2', '1080p', 30),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Camera 3', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex3', '1080p', 30),
    ('f2c8a3b1-4d6e-4a2b-8c9d-1e5f7a9b3c2d', 'Plex Camera 4', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Plex4', '1080p', 30),
    
    -- Irving streams
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Main Camera', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving1', '1080p', 30),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Camera 2', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving2', '1080p', 30),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Camera 3', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving3', '1080p', 30),
    ('a7b2c9d4-3f8e-4b1a-9c6d-2e8f1a4b7c5d', 'Irving Camera 4', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Irving4', '1080p', 30),
    
    -- Nashville streams
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Main Camera', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville1', '1080p', 30),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Camera 2', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville2', '1080p', 30),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Camera 3', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville3', '1080p', 30),
    ('c5d8f1a3-2b7e-4c9a-8d5f-3e1f6a2b9c8d', 'Nashville Camera 4', 'http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=Nashville4', '1080p', 30)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_streams_studio_id ON streams(studio_id);
CREATE INDEX IF NOT EXISTS idx_user_studio_permissions_user_id ON user_studio_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_studio_permissions_studio_id ON user_studio_permissions(studio_id);
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