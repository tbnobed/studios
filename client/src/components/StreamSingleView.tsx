import { useRef } from "react";
import { ChevronLeft, ChevronRight, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GestureHandler } from "@/components/GestureHandler";
import { StreamPlayer } from "@/components/StreamPlayer";
import type { Stream } from "@shared/schema";

interface StreamSingleViewProps {
  streams: Stream[];
  currentIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  onExit: () => void;
  onStatusChange?: (
    streamId: string,
    status: "online" | "offline" | "error"
  ) => void;
}

export function StreamSingleView({
  streams,
  currentIndex,
  onNext,
  onPrevious,
  onExit,
  onStatusChange,
}: StreamSingleViewProps) {
  const stream = streams[currentIndex];
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <GestureHandler
      onSwipeLeft={onNext}
      onSwipeRight={onPrevious}
      onPinchZoom={(scale) => {
        const video = containerRef.current?.querySelector(
          "video"
        ) as HTMLElement | null;
        if (video) {
          video.style.transform = `scale(${Math.min(Math.max(scale, 1), 3)})`;
        }
      }}
      className="h-full"
    >
      <div
        ref={containerRef}
        className="h-full bg-black rounded-lg overflow-hidden relative"
      >
        {stream && (
          <>
            <StreamPlayer
              stream={stream}
              className="w-full h-full"
              controls={false}
              autoPlay={true}
              onStatusChange={(status) => onStatusChange?.(stream.id, status)}
            />

            {/* Video Controls Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-black/60 hover:bg-black/80 text-white touch-area"
                  onClick={onPrevious}
                  data-testid="button-previous-stream"
                >
                  <ChevronLeft size={16} />
                </Button>
                <div className="bg-black/60 text-white px-3 py-2 rounded text-sm font-medium">
                  Stream {currentIndex + 1} of {streams.length}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-black/60 hover:bg-black/80 text-white touch-area"
                  onClick={onNext}
                  data-testid="button-next-stream"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="bg-black/60 hover:bg-black/80 text-white touch-area"
                onClick={onExit}
                data-testid="button-exit-fullscreen"
              >
                <Grid3X3 size={16} />
              </Button>
            </div>

            {/* Touch Gesture Indicators */}
            <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-xs gesture-hint">
              Pinch to zoom • Swipe to navigate
            </div>
          </>
        )}
      </div>
    </GestureHandler>
  );
}
