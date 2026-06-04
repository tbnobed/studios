---
name: Single-view player viewport fit
description: Why the expanded StreamSingleView must be wrapped in a viewport-bounded height container on Dashboard/Favorites.
---

# Single-view player viewport fit

`StreamSingleView` is `h-full` and its `<video>` uses `object-contain`, so it
letterboxes to fit ONLY when its parent has a definite bounded height.

**Gotcha:** On Dashboard and Favorites the content area is `md:h-auto
md:overflow-visible` on purpose, so the grid/paged views scroll the page. That
makes `h-full` unbounded for the single-view branch, and the object-contain video
box grows by width*aspect and overflows past the bottom of the screen.

**Rule:** Wrap ONLY the single-view branch in a viewport-bounded container, e.g.
`h-[calc(100dvh-6.5rem)]` (≈ header ~81px + p-2 padding; keep it slightly
conservative so the page doesn't scroll). Use `dvh`, not `vh`, for mobile chrome.
Do NOT make the shared content wrapper a fixed height — that breaks scrolling of
the grid/paged/arrange views.

**Multiviewer** does not need this: its solo view sits in a proper flex column
with `min-h-0`, so `h-full` is already bounded there.
