---
name: Auth query retryOnMount loop on public pages
description: Why public pages that call useAuth() can cause an infinite mount/refetch loop when logged out, and how to stop it.
---

# Public pages + errored auth query = mount loop

When logged out, the `["/api/auth/user"]` query sits in an **error** state (401).
A public page (rendered past the App's auth gate but still calling `useAuth()`)
adds a new observer to that errored query on mount.

**The trap:** React Query retries/refetches an *errored* query when a new
observer mounts. `refetchOnMount: false` is NOT enough — for errored queries the
relevant flag is `retryOnMount` (default `true`). That retry flips the query to
pending, which flips the App's global `isLoading` gate to "Loading…", which
unmounts the public page, which on remount re-triggers the retry → infinite loop.
Symptom: tight 1:1 server log loop of `GET /api/auth/user 401` plus whatever the
page does on mount (e.g. `POST /api/tv/pair/start`), and the page stuck on
"Loading…".

**Fix:** set BOTH `refetchOnMount: false` AND `retryOnMount: false` on the
`useAuth` query. Login/logout still refresh it explicitly via
`queryClient.invalidateQueries(["/api/auth/user"])`, which is unaffected.

**Why:** the errored-query retry-on-observer behavior is easy to miss because the
obvious `refetchOnMount` flag doesn't cover the error path.

**How to apply:** any time a public/unauthenticated route also calls `useAuth()`
(TV pairing screens, login screens, share links), make sure the shared auth query
won't self-retry on mount. Same family of bug as favorites-render-loop.
