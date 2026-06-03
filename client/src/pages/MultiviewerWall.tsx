import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Volume2 } from "lucide-react";
import { MultiviewerTile } from "@/components/MultiviewerTile";
import { StreamSingleView } from "@/components/StreamSingleView";
import { MultiviewerGrid } from "@/components/MultiviewerGrid";
import { slotCount, fitSlots } from "@/lib/multiviewerLayouts";
import {
  getSharedAudioContextState,
  resumeSharedAudioContext,
} from "@/hooks/useAudioLevel";
import { getAuthHeaders } from "@/lib/authUtils";
import type {
  MultiviewerLayout,
  MultiviewerLayoutType,
  Stream,
  StudioWithStreams,
} from "@shared/schema";

type TileStream = Stream & { studio?: { id: string; name: string } };

// A distraction-free, chrome-less multiviewer wall meant to be popped out into
// its own window (TV / second monitor). It renders nothing but the grid for a
// single saved layout — no header, no sidebar, no edit controls.
export default function MultiviewerWall() {
  const [, params] = useRoute("/multiviewer/view/:id");
  const layoutId = params?.id ?? null;
  const [soloStreamId, setSoloStreamId] = useState<string | null>(null);

  const { data: studiosData } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    meta: { headers: getAuthHeaders() },
  });
  const studios = useMemo(() => studiosData ?? [], [studiosData]);

  const { data: layoutsData, isLoading: layoutsLoading } = useQuery<
    MultiviewerLayout[]
  >({
    queryKey: ["/api/multiviewer-layouts"],
    meta: { headers: getAuthHeaders() },
  });
  const layouts = useMemo(() => layoutsData ?? [], [layoutsData]);

  const layout = useMemo(
    () => layouts.find((l) => l.id === layoutId) ?? null,
    [layouts, layoutId]
  );

  const streamMap = useMemo(() => {
    const map = new Map<string, TileStream>();
    for (const studio of studios) {
      for (const s of studio.streams) {
        map.set(s.id, { ...s, studio: { id: studio.id, name: studio.name } });
      }
    }
    return map;
  }, [studios]);

  const layoutType = (layout?.layoutType as MultiviewerLayoutType) ?? "2x2";
  const slots = useMemo(
    () => (layout ? fitSlots(layout.slots ?? [], slotCount(layoutType)) : []),
    [layout, layoutType]
  );

  // Keep the browser tab title meaningful for whoever's watching the wall.
  useEffect(() => {
    if (layout) document.title = `${layout.name} · Multiviewer`;
    return () => {
      document.title = "OBTV Studio Manager";
    };
  }, [layout]);

  const assignedStreams = useMemo(
    () =>
      slots
        .map((id) => (id ? streamMap.get(id) : null))
        .filter((s): s is TileStream => Boolean(s)),
    [slots, streamMap]
  );

  const soloIndex = soloStreamId
    ? assignedStreams.findIndex((s) => s.id === soloStreamId)
    : -1;

  useEffect(() => {
    if (soloStreamId && soloIndex === -1) setSoloStreamId(null);
  }, [soloStreamId, soloIndex]);

  // The audio meters tap a Web Audio AnalyserNode whose AudioContext is held
  // suspended by the browser's autoplay policy until a user gesture happens in
  // THIS document. A freshly popped-out window has no such gesture, so the
  // meters read zero. Poll the shared context's state so we can surface a
  // one-tap prompt, and hide it again the moment the context is running.
  const hasAssignedStreams = assignedStreams.length > 0;
  const [audioState, setAudioState] = useState(getSharedAudioContextState());
  useEffect(() => {
    if (!hasAssignedStreams) return;
    const tick = () => setAudioState(getSharedAudioContextState());
    tick();
    const id = window.setInterval(tick, 700);
    return () => window.clearInterval(id);
  }, [hasAssignedStreams]);
  const needsAudioUnlock = hasAssignedStreams && audioState === "suspended";

  const enableAudioMeters = () => {
    resumeSharedAudioContext().finally(() =>
      setAudioState(getSharedAudioContextState())
    );
  };

  const renderTile = (index: number, featured = false) => {
    const id = slots[index] ?? null;
    const stream = id ? streamMap.get(id) ?? null : null;
    const unavailable = Boolean(id) && !stream;
    return (
      <MultiviewerTile
        key={index}
        index={index}
        stream={stream}
        unavailable={unavailable}
        editMode={false}
        studios={studios}
        usedStreamIds={new Set()}
        onAssign={() => {}}
        onSolo={() => id && setSoloStreamId(id)}
        featured={featured}
      />
    );
  };

  let body: JSX.Element;
  if (!layout) {
    body = (
      <div className="h-full flex flex-col items-center justify-center text-zinc-400">
        <Monitor size={40} className="mb-3 opacity-60" />
        <p>{layoutsLoading ? "Loading layout…" : "Layout not found."}</p>
      </div>
    );
  } else if (soloStreamId && soloIndex !== -1) {
    body = (
      <StreamSingleView
        streams={assignedStreams}
        currentIndex={soloIndex}
        onNext={() =>
          setSoloStreamId(
            assignedStreams[(soloIndex + 1) % assignedStreams.length]?.id ?? null
          )
        }
        onPrevious={() =>
          setSoloStreamId(
            assignedStreams[
              (soloIndex - 1 + assignedStreams.length) % assignedStreams.length
            ]?.id ?? null
          )
        }
        onExit={() => setSoloStreamId(null)}
      />
    );
  } else {
    body = (
      <MultiviewerGrid
        type={layoutType}
        renderCell={(i, big) => renderTile(i, big)}
      />
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black p-2">
      {body}

      {needsAudioUnlock && (
        <button
          type="button"
          onClick={enableAudioMeters}
          className="absolute bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg backdrop-blur transition-colors hover:bg-primary"
          data-testid="button-enable-audio-meters"
          title="Browsers block audio metering in a new window until you interact with it"
        >
          <Volume2 size={16} />
          Enable audio meters
        </button>
      )}
    </div>
  );
}
