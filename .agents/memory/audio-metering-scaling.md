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
