---
name: Web Audio metering must share one AudioContext
description: Per-tile AudioContexts break large multiviewer mosaics; use a shared singleton.
---

# Audio metering at scale (multiviewer)

When rendering many simultaneous audio meters (multiviewer shows up to 16 tiles), do **not** create one `AudioContext` per tile.

**Why:** Browsers cap concurrent `AudioContext` instances (Chrome ~6). Beyond the cap, `new AudioContext()` throws and meters silently die — so a 4x4 grid would lose most meters and burn CPU running 16 rAF loops.

**How to apply:**
- Use a module-level shared `AudioContext` singleton, lazily created, reused across all tiles and remounts; never `close()` it on unmount.
- Register resume-on-gesture listeners (click/touch) **once** globally, not per tile.
- Reconnect a tile's analyser when its stream identity changes (track `srcObject` for WebRTC); a `MediaElementSource` (HLS path) can only be created once per `<video>` element, so key that path off the element identity.
- Throttle the read loop (~20fps via timestamp gate inside requestAnimationFrame) instead of computing every frame.

## createMediaElementSource silences the tile unless reconnected to destination

`createMediaElementSource(video)` (used for the media-element audio path: SRT via mpegts.js, HLS via hls.js — anything where `video.srcObject` is null) **reroutes the element's audio into the Web Audio graph and removes its direct speaker output**. If you only `source.connect(analyser)`, the meter moves but there is NO sound. You must ALSO `source.connect(ctx.destination)` for that path.

**Why:** This is the classic Web Audio gotcha — once an element is tapped via `createMediaElementSource`, default routing to the speakers is gone. WebRTC uses `createMediaStreamSource(srcObject)` which does NOT hijack the element, so it stays audible without a destination connection. Symptom seen: "SRT audio not working in multiviewer" — meters animated, no sound, while WebRTC tiles were fine.

**How to apply:** Connect to `ctx.destination` ONLY on the media-element branch. Do NOT connect the MediaStream (WebRTC) source to destination — that doubles/echoes the audio. The element's own `muted`/`volume` still gate a MediaElementSource, so muted-by-default tiles stay silent. `source.disconnect()` on teardown removes both analyser + destination links, so no routing leak.
