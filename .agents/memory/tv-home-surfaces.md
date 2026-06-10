---
name: TV/OTT home content surfaces
description: What the 10-foot OTT home (TvHome) must show and why it reuses the desktop player.
---

The OTT/TV home (`/tv`, TvHome) must surface the SAME curated content the user has on desktop, not just Studios: a Favorites row, a My Multiviewers row, and a Studios row. Earlier it only listed Studios -> Streams, and users reported "I don't see my multiviewers or favorites" — they meant on the TV, not desktop.

**Why:** the TV is just another front-end onto the same per-user data (`/api/favorites`, `/api/multiviewer-layouts`, `/api/studios`). A user who curated favorites/multiviewers expects them on every surface.

**How to apply:**
- Favorites/studio streams open a fullscreen `StreamSingleView` (keeps player parity with Dashboard/Favorites — see player-controls-parity.md).
- A multiviewer card navigates to `/multiviewer/view/:id` (the fullscreen wall).
- Remote nav is 2D on home (Left/Right within a row, Up/Down between rows); guard against empty rows so arrow math never produces a -1 focus index.

## OTT CPU: captured-still thumbnails, not live decoders
On the TV home (favorites row + studio streams grid) NEVER keep a live StreamPlayer mounted on every card — OTT/TV devices have weak CPUs and decoding N streams at once kills them. Cards show captured still-frame thumbnails (`StreamThumbnail`): briefly connect to a stream (same WebRTC/HLS/FLV relays the live player uses), grab ONE frame off a detached `<video>` onto a canvas → JPEG data URL, then tear the connection down so only a static `<img>` remains. A module-level concurrency gate (MAX_CONCURRENT=2, acquireSlot/releaseSlot) caps simultaneous captures; each tile re-captures every ~45s for freshness. The fullscreen StreamSingleView is the only place a stream plays "for real."

**Why:** the user explicitly wanted preview thumbnails of what's currently playing on every card, but full live decode per card is too heavy. Capture-once-then-static gives the preview at a fraction of the cost. (An earlier "only the highlighted card goes live" approach did NOT satisfy the request — they wanted a thumbnail on every card.)
