---
name: Reuse existing UI behavior, don't fork it
description: When a feature must match an existing UI behavior, extract and share the existing implementation instead of writing a second divergent copy.
---

# Never build a second divergent implementation of an existing UI behavior

When asked to give feature B "the same" capability that feature A already has
(e.g. the Favorites grid needing the same enlarge/single-view the studio
Dashboard grid already has), **extract A's implementation into one shared
component and reuse it**. Do not hand-write a parallel implementation for B.

**Why:** Forking produced two code paths that drifted (Dashboard used an
in-panel grid↔single `viewMode` swap with a "Stream X of Y" counter and a
grid-icon exit; the Favorites copy was a full-viewport modal with a name label
and an X exit). The user experienced this as "broken / works differently" and
was rightly frustrated. Duplicated logic also means every future change has to
be made twice and keeps diverging.

**How to apply:**
- If the existing behavior lives inline in a page (not yet a component), the
  first step is to extract it into a shared component (props for the data list,
  current index, next/prev/exit callbacks, status callback), then wire BOTH the
  original page and the new one to it.
- Reshape the new feature's data to fit the shared component (e.g. map
  `FavoriteWithStream[]` → `Stream[]`) rather than cloning the component.
- Watch for state entanglement (the studio enlarge shares `viewMode` with a
  toolbar toggle); share or lift that state instead of copying the markup.
- Default bias: a slightly larger refactor to share one implementation beats a
  fast second copy. "Make it look/work just like X" means literally reuse X.
