---
name: WHEP mixed-content proxy
description: Why/how WebRTC WHEP signaling is relayed through the app origin, and SRS SDK constraints
---

# Streaming over HTTPS: the mixed-content problem

The CDN (cdn1.obedtv.live:2022, cdn2.obedtv.live:1990) serves WebRTC **WHEP
signaling over plain HTTP**. When the app is served over HTTPS (required for PWA
install), the browser blocks that HTTP signaling fetch as **mixed content**, so
streams won't start.

**Key nuance:** only the one-time WHEP *signaling* (SDP offer/answer POST) is
HTTP and blocked. The actual WebRTC **media is peer-to-peer UDP/SRTP** and is
NOT subject to mixed-content rules — it flows browser↔CDN directly regardless of
page protocol. So fixing signaling fixes WebRTC playback; media path is unchanged.

## The fix: same-origin signaling relay
A server route relays the SDP handshake through the app's own HTTPS origin. The
browser only talks HTTPS to same-origin; the server→CDN hop is HTTP (server-side,
no mixed-content rule). Added server load is just a few KB per stream-open — media
never passes through the server.

**Why a relay and not "put TLS on the CDN":** user chose the no-CDN-change path.

## SRS SDK (`client/public/js/srs.sdk.js`) constraints — these bite
- `play(url)` **throws unless the URL string contains `/whep/` (or `/whip-play/`)**.
  Any rewrite/proxy path MUST keep `/whep/` as a substring.
- It sends via a **bare XHR** with only `Content-Type: application/sdp` and the
  offer SDP as the body. It **cannot attach custom headers** → a relay route
  **cannot use Bearer-token auth** (this app's `requireAuth` reads
  `Authorization: Bearer`). Don't gate the relay with requireAuth or playback 401s.
- Single POST offer→answer, **non-trickle**; SDK ignores the WHEP `Location`
  header, so the relay only needs to return upstream status + answer SDP body.

## Relay security boundary (since it can't use auth)
- **Domain allowlist** is the boundary (CDN endpoints are already public over
  HTTP). Allow hostname === domain or endsWith(`.${domain}`), domain defaults to
  `obedtv.live` (override via `WHEP_ALLOWED_DOMAIN`). Use a suffix check, NOT a
  hardcoded host Set — new CDN nodes appear over time (cdn1/cdn2/cdn3.obedtv.live).
  The suffix check still blocks lookalikes like `cdn3.obedtv.live.evil.com`.
- Validate: `protocol === 'http:'`, host on allowed domain, path contains `/whep/`.
- **`fetch(..., { redirect: "error" })`** — without it an allowlisted host could
  redirect the server off-allowlist (SSRF). Forward the normalized URL.
- Only proxy when `window.location.protocol === 'https:'` so HTTP dev is untouched.

## Testing limitation
The Replit environment **cannot reach cdn*.obedtv.live** (egress blocked — curl
times out). The relay can't be end-to-end tested from Replit; a valid target
returns 502 because the server-side fetch fails. It works in the user's
self-hosted Docker network where the app server can reach the CDN.
