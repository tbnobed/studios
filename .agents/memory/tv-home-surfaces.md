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
