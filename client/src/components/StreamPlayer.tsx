import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!videoRef.current || !stream.streamUrl) return;

    const initializeStream = async () => {
      try {
        // Clean up existing connection
        if (sdkRef.current) {
          sdkRef.current.close();
        }

        // Initialize SRS SDK
        if (window.SrsRtcWhipWhepAsync) {
          sdkRef.current = new window.SrsRtcWhipWhepAsync();
          
          if (videoRef.current) {
            videoRef.current.srcObject = sdkRef.current.stream;
            
            // Ensure video plays when stream is ready
            if (autoPlay) {
              videoRef.current.play().catch(console.error);
            }
          }

          // Start playing the stream
          await sdkRef.current.play(stream.streamUrl, {
            videoOnly: false,
            audioOnly: false
          });

          // Try to play video again after WebRTC connection
          if (videoRef.current && autoPlay) {
            setTimeout(() => {
              videoRef.current?.play().catch(console.error);
            }, 500);
          }

          onStatusChange?.('online');
        } else {
          console.error('SRS SDK not loaded');
          onStatusChange?.('error');
        }
      } catch (error) {
        console.error('Error initializing stream:', error);
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
  }, [stream.streamUrl, onStatusChange]);

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
            stream.status === 'online' ? 'bg-green-500 live-indicator' : 
            stream.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
          }`}></span>
          {stream.status === 'online' ? 'LIVE' : stream.status.toUpperCase()}
        </span>
      </div>
      
      <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
        {stream.resolution} • {stream.fps}fps
      </div>
    </div>
  );
}
