import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Grid3X3, Volume2, VolumeX } from "lucide-react";
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
  /** Controlled mute state. When provided, the parent owns it so audio persists
   * across grid<->full transitions; when omitted the view manages it locally. */
  muted?: boolean;
  onToggleMute?: () => void;
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
  muted: controlledMuted,
  onToggleMute,
  onStatusChange,
}: StreamSingleViewProps) {
  const stream = streams[currentIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  // The single/full view shows one stream the user explicitly chose to watch,
  // so audio is ON by default (the grid/tiles stay muted to avoid everything
  // blasting at once). Entering this view is always a user gesture, so the
  // browser allows playback with sound. When the parent passes `muted` it owns
  // the state instead (so audio persists across grid<->full transitions).
  const isControlled = controlledMuted !== undefined;
  const [internalMuted, setInternalMuted] = useState(false);
  const muted = isControlled ? controlledMuted : internalMuted;
  const toggleMute = () => {
    if (isControlled) onToggleMute?.();
    else setInternalMuted((m) => !m);
  };

  // Keyboard navigation: left/right arrows move between streams, Escape exits to
  // the grid. Ignore keystrokes while typing in an input/textarea so we don't
  // hijack form fields elsewhere on the page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrevious, onExit]);

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
              muted={muted}
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

              <div className="flex items-center space-x-3">
                <Button
                  variant="secondary"
                  size="sm"
                  className={`bg-black/60 hover:bg-black/80 touch-area ${
                    muted ? "text-white" : "text-green-400"
                  }`}
                  onClick={toggleMute}
                  data-testid="button-toggle-audio"
                  aria-label={muted ? "Unmute audio" : "Mute audio"}
                  title={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </Button>
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
            </div>

            {/* Touch Gesture Indicators */}
            <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-xs gesture-hint">
              Pinch to zoom • Swipe or ← → to navigate
            </div>
          </>
        )}
      </div>
    </GestureHandler>
  );
}
