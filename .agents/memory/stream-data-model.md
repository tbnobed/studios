---
name: Stream data model conventions (OBTV Studio Manager)
description: Non-obvious conventions for streams, isActive semantics, and admin vs viewer fetch paths
---

# Streams: active vs deleted, and admin vs viewer fetch paths

- `isActive` is a genuine viewer-visibility toggle (set via the stream Edit dialog), NOT a soft-delete flag.
  Delete is now a HARD delete (`storage.deleteStream` -> `db.delete`). **Why:** the admin Streams tab shows
  inactive streams and offers an Active/Inactive status filter; if delete only set `isActive=false`, deleted
  streams would resurface as "Inactive" clutter and the filter would be meaningless.
- Two studio→streams fetch paths exist on purpose:
  - `getStreamsByStudio` → active-only (viewer/Dashboard side).
  - `getAllStreamsByStudio` → all streams (admin `/api/admin/studios-with-streams`), so the admin status
    filter and inactive management work.
  **How to apply:** when adding viewer features use the active-only path; admin management must use the
  all-streams path.
- Stream WHEP URL convention (keep quick-add, bulk-add, and single-add in lockstep):
  `http://cdn1.obedtv.live:2022/rtc/v1/whep/?app=live&stream=${studioSlug}_${streamSlug}` where
  `studioSlug = name.toLowerCase().replace(/\s+/g,"")` and
  `streamSlug = name.toLowerCase().replace(/\s+/g,"_")`.
- `streamType` enum is `webrtc | hls` (default `webrtc`). Only WebRTC URLs can be auto-generated from the
  WHEP rule above; **HLS streams must carry an explicit `.m3u8` URL** — every create path (single dialog,
  quick-add, edit dialog) must block submit when type is HLS and the URL is blank. Bulk-add is WebRTC-only
  by design (no m3u8 pattern to generate). **Why:** there is no deterministic way to synthesize an HLS
  playlist URL, so silently auto-generating one produces dead streams.
- Streams carry a human-readable ID separate from the UUID PK: `streamNumber` is a Postgres `serial`
  (auto-incrementing), `.notNull().unique()`, omitted from `insertStreamSchema` so it's DB-assigned at
  creation and stable across renames. UI shows it zero-padded to 3 digits (`String(n).padStart(3,"0")`,
  e.g. `001`); the UUID `id` is no longer surfaced in the admin UI. **Why:** users reference streams by a
  short stable code, not the UUID. Adding a `unique` constraint via `db:push` prompts to truncate — apply
  the migration SQL directly instead (existing rows backfill from the sequence) to avoid data loss.
- StreamPlayer branches on `streamType`: HLS uses hls.js (or native Safari `application/vnd.apple.mpegurl`),
  WebRTC uses the SRS WHEP SDK. The shared `cleanup()` must tear down BOTH (sdk.close + hls.destroy) and
  cancel the WebRTC `checkVideoData` polling timer (cancellation flag + cleared timeout) or stale timers
  fire setState after unmount/stream-switch.
