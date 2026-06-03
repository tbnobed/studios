---
name: Schema changes need three-way rollout
description: A new DB table must land in Drizzle schema, init.sql, and a numbered migration.
---

This repo keeps the database schema aligned across three places:
1. `shared/schema.ts` — Drizzle table definition (drives the app + `db:push`).
2. `init.sql` — full bootstrap script for fresh databases.
3. `migrations/NNN_*.sql` — numbered, idempotent migration for existing/deployed
   databases (use `CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`).

**Rule:** When adding a new table/index, update all three — not just the Drizzle
schema + `npm run db:push`.

**Why:** `db:push` only patches the current dev DB. Fresh provisions run
`init.sql`, and upgraded/self-hosted deployments run the numbered migrations; if
either is missing the new table, those environments break when the feature
queries it. (`drizzle.config.ts` and `package.json` must not be edited.)

**How to apply:** Add the DDL to `init.sql` near the related tables, and create
the next-numbered file in `migrations/` mirroring the Drizzle definition
(FK cascade / set-null behavior, unique index on token columns, etc.).
