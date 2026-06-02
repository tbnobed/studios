---
name: Pre-existing Dashboard.tsx tsc errors
description: Dashboard.tsx emits "never" type errors that predate current work — not regressions.
---

# Pre-existing tsc errors in Dashboard.tsx

`npx tsc --noEmit` reports ~8 errors of the form `Property 'id' does not exist on type 'never'` in `client/src/pages/Dashboard.tsx` (around the studio-selection code).

**Why:** A `useQuery` there is untyped, so TS infers `never` for the data. This predates the multiviewer work and is unrelated to it.

**How to apply:** When checking your own changes with `tsc`, filter these out (`tsc --noEmit 2>&1 | grep -v Dashboard.tsx`). Don't treat them as a regression you introduced. If asked to fix them, give the query a generic type argument (e.g. `useQuery<StudioWithStreams[]>`).
