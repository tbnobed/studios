-- Fix missing updated_at column in studios table for Docker
ALTER TABLE studios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Update existing rows to have updated_at values
UPDATE studios SET updated_at = created_at WHERE updated_at IS NULL;