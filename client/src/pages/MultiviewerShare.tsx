import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Volume2, Loader2, AlertCircle } from "lucide-react";
import { MultiviewerTile } from "@/components/MultiviewerTile";
import { StreamSingleView } from "@/components/StreamSingleView";
import { MultiviewerGrid } from "@/components/MultiviewerGrid";
import { slotCount, fitSlots } from "@/lib/multiviewerLayouts";
import {
  getSharedAudioContextState,
  resumeSharedAudioContext,
} from "@/hooks/useAudioLevel";
import type { MultiviewerSharePublic, MultiviewerLayoutType } from "@shared/schema";

type TileStream = MultiviewerSharePublic["streams"][number] & {
  studio?: { id: string; name: string };
};

// Public, chrome-less multiview wall for outside viewers with no account.
// Data comes from the token-gated /api/mv-share/:token endpoint.
export default function MultiviewerShare() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [soloStreamId, setSoloStreamId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<MultiviewerSharePublic>({
    queryKey: ["/api/mv-share", token],
    retry: false,
  });

  const layoutType = (data?.layout.layoutType as MultiviewerLayoutType) ?? "2x2";

  const slots = useMemo(
    () => (data ? fitSlots(data.layout.slots ?? [], slotCount(layoutType)) : []),
    [data, layoutType]
  );

  const streamMap = useMemo(() => {
    const map = new Map<string, TileStream>();
    for (const s of data?.streams ?? []) map.set(s.id, s);
    return map;
  }, [data]);

  useEffect(() => {
    if (data?.layout) document.title = `${data.layout.name} · Multiviewer`;
    return () => {
      document.title = "OBTV Studio Manager";
    };
  }, [data]);

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

  // Audio meters need a user gesture in this document before the browser lets
  // the shared AudioContext run; surface a one-tap prompt until it does.
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
        studios={[]}
        usedStreamIds={new Set()}
        onAssign={() => {}}
        onSolo={() => id && setSoloStreamId(id)}
        featured={featured}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Loading multiview…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-zinc-400 p-4 text-center">
        <AlertCircle className="w-8 h-8 text-destructive mb-3" />
        <p className="text-sm" data-testid="text-mv-share-error">
          This share link is invalid or has expired.
        </p>
      </div>
    );
  }

  let body: JSX.Element;
  if (slots.length === 0) {
    body = (
      <div className="h-full flex flex-col items-center justify-center text-zinc-400">
        <Monitor size={40} className="mb-3 opacity-60" />
        <p>This multiview has no sources.</p>
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
