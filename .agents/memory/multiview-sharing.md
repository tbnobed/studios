---
name: Multiview sharing model
description: How saved multiviewer layouts are shared (external token link + internal user/group grant) and the rule that prevents stream leakage.
---

# Multiview sharing

Two ways to share a saved multiviewer layout:
- EXTERNAL: public token link at `/mv/:token` (page `MultiviewerShare.tsx`, route registered before the auth gate in `App.tsx`). No account needed; optional expiry; deletable to revoke. Public API `GET /api/mv-share/:token`.
- INTERNAL: grant view-only access to specific logged-in users/groups so the layout shows up read-only in their own Multiviewer page (`shared: true` on `MultiviewerLayoutWithMeta`).

## Rule: never leak streams the owner has lost access to
**Rule:** Resolve a layout's slot streams for sharing through `storage.getAccessibleStreamsByIds(ownerId, ids)`, NOT the unrestricted `getStreamsByIds`.
**Why:** A layout stores stream ids in `slots`. If the owner saved streams they could see, then later lost permission, the unrestricted lookup would still expose those streams via both the public link and the internal embed — an authorization bypass.
**How to apply:** Scope to the layout owner's CURRENT permission set (admins see all). Applied at both read boundaries: the public serve in `routes.ts` (`/api/mv-share/:token`) and the internal embed in `storage.getUserMultiviewerLayouts`. Slots stay unchanged so a now-inaccessible stream simply renders as an "unavailable" tile.

Recipients of an internal share intentionally DO see streams they otherwise couldn't (owner grants view access, like sharing a doc) — the scoping is to the OWNER's access, not the recipient's.

## Single-stream sharing follows the same creator-access rule
Single streams are shared the same way: any logged-in user can make a public token link (`/share/:token`) from a Share button on a Dashboard stream card; admins see ALL links (every user's, with creator name) in the Admin Panel.
**Rule:** Both the create path (`POST /api/shares`) and the public serve path (`GET /api/share/:token`) gate on the CREATOR's current access. Create rejects non-admins sharing a stream not in `getUserAccessibleStreamIds`. Serve returns 404 if a non-admin creator later lost access. Admin-created or creator-deleted (createdBy null) links keep serving.
**Why:** Once non-admins (not just admins) can mint public links, a revoked permission must not keep leaking the stream through an old token.

