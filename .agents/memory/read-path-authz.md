---
name: Read-path authorization for stream-derived data
description: When to re-check user_studio_permissions on read endpoints that expose stream data
---

# Read-path authorization for stream-derived data

Any endpoint that returns stream data (URLs, metadata) — directly or nested
inside another resource — must filter by the caller's current
`user_studio_permissions.can_view` for the stream's studio, not just at
write/add time.

**Why:** Permissions can be revoked after a row referencing a stream is
created. A read path that trusts the stored row (e.g. a user's saved/favorited
streams) will leak stream URLs/metadata the user is no longer allowed to see.
This was flagged on the Favorites feature: POST checked permission but the
list GET originally did not.

**How to apply:** In the storage/read layer, load the user's permitted studio
ids once and filter the result set (or join against `user_studio_permissions`).
Mirror the same `can_view` check used by the corresponding write endpoint so
add and read stay consistent.
