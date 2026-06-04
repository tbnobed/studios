import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { Stream } from "@shared/schema";

interface StreamPlayerProps {
  stream: Stream;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  showOverlay?: boolean;
  /** Mute the video's audio output. Defaults to true (multiviewer tiles start
   * muted; only an explicit unmute should let a tile play sound). */
  muted?: boolean;
  onStatusChange?: (status: 'online' | 'offline' | 'error') => void;
}

declare global {
  interface Window {
    SrsRtcWhipWhepAsync: any;
  }
}

// The CDN serves WHEP signaling over plain HTTP. On an HTTPS page the browser
// blocks that as mixed content, so we relay the handshake through our own
// same-origin HTTPS endpoint. Only the tiny SDP exchange is proxied — the video
// media still streams peer-to-peer directly from the CDN. The "/whep/" segment
// is required by the SRS SDK, which validates that substring before sending.
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

// HLS playlists and segments are plain HTTP and blocked as mixed content on an
// HTTPS page. Route them through our same-origin proxy, which rewrites the
// playlist so its segment URLs come back through the proxy too.
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

export function StreamPlayer({ 
  stream, 
  className = "", 
  controls = true, 
  autoPlay = false,
  showOverlay = true,
  muted = true,
  onStatusChange 
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sdkRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<any>(null);
  const [currentStatus, setCurrentStatus] = useState<'online' | 'offline' | 'error'>('offline');

  const streamType = (stream as any).streamType ?? 'webrtc';

  useEffect(() => {
    if (!videoRef.current || !stream.streamUrl) return;

    let cancelled = false;
    let videoCheckTimer: ReturnType<typeof setTimeout> | null = null;
    let detachVideoListeners: (() => void) | null = null;

    // Tear down any active connection/listeners WITHOUT marking the effect as
    // cancelled. Used both for in-effect re-initialization and (with the
    // cancelled flag) for unmount/dependency-change cleanup.
    const teardownResources = () => {
      if (videoCheckTimer) {
        clearTimeout(videoCheckTimer);
        videoCheckTimer = null;
      }
      if (detachVideoListeners) {
        detachVideoListeners();
        detachVideoListeners = null;
      }
      if (sdkRef.current) {
        sdkRef.current.close();
        sdkRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (mpegtsRef.current) {
        try {
          mpegtsRef.current.destroy();
        } catch {
          // ignore teardown errors
        }
        mpegtsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute('src');
      }
    };

    const cleanup = () => {
      cancelled = true;
      teardownResources();
    };

    const initializeHls = () => {
      const video = videoRef.current;
      if (!video) return;

      const onReady = () => {
        setCurrentStatus('online');
        onStatusChange?.('online');
        if (autoPlay) video.play().catch(console.error);
      };

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.loadSource(toHlsUrl(stream.streamUrl));
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (autoPlay) video.play().catch(console.error);
        });
        hls.on(Hls.Events.FRAG_BUFFERED, onReady);
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            console.error('HLS fatal error for', stream.name, data.type);
            setCurrentStatus('error');
            onStatusChange?.('error');
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari / iOS)
        video.src = toHlsUrl(stream.streamUrl);
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('error', () => {
          setCurrentStatus('error');
          onStatusChange?.('error');
        }, { once: true });
        if (autoPlay) video.play().catch(console.error);
      } else {
        console.error('HLS not supported in this browser');
        setCurrentStatus('error');
        onStatusChange?.('error');
      }
    };

    // SRT-ingested streams are republished by SRS as HTTP-FLV. Browsers can't
    // play FLV natively, so mpegts.js demuxes it into the video element via
    // Media Source Extensions. The FLV URL is served over HTTPS, so there's no
    // mixed-content concern and it's fetched directly (no proxy).
    const initializeFlv = () => {
      const video = videoRef.current;
      if (!video) return;

      if (!mpegts.isSupported()) {
        console.error('FLV (MSE) not supported in this browser');
        setCurrentStatus('error');
        onStatusChange?.('error');
        return;
      }

      const player = mpegts.createPlayer(
        { type: 'flv', isLive: true, url: stream.streamUrl },
        { enableStashBuffer: false, liveBufferLatencyChasing: true },
      );
      mpegtsRef.current = player;
      player.attachMediaElement(video);

      const onReady = () => {
        if (cancelled) return;
        setCurrentStatus('online');
        onStatusChange?.('online');
        if (autoPlay) video.play().catch(() => {});
      };
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('playing', onReady, { once: true });

      player.on(mpegts.Events.ERROR, (errType: any, detail: any) => {
        if (cancelled) return;
        console.error('FLV fatal error for', stream.name, errType, detail);
        setCurrentStatus('error');
        onStatusChange?.('error');
      });

      player.load();
      if (autoPlay) {
        try {
          player.play();
        } catch {
          // play() may reject on autoplay policy; the video element handles it
        }
      }
    };

    const initializeStream = async () => {
      try {
        // Tear down any prior connection without cancelling this effect run.
        teardownResources();

        if (streamType === 'hls') {
          initializeHls();
          return;
        }

        if (streamType === 'srt') {
          initializeFlv();
          return;
        }

        // Initialize SRS SDK (WebRTC / WHEP)
        if (window.SrsRtcWhipWhepAsync) {
          const sdk = new window.SrsRtcWhipWhepAsync();
          sdkRef.current = sdk;

          const video = videoRef.current;
          if (video) {
            video.srcObject = sdk.stream;
            if (autoPlay) video.play().catch(() => {});
          }

          const markOnline = () => {
            if (cancelled) return;
            setCurrentStatus('online');
            onStatusChange?.('online');
            if (autoPlay) videoRef.current?.play().catch(() => {});
          };
          const markError = () => {
            if (cancelled) return;
            setCurrentStatus('error');
            onStatusChange?.('error');
          };

          // A stream is "live" once real frames are actually flowing. WebRTC
          // negotiation can take a while — and noticeably longer when many tiles
          // connect at once — so we detect via media events plus a resilient
          // poll instead of giving up after a fixed window. This means a slow
          // source eventually shows LIVE rather than being stuck on LOADING.
          const hasFrames = () => {
            const v = videoRef.current;
            return !!v && v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2;
          };
          const onFrame = () => {
            if (hasFrames()) markOnline();
          };

          if (video) {
            video.addEventListener('loadeddata', onFrame);
            video.addEventListener('playing', onFrame);
            video.addEventListener('timeupdate', onFrame);
          }

          // Surface genuinely dead sources as errors via the peer connection
          // state rather than spinning forever.
          const pc: RTCPeerConnection | undefined = sdk.pc;
          const onPcState = () => {
            if (cancelled || !pc) return;
            if (pc.connectionState === 'failed') markError();
          };
          pc?.addEventListener?.('connectionstatechange', onPcState);

          detachVideoListeners = () => {
            if (video) {
              video.removeEventListener('loadeddata', onFrame);
              video.removeEventListener('playing', onFrame);
              video.removeEventListener('timeupdate', onFrame);
            }
            pc?.removeEventListener?.('connectionstatechange', onPcState);
          };

          // Start playing the stream. A rejection here means the WHEP endpoint
          // refused (source offline / not found).
          await sdk.play(toWhepUrl(stream.streamUrl));
          if (cancelled) return;

          // Fallback poll for browsers/sources that don't fire timeupdate
          // promptly. Keeps checking for ~20s before declaring the source dead,
          // far more forgiving than the old 3s cutoff.
          let polls = 0;
          const maxPolls = 40; // ~20 seconds at 500ms
          const poll = () => {
            if (cancelled) return;
            if (hasFrames()) {
              markOnline();
              return;
            }
            polls++;
            if (polls < maxPolls) {
              videoCheckTimer = setTimeout(poll, 500);
            } else {
              console.warn('No valid video stream detected for:', stream.name);
              markError();
            }
          };
          videoCheckTimer = setTimeout(poll, 500);
        } else {
          console.error('SRS SDK not loaded');
          setCurrentStatus('error');
          onStatusChange?.('error');
        }
      } catch (error) {
        console.error('Error initializing stream:', error);
        setCurrentStatus('error');
        onStatusChange?.('error');
      }
    };

    initializeStream();

    return cleanup;
  }, [stream.streamUrl, streamType]);

  // Apply mute imperatively: React doesn't reliably set the video element's
  // `muted` property from the attribute alone.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  return (
    <div className={`relative ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black rounded-lg"
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        disablePictureInPicture
        data-testid={`stream-video-${stream.id}`}
      />
      
      {/* Stream overlay info */}
      {showOverlay && (
        <>
          <div className="absolute bottom-2 right-2 flex items-center space-x-2">
            <span className="bg-black/60 text-white px-2 py-1 rounded text-xs font-medium">
              <span className={`w-2 h-2 rounded-full inline-block mr-1 ${
                currentStatus === 'online' ? 'bg-green-500 live-indicator' : 
                currentStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
              }`}></span>
              {currentStatus === 'online' ? 'LIVE' : currentStatus.toUpperCase()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}