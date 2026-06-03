import { useRef, useState } from "react";
import { Maximize2, Plus, X, Volume2, VolumeX, GripVertical, AlertTriangle } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StreamPlayer } from "@/components/StreamPlayer";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import type { Stream, StudioWithStreams } from "@shared/schema";

type TileStatus = "loading" | "online" | "offline" | "error";

interface MultiviewerTileProps {
  /** position of this tile within the layout's slots array */
  index: number;
  stream: Stream | null;
  /** slot holds a stream id, but that source no longer exists / is not viewable */
  unavailable?: boolean;
  editMode: boolean;
  studios: StudioWithStreams[];
  /** stream ids already used elsewhere in the layout (disabled in the picker) */
  usedStreamIds: Set<string>;
  onAssign: (streamId: string | null) => void;
  onSolo: () => void;
  featured?: boolean;
}

const STATUS_BORDER: Record<TileStatus, string> = {
  loading: "border-yellow-500/70",
  online: "border-green-500/80",
  offline: "border-zinc-600/70",
  error: "border-red-500/80",
};

const STATUS_DOT: Record<TileStatus, string> = {
  loading: "bg-yellow-500",
  online: "bg-green-500",
  offline: "bg-zinc-500",
  error: "bg-red-500",
};

/** Shared id namespace so draggable + droppable line up by slot index. */
export const slotDndId = (index: number) => `slot-${index}`;

export function MultiviewerTile({
  index,
  stream,
  unavailable = false,
  editMode,
  studios,
  usedStreamIds,
  onAssign,
  onSolo,
  featured = false,
}: MultiviewerTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<TileStatus>("loading");
  // Tiles start muted (you don't want every tile blasting audio at once); the
  // speaker button toggles this tile's audio output.
  const [muted, setMuted] = useState(true);

  useAudioLevel(containerRef, meterRef, Boolean(stream));

  const dndId = slotDndId(index);
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dndId,
    disabled: !editMode,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: dndId,
    disabled: !editMode || !stream,
  });

  // One element acts as both the drag source and the drop target for its slot.
  const setRefs = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    setDropRef(node);
    setDragRef(node);
  };

  const dropHighlight = isOver && !isDragging ? "ring-2 ring-primary ring-offset-1 ring-offset-black" : "";

  // Empty slot, or a slot whose saved source is no longer available.
  if (!stream) {
    return (
      <div
        ref={setRefs}
        className={`relative h-full w-full rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${
          unavailable
            ? "border-amber-500/60 bg-amber-950/30"
            : isOver
              ? "border-primary bg-primary/10"
              : "border-zinc-700/70 bg-black/40"
        } ${dropHighlight}`}
        data-testid={
          unavailable
            ? `multiviewer-tile-unavailable-${index}`
            : `multiviewer-tile-empty-${index}`
        }
      >
        {editMode ? (
          <div className="flex w-full flex-col items-center gap-2 px-2">
            {unavailable && (
              <div className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle size={14} className="shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  Source unavailable
                </span>
              </div>
            )}
            <div className="flex w-full items-center gap-1">
              <div className="min-w-0 flex-1">
                <StreamPicker
                  studios={studios}
                  usedStreamIds={usedStreamIds}
                  value={null}
                  onChange={onAssign}
                  placeholder={unavailable ? "Replace source" : "Add a source"}
                />
              </div>
              {unavailable && (
                <button
                  type="button"
                  className="shrink-0 rounded bg-black/70 p-1 text-white hover:bg-red-600/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssign(null);
                  }}
                  data-testid={`button-clear-unavailable-${index}`}
                  aria-label="Clear unavailable source"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        ) : unavailable ? (
          <div className="flex flex-col items-center px-2 text-center text-amber-400">
            <AlertTriangle size={featured ? 24 : 18} />
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider">
              Source unavailable
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-zinc-600">
            <Plus size={20} />
            <span className="mt-1 text-[10px] uppercase tracking-wider">Empty</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setRefs}
      className={`group relative h-full w-full overflow-hidden rounded-lg border-2 bg-black transition-colors ${STATUS_BORDER[status]} ${
        editMode ? "" : "cursor-pointer"
      } ${isDragging ? "opacity-40" : ""} ${dropHighlight}`}
      onClick={editMode ? undefined : onSolo}
      data-testid={`multiviewer-tile-${stream.id}`}
    >
      <StreamPlayer
        stream={stream}
        className="h-full w-full"
        controls={false}
        autoPlay
        showOverlay={false}
        muted={muted}
        onStatusChange={(s) => setStatus(s)}
      />

      {/* Audio meter (left edge) */}
      <div className="pointer-events-none absolute left-1 top-1 bottom-7 flex w-1.5 items-end">
        <div className="relative h-full w-full overflow-hidden rounded-full bg-black/50">
          <div
            ref={meterRef}
            className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-green-500 via-green-400 to-yellow-300"
            style={{ height: "0%" }}
          />
        </div>
      </div>

      {/* Status pill (top-right) */}
      <div className="pointer-events-none absolute right-1.5 top-1.5">
        <span className="flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          {status === "online" ? "Live" : status}
        </span>
      </div>

      {/* UMD / source label (bottom strip) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-3">
        <div className="min-w-0">
          <p
            className={`truncate font-semibold text-white ${featured ? "text-sm" : "text-[11px]"}`}
            title={stream.name}
          >
            {stream.name}
          </p>
          <p className="truncate text-[9px] uppercase tracking-wider text-white/60">
            {(stream as any).studio?.name ?? stream.resolution ?? ""}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className={`pointer-events-auto shrink-0 rounded p-1 transition-colors hover:bg-white/10 ${
            muted ? "text-white/50" : "text-green-400"
          }`}
          data-testid={`button-mute-${stream.id}`}
          aria-label={muted ? "Unmute audio" : "Mute audio"}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <VolumeX size={featured ? 14 : 11} />
          ) : (
            <Volume2 size={featured ? 14 : 11} />
          )}
        </button>
      </div>

      {/* Hover controls in view mode */}
      {!editMode && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/20 group-hover:opacity-100">
          <span className="pointer-events-none rounded-full bg-black/60 p-2 text-white">
            <Maximize2 size={featured ? 22 : 18} />
          </span>
        </div>
      )}

      {/* Edit controls */}
      {editMode && (
        <div className="absolute inset-x-1 top-1 flex items-center gap-1">
          <button
            type="button"
            className="shrink-0 touch-none cursor-grab rounded bg-black/70 p-1 text-white hover:bg-black/90 active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            data-testid={`drag-handle-${stream.id}`}
            aria-label="Drag source to another tile"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={12} />
          </button>
          <div className="flex-1" onClick={(e) => e.stopPropagation()}>
            <StreamPicker
              studios={studios}
              usedStreamIds={usedStreamIds}
              value={stream.id}
              onChange={onAssign}
              placeholder="Change source"
            />
          </div>
          <button
            className="shrink-0 rounded bg-black/70 p-1 text-white hover:bg-red-600/80"
            onClick={(e) => {
              e.stopPropagation();
              onAssign(null);
            }}
            data-testid={`button-clear-tile-${stream.id}`}
            aria-label="Remove source"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function StreamPicker({
  studios,
  usedStreamIds,
  value,
  onChange,
  placeholder,
}: {
  studios: StudioWithStreams[];
  usedStreamIds: Set<string>;
  value: string | null;
  onChange: (streamId: string | null) => void;
  placeholder: string;
}) {
  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => onChange(v)}
    >
      <SelectTrigger
        className="h-7 w-full border-white/20 bg-black/70 text-[11px] text-white"
        data-testid="select-tile-stream"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {studios.map((studio) => (
          <SelectGroup key={studio.id}>
            <SelectLabel>{studio.name}</SelectLabel>
            {studio.streams.map((s) => (
              <SelectItem
                key={s.id}
                value={s.id}
                disabled={s.id !== value && usedStreamIds.has(s.id)}
              >
                {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
