---
name: "Media resource aborted" runtime-error overlay
description: Why the benign media-abort overlay appears and the only reliable way to stop it.
---

The Vite runtime-error overlay ("The fetching process for the media resource was aborted by the user agent at the user's request") is the @replit/vite-plugin-runtime-error-modal client catching an **unhandledrejection**. Its listeners are bubble-phase on `window`; the overlay is NOT triggered by media-element `error` events (those don't bubble) and only by uncaught promise rejections.

**Why a global suppressor does NOT work:** at the target (window), listeners fire in registration order regardless of capture flag, and the plugin registers first. So `preventDefault`/`stopImmediatePropagation` in our own handler can't stop the plugin. The ONLY fix is to ensure the rejecting promise is caught so no `unhandledrejection` ever fires.

**How to apply:** every media play attempt must catch its promise. `<video>.play()` returns a promise — always `.catch()` it. mpegts.js `player.play()` ALSO returns the element's play() promise; a synchronous `try/catch` can't catch it, so wrap as `Promise.resolve(player.play()).catch(() => {})`. The abort fires when the src-based (HLS/FLV) fetch is torn down mid-load (stream switch/unmount). WebRTC (srcObject) never produces this message.
