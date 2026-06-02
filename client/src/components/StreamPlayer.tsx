import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Stream } from "@shared/schema";

interface StreamPlayerProps {
  stream: Stream;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  showOverlay?: boolean;
  onStatusChange?: (status: 'online' | 'offline' | 'error') => void;
}

declare global {
  interface Window {
    SrsRtcWhipWhepAsync: any;
  }
}

export function StreamPlayer({ 
  stream, 
  className = "", 
  controls = true, 
  autoPlay = false,
  showOverlay = true,
  onStatusChange 
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sdkRef = useRef<any>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentStatus, setCurrentStatus] = useState<'online' | 'offline' | 'error'>('offline');

  const streamType = (stream as any).streamType ?? 'webrtc';

  useEffect(() => {
    if (!videoRef.current || !stream.streamUrl) return;

    let cancelled = false;
    let videoCheckTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      cancelled = true;
      if (videoCheckTimer) {
        clearTimeout(videoCheckTimer);
        videoCheckTimer = null;
      }
      if (sdkRef.current) {
        sdkRef.current.close();
        sdkRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute('src');
      }
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
        hls.loadSource(stream.streamUrl);
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
        video.src = stream.streamUrl;
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

    const initializeStream = async () => {
      try {
        // Clean up existing connection
        cleanup();

        if (streamType === 'hls') {
          initializeHls();
          return;
        }

        // Initialize SRS SDK (WebRTC / WHEP)
        if (window.SrsRtcWhipWhepAsync) {
          sdkRef.current = new window.SrsRtcWhipWhepAsync();
          
          if (videoRef.current) {
            videoRef.current.srcObject = sdkRef.current.stream;
            
            if (autoPlay) {
              videoRef.current.play().catch(console.error);
            }
          }

          // Start playing the stream
          await sdkRef.current.play(stream.streamUrl);

          // Check for actual video data flowing
          let videoCheckCount = 0;
          const maxChecks = 6; // Check for 3 seconds
          
          const checkVideoData = () => {
            if (cancelled) return;
            videoCheckCount++;
            
            if (videoRef.current) {
              const hasVideo = videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0;
              const hasData = videoRef.current.readyState >= 2; // At least HAVE_CURRENT_DATA
              const isPlaying = !videoRef.current.paused && !videoRef.current.ended && videoRef.current.currentTime > 0;
              
              // Removed debug logging for cleaner console output
              
              if (hasVideo && hasData && (isPlaying || videoRef.current.readyState >= 3)) {
                setCurrentStatus('online');
                onStatusChange?.('online');
                
                // Try to play video after confirming stream
                if (autoPlay) {
                  videoRef.current.play().catch(console.error);
                }
                return;
              }
            }
            
            if (videoCheckCount < maxChecks) {
              videoCheckTimer = setTimeout(checkVideoData, 500);
            } else {
              console.warn('No valid video stream detected for:', stream.name);
              setCurrentStatus('error');
              onStatusChange?.('error');
            }
          };
          
          videoCheckTimer = setTimeout(checkVideoData, 500); // Start checking after 500ms
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

  return (
    <div className={`relative ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black rounded-lg"
        controls={controls}
        autoPlay={autoPlay}
        muted
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