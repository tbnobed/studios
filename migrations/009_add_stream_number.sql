-- Add a human-readable, auto-incrementing stream number.
-- Assigned automatically at creation and stable across renames.
-- Existing rows are backfilled by the SERIAL sequence default.

ALTER TABLE streams ADD COLUMN IF NOT EXISTS stream_number SERIAL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'streams_stream_number_unique'
  ) THEN
    ALTER TABLE streams
      ADD CONSTRAINT streams_stream_number_unique UNIQUE (stream_number);
  END IF;
END $$;
