---
name: Dashboard / Favorites player parity
description: The Favorites grid players must mirror the Dashboard (studio tab) grid players — same custom overlay, never native HTML5 controls.
---

# Dashboard / Favorites player parity

The studio tab grid (Dashboard) and the Favorites grid must offer the SAME
player functions. When changing one, change the other.

**Why:** The user repeatedly (and angrily) reported Favorites "still using the
old player." Favorites had `StreamPlayer controls={true}` (native HTML5 control
bar) while Dashboard used a custom overlay. Parity is an explicit, recurring
expectation.

**How to apply — both grids must:**
- Render `StreamPlayer` with `controls={false}` (NO native control bar) and
  `muted={!unmutedStreamIds.has(stream.id)}`.
- Own mute at the page level: `unmutedStreamIds: Set<string>` + `toggleStreamMute`
  (absence = muted). Pass `muted`/`onToggleMute` down to `StreamSingleView` too so
  it persists across grid<->full transitions.
- Show the same hover overlay button set (`opacity-0 group-hover:opacity-100`):
  mute (Volume2/VolumeX), favorite/heart, share (Share2 -> StreamShareDialog),
  expand-to-single-view (Maximize), native fullscreen (Expand via
  `toggleNativeFullscreen` on the closest `.video-container`).

Favorites' heart is a remove-favorite action (filled red) rather than a toggle —
that single difference is intentional.
