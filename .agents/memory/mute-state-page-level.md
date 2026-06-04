---
name: Per-stream mute persistence
description: Why audio mute state must be owned at the page level, not inside stream tile/view components.
---

# Per-stream mute persistence

Audio mute for a stream must persist from the moment the user unmutes it until they
mute it back or navigate away, no matter how many times the UI toggles between grid
and full/solo view.

**Rule:** Own mute at the page level as a `Set<string>` of UNMUTED stream ids
(absence = muted). Derive `muted={!unmuted.has(id)}` and pass `muted` + `onToggleMute`
down to every player surface (grid tiles AND the full/solo view). The page is the
single source of truth.

**Why:** Grid and full/solo view are conditionally rendered, so switching between them
unmounts and remounts the child player components. Any mute state held in a child
(`useState`) resets to its default on every transition, so audio "mutes itself back"
each time you return to the grid. Native `<video controls>` mute also can't be tracked,
so the grid player must use a custom mute button and `controls={false}` to keep the
page state authoritative.

**How to apply:** When adding/sharing mute (or similar per-stream playback intent)
across views, lift it to the page. Make shared player components
(`StreamSingleView`, `MultiviewerTile`) controlled-OPTIONAL: use the `muted` prop when
provided, else fall back to internal state — this keeps non-lifted callers
(Favorites, MultiviewerShare, MultiviewerWall) working without changes. On return to
grid an unmuted stream remounts with `muted=false`+`autoPlay`; the transition is a user
click so sound-on autoplay is allowed.
