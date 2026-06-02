---
name: StreamPlayer status detection timing
description: How StreamPlayer decides online/offline/error and why parent re-renders make it appear stuck offline.
---

# StreamPlayer status detection

`StreamPlayer` starts at `currentStatus='offline'` and only advances to `'online'`
(badge "LIVE") after async confirmation:
- WebRTC/WHEP: polls the `<video>` for real frame data up to ~3s, then errors out.
- HLS: flips online on the first buffered fragment event.

**Why:** detection is intentionally delayed to avoid showing "LIVE" before frames
actually flow.

**How to apply:** Because confirmation takes time, anything that remounts the player
(parent infinite render loop, unstable `key`, churning props) resets it to `'offline'`
and prevents it from ever confirming. If many tiles read offline while clearly
playing, fix the parent re-render, not the player.
