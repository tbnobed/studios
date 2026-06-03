---
name: StreamPlayer status detection timing
description: How StreamPlayer decides online/offline/error and why parent re-renders make it appear stuck offline.
---

# StreamPlayer status detection

`StreamPlayer` starts at `currentStatus='offline'` and only advances to `'online'`
(badge "LIVE") after async confirmation:
- WebRTC/WHEP: detected via `<video>` media events (`loadeddata`/`playing`/`timeupdate`)
  + a resilient fallback poll (~20s) for real frame data; PC `connectionstatechange`
  → `failed` marks error. HLS flips online on the first buffered fragment event.

**Why:** detection is intentionally delayed to avoid showing "LIVE" before frames
actually flow.

## The cancelled-flag trap (bit us once)

The effect has a `cancelled` flag and a `cleanup()` that sets `cancelled=true`.
`initializeStream()` must NOT call `cleanup()` to tear down a prior connection — that
sets `cancelled=true` for the very run that's starting, so every WebRTC status callback
(`markOnline`/`markError`/poll) early-returns and the badge is stuck on LOADING forever.
HLS masked this because its `onReady` never checked `cancelled`, so HLS tiles went LIVE
while WebRTC tiles didn't — making it look like a WebRTC-only or environmental issue.

**Fix/rule:** separate teardown from cancellation. Use a `teardownResources()` (closes
sdk/hls, clears timers, detaches listeners, nulls srcObject) for in-effect re-init, and
reserve `cancelled=true` for the effect's unmount/dep-change `cleanup` only.

**How to apply:** Because confirmation takes time, anything that remounts the player
(parent infinite render loop, unstable `key`, churning props) also resets it to
`'offline'`. If many tiles read offline while clearly playing, check (1) the cancelled
flag isn't set during init, then (2) the parent re-render.
