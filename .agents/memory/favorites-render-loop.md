---
name: Favorites render loop (pre-existing)
description: Favorites page emits a React "Maximum update depth exceeded" dev warning from its own useEffect, independent of navigation/layout work.
---

# Favorites "Maximum update depth exceeded" warning

The Favorites page logs a React dev warning ("Maximum update depth exceeded",
sometimes paired with "Invalid hook call") originating from one of its own
`useEffect`s that syncs local order/index state with the `favorites` query.

**Why:** This predates the sidebar/header refactor — it is NOT caused by removing
the top bar, the shared header, or adding the StudioSidebar nav. Verified via git
diff: nav changes never touched the offending effect.

**How to apply:** If you see this warning after touching navigation/layout, do not
assume you introduced it. The actual fix (if requested) is to stabilize the effect's
dependencies / guard the setState in Favorites — out of scope for nav work.
