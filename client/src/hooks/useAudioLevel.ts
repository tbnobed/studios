import { useEffect } from "react";

/**
 * Drives a vertical audio meter directly from a tile's <video> element without
 * triggering React re-renders. The hook polls the container for the video
 * element rendered by StreamPlayer, taps its audio (MediaStream for WebRTC, the
 * media element for HLS) through a Web Audio AnalyserNode, and writes the
 * smoothed level straight onto `barRef`'s height.
 *
 * Scaling notes (a multiviewer can show up to 16 tiles at once):
 * - All tiles share ONE AudioContext via the module-level singleton below.
 *   Browsers cap the number of concurrent AudioContexts (~6), so one context
 *   per tile would break large mosaics.
 * - A single set of resume listeners (click/touch) is shared across all tiles
 *   rather than each tile registering its own.
 * - The analyser is reconnected when the tile's underlying stream identity
 *   changes (WebRTC srcObject swap), so a tile that switches sources doesn't
 *   keep metering the old stream.
 * - The polling loop is throttled to ~20fps instead of running every animation
 *   frame, which keeps CPU usage sane with many tiles.
 *
 * Browsers may start the AudioContext suspended (autoplay policy); we attempt
 * to resume it and also resume on the first user gesture. When audio is
 * unavailable (suspended context, no audio track, cross-origin taint) the meter
 * simply stays at zero rather than throwing.
 */

// Shared AudioContext + resume wiring, created lazily on first use.
let sharedCtx: AudioContext | null = null;
let resumeBound = false;
// Bumped every time the context (re)enters the "running" state. A
// MediaStreamAudioSourceNode created while the context is suspended can stay
// silent even after the context resumes; tiles compare against this counter and
// rebuild their source node when it changes so the meters actually start moving
// (this is why soloing/un-soloing a tile previously "fixed" a dead meter — the
// remount rebuilt the node on an already-running context).
let resumeGeneration = 0;

// Active tiles register a reconnect callback here. When the context transitions
// to "running" we invoke them synchronously from the statechange event so dead
// (suspended-built) source nodes are rebuilt immediately, without waiting for
// the next meter tick. This matters in a popped-out window: after the user taps
// "enable audio meters" they often move focus back to the main window, and we
// can't rely on the meter loop firing promptly to notice the resume.
const reconnectCallbacks = new Set<() => void>();
function notifyReconnect() {
  reconnectCallbacks.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

function getSharedCtx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx) {
      sharedCtx = new Ctx();
      sharedCtx.addEventListener("statechange", () => {
        if (sharedCtx?.state === "running") {
          resumeGeneration++;
          notifyReconnect();
        }
      });
      if (sharedCtx.state === "running") resumeGeneration++;
    }
    if (!resumeBound) {
      const resume = () => sharedCtx?.resume().catch(() => {});
      window.addEventListener("click", resume);
      window.addEventListener("touchstart", resume);
      resumeBound = true;
    }
    if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
}

// Reports whether the shared AudioContext is producing data. Returns
// "unavailable" when Web Audio isn't supported at all, "suspended" before the
// context has been created or while it's blocked by the autoplay policy, and
// "running" once it's active. Used by the pop-out wall to decide whether to show
// a one-tap "enable audio meters" prompt (a fresh window has no user gesture, so
// the context starts suspended and the meters read zero until the user clicks).
export function getSharedAudioContextState(): "running" | "suspended" | "unavailable" {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return "unavailable";
  if (!sharedCtx) return "suspended";
  return sharedCtx.state === "running" ? "running" : "suspended";
}

// Creates (if needed) and resumes the shared AudioContext. Safe to call from a
// user gesture handler; resolves once the resume attempt settles.
export function resumeSharedAudioContext(): Promise<void> {
  const ctx = getSharedCtx();
  if (!ctx) return Promise.resolve();
  return ctx.resume().catch(() => {});
}

const UPDATE_INTERVAL_MS = 50; // ~20fps

export function useAudioLevel(
  containerRef: React.RefObject<HTMLElement>,
  barRef: React.RefObject<HTMLElement>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let analyser: AnalyserNode | null = null;
    let source: AudioNode | null = null;
    let connectedEl: HTMLVideoElement | null = null;
    // Track the exact audio source identity so we reconnect when a tile swaps
    // streams. For WebRTC this is the MediaStream object; for HLS we key off the
    // media element itself (createMediaElementSource can only run once per el).
    let connectedSrcObject: MediaStream | null = null;
    // The resumeGeneration the current source node was built under. When the
    // context resumes after we connected, this goes stale and we rebuild.
    let connectedGeneration = -1;
    let level = 0;
    const data = new Uint8Array(128);

    const disconnect = () => {
      try {
        source?.disconnect();
      } catch {}
      try {
        analyser?.disconnect();
      } catch {}
      source = null;
      analyser = null;
      connectedEl = null;
      connectedSrcObject = null;
    };

    const ensureConnected = () => {
      const video = containerRef.current?.querySelector(
        "video"
      ) as HTMLVideoElement | null;
      if (!video) {
        if (analyser) disconnect();
        return;
      }

      const srcObj = video.srcObject as MediaStream | null;
      const sameSource = connectedEl === video && connectedSrcObject === srcObj;

      // Already connected to this exact source on a context that's been running
      // since we connected — nothing to do.
      if (sameSource && connectedGeneration === resumeGeneration) return;

      // The context resumed after we built the source node. A MediaStreamSource
      // made while suspended can stay silent, so rebuild it (WebRTC path). The
      // HLS media-element path can't be recreated and is muted anyway, so just
      // mark it current and move on.
      if (sameSource && connectedGeneration !== resumeGeneration) {
        if (srcObj) {
          disconnect();
        } else {
          connectedGeneration = resumeGeneration;
          return;
        }
      }

      // Source identity changed (stream swap). Tear down before rebuilding.
      // Note: a MediaElementSource can't be recreated for the same element, so
      // for the HLS path we only (re)connect when the element itself is new.
      if (connectedEl && (connectedEl !== video || connectedSrcObject !== srcObj)) {
        if (srcObj || connectedEl !== video) disconnect();
      }

      const ctx = getSharedCtx();
      if (!ctx) return;

      try {
        // Whether we tapped the element directly (vs. its MediaStream). The
        // element path needs special routing so we don't mute the tile (below).
        let isMediaElementSource = false;
        if (srcObj && typeof srcObj.getAudioTracks === "function") {
          if (srcObj.getAudioTracks().length === 0) return; // no audio yet
          source = ctx.createMediaStreamSource(srcObj);
          connectedSrcObject = srcObj;
        } else if (!srcObj) {
          if (connectedEl === video) return; // element already tapped
          source = ctx.createMediaElementSource(video);
          connectedSrcObject = null;
          isMediaElementSource = true;
        } else {
          return; // MediaStream present but not ready
        }

        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        // createMediaElementSource() reroutes the element's audio into the Web
        // Audio graph and removes its direct output to the speakers. For tiles
        // that play through the media element (SRT via mpegts.js, HLS via
        // hls.js) we must reconnect the source to the destination, or unmuting
        // produces a moving meter but no sound. The element's own `muted` /
        // `volume` still gate this node, so muted tiles stay silent. The
        // MediaStream (WebRTC) path is left untouched — it isn't hijacked, and
        // connecting it to the destination would double the audio.
        if (isMediaElementSource) source.connect(ctx.destination);
        connectedEl = video;
        connectedGeneration = resumeGeneration;
      } catch {
        // Ignore; will retry on the next frame.
        analyser = null;
        source = null;
      }
    };

    const tick = () => {
      if (stopped) return;
      ensureConnected();
      if (analyser) {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length) / 255;
        level = level * 0.7 + rms * 0.3;
        if (barRef.current) {
          barRef.current.style.height = `${Math.min(100, level * 140)}%`;
        }
      }
    };
    // Driven by a timer rather than requestAnimationFrame: rAF is paused while
    // the window isn't the focused one, which froze the meters in a popped-out
    // wall until the user clicked back into it. A timer keeps ticking.
    const timer = window.setInterval(tick, UPDATE_INTERVAL_MS);

    // Rebuild the source node the instant the shared context resumes, instead of
    // waiting for the next tick (see notifyReconnect above).
    reconnectCallbacks.add(ensureConnected);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      reconnectCallbacks.delete(ensureConnected);
      disconnect();
      // The shared AudioContext is intentionally left open; it is reused by
      // other tiles and across remounts.
    };
  }, [enabled, containerRef, barRef]);
}
