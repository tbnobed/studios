---
name: Streaming mixed-content proxies (WHEP + HLS)
description: Why/how WebRTC WHEP signaling AND HLS are relayed through the app origin, SRS SDK constraints, shared allowlist
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

## HLS mixed-content proxy (`GET /api/hls?target=`) — different from WHEP
- HLS has **NO peer-to-peer path**: the playlist AND every segment are plain HTTP
  fetches from the browser, so on HTTPS *all* of them are blocked as mixed content
  and *all* bytes must be relayed through the app server. Load scales with
  viewers × bitrate (unlike WHEP, where only a few KB of signaling is relayed).
- Playlist (`.m3u8`) handling: fetch it, then rewrite every URI back through the
  proxy, resolving relative URLs against the playlist URL (`new URL(uri, base)`):
  - bare non-`#` lines = segment / sub-playlist URIs → rewrite.
  - `URI="..."` attrs in `#EXT-X-KEY` / `#EXT-X-MAP` / `#EXT-X-MEDIA` → rewrite.
  - Return `Content-Type: application/vnd.apple.mpegurl`, `Cache-Control: no-store`.
- Segments / keys / init: stream through with `Readable.fromWeb(upstream.body)`;
  pass upstream content-type/length. (CDN serves `.ts` as `application/octet-stream`
  — fine; hls.js & native HLS parse the container, not the MIME type.)
- Client `toHlsUrl()` mirrors `toWhepUrl()` (https + `http://` guard) and wraps
  both `hls.loadSource(...)` and the native-Safari `video.src` path.

## Shared security boundary (neither proxy can use auth)
- **Domain allowlist** is the boundary (CDN endpoints are already public over
  HTTP). One shared helper `isAllowedStreamHost`: hostname === domain or
  endsWith(`.${domain}`); domain defaults to `obedtv.live`, override via
  **`STREAM_ALLOWED_DOMAIN`** (renamed from WHEP_ALLOWED_DOMAIN to cover both).
  Suffix check, NOT a hardcoded host Set — new CDN nodes appear over time
  (cdn1..cdn4.obedtv.live). Still blocks lookalikes (`cdn3.obedtv.live.evil.com`).
- Validate: `protocol === 'http:'`, host on allowed domain (+ path contains
  `/whep/` for the WHEP relay specifically).
- **`fetch(..., { redirect: "error" })`** on BOTH — without it an allowlisted host
  could redirect the server off-allowlist (SSRF). Forward the normalized URL.
- Only proxy when `window.location.protocol === 'https:'` so HTTP dev is untouched.

## Testing note (corrected)
HLS over HTTPS was verified **end-to-end from Replit**: `cdn4.obedtv.live:2022`
HLS was reachable (playlist rewritten correctly, a `.ts` segment streamed through
as valid MPEG-TS). So CDN egress from Replit is at least partially open — earlier
WHEP attempts returning 502 may have been a transient/port-specific block, not a
hard egress wall. Don't assume the CDN is unreachable from Replit by default.
