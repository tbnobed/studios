---
name: DeckLink multiviewer output app
description: Architecture/constraints for the standalone Windows app that outputs the multiviewer to a Blackmagic DeckLink card
---

# DeckLink multiviewer output app

The Windows "send the multiviewer to SDI" feature lives entirely in the isolated
`decklink-multiviewer/` folder: an Electron app + a native N-API C++ addon that
wraps the Blackmagic DeckLink SDK.

**Hard constraint (user mandate):** it must NEVER modify the web app
(`client/`, `server/`, `shared/`). It only *consumes* the running multiviewer
over the network by loading a URL in an offscreen Electron window.

**Why it consumes the public share route:** the multiviewer view is behind
login, but the public `/mv/:token` share route (MultiviewerShare) is
unauthenticated and renders the SAME MultiviewerTile/MultiviewerGrid components
(plays streams, supports per-tile unmute + the red "audio live" highlight). So
the output app points at a `/mv/:token` link and needs zero credentials. (Auth
fallback exists: the web app stores its JWT in localStorage under `auth_token`.)

**Output target decisions:** DeckLink Duo 2, 1080i59.94, embedded audio from the
single unmuted tile. Browser renders progressive, so the app field-weaves two
progressive frames into one 1080i frame (upper-field-first); DeckLink clocked at
timeScale 60000 / frameDuration 1001 (29.97 interlaced fps). Audio is captured
in the renderer via a Web Audio tap (only the unmuted element has sound) and
streamed as 16-bit PCM over IPC.

**How to apply:** any further DeckLink/output work stays inside
`decklink-multiviewer/`. The native addon and Electron app build/run on Windows
only (DeckLink SDK is native COM) — they cannot compile or run on Replit's
Linux. Verify/tune field order, cadence, and A/V sync on real hardware.
