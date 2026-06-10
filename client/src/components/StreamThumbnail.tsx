import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { Stream } from "@shared/schema";
import { Radio } from "lucide-react";

declare global {
  interface Window {
    SrsRtcWhipWhepAsync: any;
  }
}

// Same mixed-content relays the live player uses (see StreamPlayer.tsx).
function toWhepUrl(streamUrl: string): string {
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    streamUrl.startsWith("http://")
  ) {
    return `/api/whep/relay?target=${encodeURIComponent(streamUrl)}`;
  }
  return streamUrl;
}

function toHlsUrl(streamUrl: string): string {
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    streamUrl.startsWith("http://")
  ) {
    return `/api/hls?target=${encodeURIComponent(streamUrl)}`;
  }
  return streamUrl;
}

// Global capture gate: connecting to a source (especially WebRTC negotiation)
// is the expensive part, so we only ever capture a couple of thumbnails at once.
// This keeps OTT-device CPU/network calm even on a studio with many streams.
const MAX_CONCURRENT = 2;
let activeCaptures = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCaptures < MAX_CONCURRENT) {
    activeCaptures++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) {
    // Hand the slot directly to the next waiter (active count unchanged).
    next();
  } else {
    activeCaptures = Math.max(0, activeCaptures - 1);
  }
}

// Wait until the (detached) video element actually has a decoded frame.
function waitForFrame(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const hasFrame = () =>
      video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      video.removeEventListener("loadeddata", onEvt);
      video.removeEventListener("playing", onEvt);
      video.removeEventListener("timeupdate", onEvt);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(ok);
    };
    const onEvt = () => {
      if (hasFrame()) finish(true);
    };
    video.addEventListener("loadeddata", onEvt);
    video.addEventListener("playing", onEvt);
    video.addEventListener("timeupdate", onEvt);
    const poll = setInterval(onEvt, 300);
    const timer = setTimeout(() => finish(hasFrame()), timeoutMs);
    onEvt();
  });
}

// Connect to a stream just long enough to grab a single frame, draw it to a
// canvas, then tear the connection down. Returns a JPEG data URL (or null).
async function captureFrame(stream: Stream, maxWidth = 480): Promise<string | null> {
  const streamType = (stream as any).streamType ?? "webrtc";
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  let sdk: any = null;
  let hls: Hls | null = null;
  let player: any = null;

  const cleanup = () => {
    try {
      sdk?.close?.();
    } catch {
      /* ignore */
    }
    try {
      hls?.destroy();
    } catch {
      /* ignore */
    }
    try {
      player?.destroy?.();
    } catch {
      /* ignore */
    }
    try {
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    } catch {
      /* ignore */
    }
  };

  try {
    if (streamType === "hls") {
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(toHlsUrl(stream.streamUrl));
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = toHlsUrl(stream.streamUrl);
      } else {
        return null;
      }
    } else if (streamType === "srt") {
      if (!mpegts.isSupported()) return null;
      player = mpegts.createPlayer(
        { type: "flv", isLive: true, url: stream.streamUrl },
        { enableStashBuffer: false, liveBufferLatencyChasing: true },
      );
      player.attachMediaElement(video);
      player.load();
    } else {
      if (!window.SrsRtcWhipWhepAsync) return null;
      sdk = new window.SrsRtcWhipWhepAsync();
      video.srcObject = sdk.stream;
      await sdk.play(toWhepUrl(stream.streamUrl));
    }

    await Promise.resolve(video.play()).catch(() => {});

    const ok = await waitForFrame(video, 12000);
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!ok || !w || !h) return null;

    const scale = Math.min(1, maxWidth / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      return canvas.toDataURL("image/jpeg", 0.6);
    } catch {
      // Tainted canvas (cross-origin without CORS) — can't read pixels.
      return null;
    }
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

interface StreamThumbnailProps {
  stream: Stream;
  className?: string;
  /** How often to refresh the still (ms). 0 disables refresh. */
  refreshMs?: number;
}

// A lightweight "what's playing now" preview: a captured still frame instead of
// a permanently-decoding live player. Cards use this so a whole grid of streams
// doesn't pin the CPU; full live playback only happens in the fullscreen view.
export function StreamThumbnail({ stream, className = "", refreshMs = 45000 }: StreamThumbnailProps) {
  const [poster, setPoster] = useState<string | null>(null);
  const hasPosterRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    hasPosterRef.current = false;
    setPoster(null);

    const run = async () => {
      await acquireSlot();
      let url: string | null = null;
      try {
        if (cancelled) return;
        url = await captureFrame(stream);
      } finally {
        releaseSlot();
      }
      if (cancelled) return;
      if (url) {
        hasPosterRef.current = true;
        setPoster(url);
      }
      if (!cancelled && refreshMs > 0) {
        timer = setTimeout(run, refreshMs);
      }
    };

    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stream.streamUrl, (stream as any).streamType, refreshMs]);

  return (
    <div className={`absolute inset-0 ${className}`}>
      {poster ? (
        <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
          <Radio className="text-white/25" size={26} />
        </div>
      )}
    </div>
  );
}
