---
name: Literal fallback identities in effect deps cause render loops
description: Avoid array/object literal fallbacks for values used in useEffect dependency arrays; they create a new identity every render and loop.
---

# Don't put literal fallback identities in effect dependencies

**Rule:** A value used in a `useEffect` dependency array (or passed as a prop that
drives a child's effects) must have a stable identity across renders. Inline
fallbacks like `useQuery(...) // data: x = []`, `x ?? []`, or `?? {}` create a NEW
reference every render, so the effect re-runs every render → `setState` → re-render →
"Maximum update depth exceeded".

**Why:** This shipped on the Favorites page and was painful to diagnose because the
*visible* symptom was unrelated: every stream tile showed "OFFLINE" while video was
clearly playing. The render loop kept remounting child media players faster than
their async live-detection could complete, so they never left their initial offline
state. The streaming code was fine; the parent loop was the cause.

**How to apply:** Stabilize with `useMemo(() => data ?? [], [data])` (don't destructure
with `= []`). When child media/players look stuck loading/offline, suspect a parent
re-render loop before touching player logic — see `stream-status-detection.md`.
