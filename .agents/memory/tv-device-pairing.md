---
name: TV/OTT device pairing security invariants
description: Single-use + no-takeover rules for the QR/phone TV pairing handshake (Netflix/YouTube-on-TV style).
---

# TV device pairing handshake

Flow: TV calls `/api/tv/pair/start` (gets deviceCode + short userCode), shows a QR
to `/tv/pair?code=...`; the phone (authenticated) calls `/api/tv/pair/approve`
binding userCode -> its userId; the TV polls `/api/tv/pair/status?deviceCode` and
receives a minted 24h JWT once approved.

## Invariants that MUST hold (regressions are auth bugs)
- **No approval takeover:** `approveTvPairing` must be a conditional
  `approved:false -> true` update (WHERE userCode AND approved=false). If it
  updates unconditionally, a second authenticated user can re-bind the pending
  code to themselves before the TV polls, and the TV gets a token for the wrong
  account. The approve route returns 409 when the conditional update matches
  nothing.
- **Single-use token mint:** `/status` must consume the pairing atomically —
  delete-and-return in ONE statement (WHERE deviceCode AND approved=true), then
  mint the token only if a row came back. A read -> sign -> separate-delete
  sequence lets concurrent polls mint multiple tokens.

**Why:** the pairing code is briefly visible/guessable on a TV screen; both holes
let an attacker hijack the session during the short pending window.

**How to apply:** any change to the pairing endpoints or storage methods must
preserve the conditional approve and the atomic consume. Public TV pages also
call useAuth() — see auth-query-retry-loop.md for the mount-loop trap.

## SSO must preserve the pairing code across the redirect round-trip
The inline username/password login on `/tv/pair` keeps `?code=XXXX` because it
never leaves the page. **SSO is a full-page redirect** to the IdP and back, so
the code is dropped unless it is carried through. The fix: the SSO button passes
`?returnTo=/tv/pair?code=XXXX` to `/api/auth/sso`; the server packs `returnTo`
into the OAuth `state` (base64url JSON, IdP echoes it verbatim), and the callback
redirects to `returnTo` (sanitized: must start with `/`, not `//`) with
`sso_token` appended instead of the default `/`. `TvPair` consumes `sso_token`
on mount (setAuthToken, strip token from URL keeping the code, reload), landing
back on the "Allow this TV?" screen — no rescan. **Why:** without this the phone
lands on `/` post-SSO, authenticated but with no pairing context, forcing a QR
rescan to approve the TV.
