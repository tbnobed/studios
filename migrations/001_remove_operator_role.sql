-- One-time migration: remove the 'operator' role and the can_control permission.
-- Stream control happens on external encoding servers unreachable by this app,
-- so the operator role, the can_control flag, and the stream-status control
-- endpoint were all removed. Run this ONCE against an existing database that was
-- created before this change. It is safe to re-run (idempotent).
--
-- Usage (from the host, against your production Postgres):
--   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < migrations/001_remove_operator_role.sql

BEGIN;

-- 1. Reassign any existing operator users to viewer.
UPDATE users SET role = 'viewer' WHERE role = 'operator';

-- 2. Drop the now-unused can_control column.
ALTER TABLE user_studio_permissions DROP COLUMN IF EXISTS can_control;

-- 3. Rebuild the user_role enum without 'operator' (only if it still has it).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'operator'
  ) THEN
    ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
    ALTER TYPE user_role RENAME TO user_role_old;
    CREATE TYPE user_role AS ENUM ('admin', 'viewer');
    ALTER TABLE users
      ALTER COLUMN role TYPE user_role USING role::text::user_role;
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';
    DROP TYPE user_role_old;
  END IF;
END $$;

COMMIT;
