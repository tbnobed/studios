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

  // Remote focus model. Watching the video is the default zone; pressing Down
  // moves focus onto the control bar so a TV remote can reach the volume and
  // "back to grid" buttons (which are otherwise mouse-only). Order matches the
  // on-screen layout: previous, next, mute, exit-to-grid.
  const CONTROLS = ["prev", "next", "mute", "exit"] as const;
  const MUTE_INDEX = 2;
  const [focusZone, setFocusZone] = useState<"video" | "controls">("video");
  const [controlsIndex, setControlsIndex] = useState(MUTE_INDEX);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the focused control button actually focused for the remote.
  useEffect(() => {
    if (focusZone === "controls") {
      btnRefs.current[controlsIndex]?.focus();
    }
  }, [focusZone, controlsIndex]);

  // Keyboard / remote navigation. In the video zone Left/Right change streams
  // and Down reveals the control bar; in the control zone Left/Right move
  // between buttons and Enter activates one. Back/Escape always returns to the
  // stream grid (so the remote Back key never falls through and exits the app).
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

      const isBack =
        e.key === "Backspace" ||
        e.key === "Escape" ||
        e.key === "GoBack" ||
        e.key === "BrowserBack";

      if (isBack) {
        e.preventDefault();
        onExit();
        return;
      }

      if (focusZone === "controls") {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            setControlsIndex((i) => Math.max(0, i - 1));
            break;
          case "ArrowRight":
            e.preventDefault();
            setControlsIndex((i) => Math.min(CONTROLS.length - 1, i + 1));
            break;
          case "ArrowUp":
            e.preventDefault();
            setFocusZone("video");
            break;
          case "Enter":
            e.preventDefault();
            {
              const action = CONTROLS[controlsIndex];
              if (action === "prev") onPrevious();
              else if (action === "next") onNext();
              else if (action === "mute") toggleMute();
              else onExit();
            }
            break;
        }
        return;
      }

      // Video zone.
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onPrevious();
          break;
        case "ArrowRight":
          e.preventDefault();
          onNext();
          break;
        case "ArrowDown":
          e.preventDefault();
          setControlsIndex(MUTE_INDEX);
          setFocusZone("controls");
          break;
        case "Enter":
          e.preventDefault();
          setControlsIndex(MUTE_INDEX);
          setFocusZone("controls");
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrevious, onExit, focusZone, controlsIndex, toggleMute]);

  const controlFocus = (i: number) =>
    focusZone === "controls" && controlsIndex === i
      ? "ring-2 ring-white scale-110 shadow-[0_0_20px_rgba(255,255,255,0.5)]"
      : "";

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
                  ref={(el) => (btnRefs.current[0] = el)}
                  variant="secondary"
                  size="sm"
                  className={`bg-black/60 hover:bg-black/80 text-white touch-area transition focus:outline-none ${controlFocus(0)}`}
                  onClick={onPrevious}
                  data-testid="button-previous-stream"
                >
                  <ChevronLeft size={16} />
                </Button>
                <div className="bg-black/60 text-white px-3 py-2 rounded text-sm font-medium">
                  Stream {currentIndex + 1} of {streams.length}
                </div>
                <Button
                  ref={(el) => (btnRefs.current[1] = el)}
                  variant="secondary"
                  size="sm"
                  className={`bg-black/60 hover:bg-black/80 text-white touch-area transition focus:outline-none ${controlFocus(1)}`}
                  onClick={onNext}
                  data-testid="button-next-stream"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>

              <div className="flex items-center space-x-3">
                <Button
                  ref={(el) => (btnRefs.current[2] = el)}
                  variant="secondary"
                  size="sm"
                  className={`bg-black/60 hover:bg-black/80 touch-area transition focus:outline-none ${
                    muted ? "text-white" : "text-green-400"
                  } ${controlFocus(2)}`}
                  onClick={toggleMute}
                  data-testid="button-toggle-audio"
                  aria-label={muted ? "Unmute audio" : "Mute audio"}
                  title={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </Button>
                <Button
                  ref={(el) => (btnRefs.current[3] = el)}
                  variant="secondary"
                  size="sm"
                  className={`bg-black/60 hover:bg-black/80 text-white touch-area transition focus:outline-none ${controlFocus(3)}`}
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
