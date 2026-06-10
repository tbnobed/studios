import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { StreamPlayer } from "@/components/StreamPlayer";
import { StreamSingleView } from "@/components/StreamSingleView";
import { useAuth } from "@/hooks/useAuth";
import { removeAuthToken } from "@/lib/authUtils";
import { queryClient } from "@/lib/queryClient";
import type { StudioWithStreams, Stream } from "@shared/schema";
import { Tv, LogOut, ChevronLeft, Radio } from "lucide-react";

type Level = "studios" | "streams";

// 10-foot "living room" UI for OTT devices, driven entirely by a remote:
//   - Arrow keys move the highlight, Enter selects, Back/Escape goes up a level.
//   - Studios grid -> a studio's streams grid -> fullscreen player.
// The fullscreen player reuses StreamSingleView so it stays in parity with the
// Dashboard/Favorites viewing experience (audio on, arrow keys switch streams).
export default function TvHome() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [level, setLevel] = useState<Level>("studios");
  const [studioIndex, setStudioIndex] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/tv/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: studios = [], isLoading } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    enabled: isAuthenticated,
  });

  const selectedStudio = studios[studioIndex];
  const streams: Stream[] = selectedStudio?.streams ?? [];

  // How many focusable items are in the current grid.
  const itemCount = level === "studios" ? studios.length : streams.length;
  const columns = level === "studios" ? 3 : 2;

  // Keep the focused card in view and actually focused for accessibility.
  useEffect(() => {
    if (playerIndex !== null) return;
    const el = buttonRefs.current[focusIndex];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusIndex, level, playerIndex, itemCount]);

  const enterStudios = useCallback(() => {
    setLevel("studios");
    setFocusIndex(studioIndex);
  }, [studioIndex]);

  const goBack = useCallback(() => {
    if (playerIndex !== null) {
      setPlayerIndex(null);
      return;
    }
    if (level === "streams") {
      enterStudios();
    }
  }, [playerIndex, level, enterStudios]);

  const select = useCallback(() => {
    if (level === "studios") {
      if (!studios[focusIndex]) return;
      setStudioIndex(focusIndex);
      setLevel("streams");
      setFocusIndex(0);
    } else {
      if (!streams[focusIndex]) return;
      setPlayerIndex(focusIndex);
    }
  }, [level, focusIndex, studios, streams]);

  // Remote / keyboard navigation. The fullscreen player owns its own arrow keys
  // (via StreamSingleView), so we only handle Back while it's open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (playerIndex !== null) {
        if (e.key === "Backspace" || e.key === "GoBack" || e.key === "BrowserBack") {
          e.preventDefault();
          goBack();
        }
        return;
      }

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setFocusIndex((i) => Math.min(itemCount - 1, i + 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setFocusIndex((i) => Math.max(0, i - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusIndex((i) => Math.min(itemCount - 1, i + columns));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIndex((i) => Math.max(0, i - columns));
          break;
        case "Enter":
          e.preventDefault();
          select();
          break;
        case "Backspace":
        case "Escape":
        case "GoBack":
        case "BrowserBack":
          e.preventDefault();
          goBack();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [itemCount, columns, select, goBack, playerIndex]);

  const handleLogout = () => {
    removeAuthToken();
    queryClient.clear();
    setLocation("/tv/login");
  };

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex items-center justify-center text-2xl">
        Loading…
      </div>
    );
  }

  // Fullscreen player level.
  if (playerIndex !== null && streams[playerIndex]) {
    return (
      <StreamSingleView
        streams={streams}
        currentIndex={playerIndex}
        onNext={() => setPlayerIndex((i) => (i === null ? 0 : (i + 1) % streams.length))}
        onPrevious={() =>
          setPlayerIndex((i) => (i === null ? 0 : (i - 1 + streams.length) % streams.length))
        }
        onExit={() => setPlayerIndex(null)}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-gray-900 via-slate-900 to-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-10 py-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          {level === "streams" ? (
            <button
              onClick={goBack}
              className="flex items-center gap-2 text-xl text-white/70 hover:text-white focus:outline-none focus:text-white"
            >
              <ChevronLeft size={28} /> {selectedStudio?.name}
            </button>
          ) : (
            <div className="flex items-center gap-3 text-2xl font-bold">
              <Tv size={30} /> TBN Studios
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-lg text-white/50 hover:text-white focus:outline-none focus:text-white"
        >
          <LogOut size={22} /> Sign out
        </button>
      </header>

      <main className="px-10 py-8">
        <h2 className="text-3xl font-bold mb-6">
          {level === "studios" ? "Choose a studio" : `${selectedStudio?.name} — choose a stream`}
        </h2>

        {itemCount === 0 ? (
          <div className="text-white/50 text-xl py-20 text-center">
            {level === "studios" ? "No studios available." : "No streams in this studio."}
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              level === "studios" ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            {level === "studios"
              ? studios.map((studio, idx) => (
                  <button
                    key={studio.id}
                    ref={(el) => (buttonRefs.current[idx] = el)}
                    onClick={() => {
                      setFocusIndex(idx);
                      setStudioIndex(idx);
                      setLevel("streams");
                      setFocusIndex(0);
                    }}
                    onMouseEnter={() => setFocusIndex(idx)}
                    className={`group relative aspect-video rounded-2xl overflow-hidden border-4 text-left transition-all focus:outline-none ${
                      focusIndex === idx
                        ? "border-primary scale-[1.03] shadow-2xl shadow-primary/30"
                        : "border-transparent opacity-80"
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
                    <div className="absolute inset-0 p-6 flex flex-col justify-end">
                      <div className="text-3xl font-bold">{studio.name}</div>
                      <div className="text-lg text-white/70 flex items-center gap-2">
                        <Radio size={18} /> {studio.streams?.length ?? 0} streams
                      </div>
                    </div>
                  </button>
                ))
              : streams.map((stream, idx) => (
                  <button
                    key={stream.id}
                    ref={(el) => (buttonRefs.current[idx] = el)}
                    onClick={() => {
                      setFocusIndex(idx);
                      setPlayerIndex(idx);
                    }}
                    onMouseEnter={() => setFocusIndex(idx)}
                    className={`group relative aspect-video rounded-2xl overflow-hidden border-4 text-left transition-all focus:outline-none ${
                      focusIndex === idx
                        ? "border-primary scale-[1.03] shadow-2xl shadow-primary/30"
                        : "border-transparent opacity-80"
                    }`}
                  >
                    <StreamPlayer
                      stream={stream}
                      className="absolute inset-0 w-full h-full"
                      controls={false}
                      autoPlay
                      muted
                      showOverlay={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 pointer-events-none">
                      <div className="text-2xl font-bold">{stream.name}</div>
                    </div>
                  </button>
                ))}
          </div>
        )}

        <p className="mt-10 text-white/40 text-base text-center">
          Use the arrow keys to move · Enter / OK to select · Back to go up
        </p>
      </main>
    </div>
  );
}
