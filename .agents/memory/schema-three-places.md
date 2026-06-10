---
name: Schema is provisioned in three places
description: This repo defines DB schema in Drizzle, init.sql, and migrations/ — all must stay in sync.
---

# Schema lives in three places

Any database DDL change (new table, column, index, constraint) must be applied in **all three** of:

1. `shared/schema.ts` — Drizzle table definitions (source of truth for `npm run db:push` and TS types).
2. `init.sql` — raw SQL run on fresh DB bootstrap.
3. `migrations/NNN_*.sql` — ordered migration files for existing deployments.

**Why:** `init.sql` seeds brand-new databases, migrations upgrade existing ones, and Drizzle drives `db:push` + generates the shared TS types. If they drift, fresh installs, upgrades, and the running app disagree on the schema.

**How to apply:** When adding schema, edit all three, then run `npm run db:push` to apply the Drizzle version to the dev DB. For partial unique indexes Drizzle supports `uniqueIndex(name).on(col).where(sql\`...\`)` in the table's extra-config callback; mirror it as `CREATE UNIQUE INDEX ... WHERE ...` in the SQL files.

**Docker self-host deploy mechanics:** `init.sql` runs once on a fresh Postgres data dir (docker-entrypoint-initdb.d) and is skipped on existing volumes. The `migrate` compose service is a one-shot that runs every `migrations/*.sql` in filename order on each `up`, before the app starts. `migrations/` is volume-mounted into that container, so a new numbered migration applies with just `docker compose up -d` — no app image rebuild needed. Symptom of a missing migration: app builds fine but returns 500 `relation "X" does not exist` at runtime (e.g. `tv_pairings` missing broke the /tv QR pairing flow). Verify by diffing the dev DB's `information_schema.columns` against what `init.sql` + migrations create.
