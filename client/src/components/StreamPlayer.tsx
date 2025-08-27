import { useEffect, useRef, useState } from "react";
import { Stream } from "@shared/schema";

interface StreamPlayerProps {
  stream: Stream;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
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
  onStatusChange 
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sdkRef = useRef<any>(null);
  const [currentStatus, setCurrentStatus] = useState<'online' | 'offline' | 'error'>(stream.status as 'online' | 'offline' | 'error');

  useEffect(() => {
    if (!videoRef.current || !stream.streamUrl) return;

    const initializeStream = async () => {
      try {
        // Clean up existing connection
        if (sdkRef.current) {
          sdkRef.current.close();
          sdkRef.current = null;
        }

        // Initialize SRS SDK
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
            videoCheckCount++;
            
            if (videoRef.current) {
              const hasVideo = videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0;
              const isPlaying = !videoRef.current.paused && !videoRef.current.ended && videoRef.current.currentTime > 0;
              
              if (hasVideo && (isPlaying || videoRef.current.readyState >= 3)) {
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
              setTimeout(checkVideoData, 500);
            } else {
              console.warn('No valid video stream detected for:', stream.name);
              setCurrentStatus('error');
              onStatusChange?.('error');
            }
          };
          
          setTimeout(checkVideoData, 500); // Start checking after 500ms
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

    return () => {
      if (sdkRef.current) {
        sdkRef.current.close();
        sdkRef.current = null;
      }
    };
  }, [stream.streamUrl]);

  return (
    <div className={`relative ${className}`}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain bg-black rounded-lg"
        controls={controls}
        autoPlay={autoPlay}
        muted
        data-testid={`stream-video-${stream.id}`}
      />
      
      {/* Stream overlay info */}
      <div className="absolute top-2 left-2 flex items-center space-x-2">
        <span className="bg-black/60 text-white px-2 py-1 rounded text-xs font-medium">
          <span className={`w-2 h-2 rounded-full inline-block mr-1 ${
            currentStatus === 'online' ? 'bg-green-500 live-indicator' : 
            currentStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
          }`}></span>
          {currentStatus === 'online' ? 'LIVE' : currentStatus.toUpperCase()}
        </span>
      </div>
      
      <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
        {stream.resolution} • {stream.fps}fps
      </div>
    </div>
  );
}