---
name: Read-path authorization for stream-derived data
description: Re-check per-stream access on read endpoints that expose stream data
---

# Read-path authorization for stream-derived data

Any endpoint that returns stream data (URLs, metadata) — directly or nested
inside another resource — must filter by the caller's *current* stream access,
not just at write/add time.

Access model (since the per-stream/groups rework): a non-admin can view a
stream if they have an individual `user_stream_permissions` row OR any group
they belong to grants it via `group_stream_permissions` (union, add-only, no
deny). Admin role sees everything. Use `storage.getUserAccessibleStreamIds` /
`storage.canUserViewStream` — do not re-implement the union inline.

**Why:** Grants can be revoked after a row referencing a stream is created. A
read path that trusts the stored row (e.g. a user's saved/favorited streams)
leaks stream URLs/metadata the user is no longer allowed to see. Originally
flagged on Favorites (POST checked, list GET did not).

**How to apply:** In the storage/read layer, load the user's accessible stream
ids once and filter the result set. `getUserStudios` returns only studios that
still have at least one viewable stream (studios are just UI grouping now —
there is no whole-studio permission anymore; `user_studio_permissions` is kept
defined-but-unused so db:push won't drop it).
