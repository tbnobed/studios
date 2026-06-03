import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Save,
  Trash2,
  Star,
  Pencil,
  Eye,
  Menu,
  Monitor,
  ExternalLink,
  Share2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StudioSidebar, { sourceDndId } from "@/components/StudioSidebar";
import { MultiviewerTile, slotDndId } from "@/components/MultiviewerTile";
import { StreamSingleView } from "@/components/StreamSingleView";
import { MultiviewerGrid } from "@/components/MultiviewerGrid";
import { LayoutPicker } from "@/components/LayoutPicker";
import { MultiviewerShareDialog } from "@/components/MultiviewerShareDialog";
import { slotCount, fitSlots } from "@/lib/multiviewerLayouts";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/authUtils";
import type {
  MultiviewerLayout,
  MultiviewerLayoutWithMeta,
  MultiviewerLayoutType,
  Stream,
  StudioWithStreams,
} from "@shared/schema";

type TileStream = Stream & { studio?: { id: string; name: string } };

// Where the in-progress (unsaved) arrangement is stashed so a refresh or
// accidental navigation doesn't lose it before the operator presses Save.
const DRAFT_STORAGE_KEY = "obtv-multiviewer-draft";

type LayoutDraft = {
  layoutType: MultiviewerLayoutType;
  slots: (string | null)[];
  currentLayoutId: string | null;
};

function loadDraft(): LayoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LayoutDraft;
    if (!parsed || !Array.isArray(parsed.slots) || !parsed.layoutType) {
      return null;
    }
    return {
      layoutType: parsed.layoutType,
      slots: parsed.slots,
      currentLayoutId: parsed.currentLayoutId ?? null,
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: LayoutDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / serialization errors */
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function slotsEqual(a: (string | null)[], b: (string | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? null) !== (b[i] ?? null)) return false;
  }
  return true;
}

export default function Multiviewer() {
  const { toast } = useToast();
  // Restore any unsaved arrangement stashed before a refresh / navigation.
  const initialDraftRef = useRef<LayoutDraft | null>(loadDraft());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [layoutType, setLayoutType] = useState<MultiviewerLayoutType>(
    () => initialDraftRef.current?.layoutType ?? "2x2"
  );
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    initialDraftRef.current
      ? fitSlots(
          initialDraftRef.current.slots,
          slotCount(initialDraftRef.current.layoutType)
        )
      : fitSlots([], 4)
  );
  const [editMode, setEditMode] = useState(false);
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(
    () => initialDraftRef.current?.currentLayoutId ?? null
  );
  // The saved arrangement the working state is based on; used to detect
  // unsaved changes. `null` means "new / unsaved layout".
  const [baseline, setBaseline] = useState<{
    layoutType: MultiviewerLayoutType;
    slots: (string | null)[];
  } | null>(null);
  const [soloStreamId, setSoloStreamId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const appliedDefaultRef = useRef(false);
  // Layout id awaiting a "some sources unavailable" check once streams load.
  const pendingLayoutCheckRef = useRef<string | null>(null);

  const { data: studiosData } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    meta: { headers: getAuthHeaders() },
  });
  const studios = useMemo(() => studiosData ?? [], [studiosData]);

  const { data: layoutsData } = useQuery<MultiviewerLayoutWithMeta[]>({
    queryKey: ["/api/multiviewer-layouts"],
    meta: { headers: getAuthHeaders() },
  });
  const layouts = useMemo(() => layoutsData ?? [], [layoutsData]);

  // Flatten studios into a stream lookup that carries the studio name for UMDs.
  const streamMap = useMemo(() => {
    const map = new Map<string, TileStream>();
    for (const studio of studios) {
      for (const s of studio.streams) {
        map.set(s.id, { ...s, studio: { id: studio.id, name: studio.name } });
      }
    }
    // Layouts shared TO me embed their resolved streams so they render even when
    // I lack direct permission to those sources.
    for (const l of layouts) {
      for (const s of l.streams ?? []) {
        if (!map.has(s.id)) map.set(s.id, s);
      }
    }
    return map;
  }, [studios, layouts]);

  // On first arrival, either restore the saved baseline behind a recovered
  // draft, or auto-load the user's default layout.
  useEffect(() => {
    if (appliedDefaultRef.current || layouts.length === 0) return;
    appliedDefaultRef.current = true;
    if (initialDraftRef.current) {
      // A draft was restored; recover its baseline from the saved layout it
      // was based on (if it still exists) so the unsaved indicator is accurate.
      const base = initialDraftRef.current.currentLayoutId
        ? layouts.find((l) => l.id === initialDraftRef.current!.currentLayoutId)
        : null;
      if (base) {
        const type = base.layoutType as MultiviewerLayoutType;
        setBaseline({
          layoutType: type,
          slots: fitSlots(base.slots ?? [], slotCount(type)),
        });
      }
      return;
    }
    const def = layouts.find((l) => l.isDefault);
    if (def) {
      applyLayout(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts]);

  const applyLayout = (layout: MultiviewerLayout) => {
    const type = layout.layoutType as MultiviewerLayoutType;
    const fitted = fitSlots(layout.slots ?? [], slotCount(type));
    setLayoutType(type);
    setSlots(fitted);
    setCurrentLayoutId(layout.id);
    setBaseline({ layoutType: type, slots: fitted });
    setEditMode(false);
    // Flag this layout so we can warn (once) about any stale sources after
    // the studios/streams have loaded.
    pendingLayoutCheckRef.current = layout.id;
  };

  // After a layout is applied and streams are loaded, warn once if some of
  // its slots reference sources that no longer exist / are no longer viewable.
  useEffect(() => {
    if (!pendingLayoutCheckRef.current) return;
    // Wait until the studios query has resolved before judging availability.
    if (!studiosData) return;
    const missing = slots.filter((id) => id && !streamMap.has(id)).length;
    pendingLayoutCheckRef.current = null;
    if (missing > 0) {
      toast({
        title: "Some sources unavailable",
        description: `${missing} source${missing === 1 ? "" : "s"} in this layout ${
          missing === 1 ? "is" : "are"
        } no longer available.`,
      });
    }
  }, [studiosData, streamMap, slots, toast]);

  const changeLayoutType = (type: MultiviewerLayoutType) => {
    setLayoutType(type);
    setSlots((prev) => fitSlots(prev, slotCount(type)));
  };

  const assignSlot = (index: number, streamId: string | null) => {
    setSlots((prev) => {
      const next = [...prev];
      // A stream can only appear once; clear any other slot holding it.
      if (streamId) {
        for (let i = 0; i < next.length; i++) {
          if (next[i] === streamId) next[i] = null;
        }
      }
      next[index] = streamId;
      return next;
    });
  };

  // Move/swap the contents of two slots (drag-and-drop in edit mode).
  const swapSlots = (from: number, to: number) => {
    setSlots((prev) => {
      if (from === to || from < 0 || to < 0) return prev;
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[to];
      next[to] = next[from];
      next[from] = tmp;
      return next;
    });
  };

  // Whether the working arrangement differs from the saved baseline. With no
  // baseline (a brand-new layout) any filled slot counts as unsaved.
  const isDirty = useMemo(() => {
    if (!baseline) return slots.some(Boolean);
    return (
      baseline.layoutType !== layoutType || !slotsEqual(baseline.slots, slots)
    );
  }, [baseline, layoutType, slots]);

  // Persist unsaved work so a refresh doesn't lose it; clear once saved.
  useEffect(() => {
    if (isDirty) {
      saveDraft({ layoutType, slots, currentLayoutId });
    } else {
      clearDraft();
    }
  }, [isDirty, layoutType, slots, currentLayoutId]);

  // Throw away unsaved changes, reverting to the saved baseline (or empty).
  const discardChanges = () => {
    if (baseline) {
      setLayoutType(baseline.layoutType);
      setSlots(fitSlots(baseline.slots, slotCount(baseline.layoutType)));
    } else {
      setSlots((prev) => fitSlots([], prev.length));
    }
    clearDraft();
  };

  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  // Stream id of a source being dragged in from the sidebar (vs. a tile move).
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    })
  );

  // dnd ids are `slot-<index>`; recover the numeric index.
  const slotIndexFromId = (id: string | number): number => {
    const num = Number(String(id).replace("slot-", ""));
    return Number.isNaN(num) ? -1 : num;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith("source-")) {
      setActiveSourceId(id.replace("source-", ""));
      setActiveSlot(null);
    } else {
      setActiveSlot(slotIndexFromId(id));
      setActiveSourceId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveSlot(null);
    setActiveSourceId(null);
    const { active, over } = event;
    if (!over) return;
    const toIndex = slotIndexFromId(over.id);
    if (toIndex < 0) return;
    const activeId = String(active.id);
    if (activeId.startsWith("source-")) {
      // A brand-new source dragged in from the sidebar fills/replaces the tile.
      assignSlot(toIndex, activeId.replace("source-", ""));
    } else {
      swapSlots(slotIndexFromId(activeId), toIndex);
    }
  };

  const handleDragCancel = () => {
    setActiveSlot(null);
    setActiveSourceId(null);
  };

  const usedStreamIds = useMemo(
    () => new Set(slots.filter((s): s is string => Boolean(s))),
    [slots]
  );

  // Ordered list of assigned streams, used for the solo / single view.
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

  // Exit solo if its stream is no longer present.
  useEffect(() => {
    if (soloStreamId && soloIndex === -1) setSoloStreamId(null);
  }, [soloStreamId, soloIndex]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      layoutType: MultiviewerLayoutType;
      slots: (string | null)[];
    }) => {
      const res = await apiRequest("POST", "/api/multiviewer-layouts", payload);
      return (await res.json()) as MultiviewerLayout;
    },
    onSuccess: (layout, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
      setCurrentLayoutId(layout.id);
      setBaseline({
        layoutType: variables.layoutType,
        slots: fitSlots(variables.slots, slotCount(variables.layoutType)),
      });
      setSaveDialogOpen(false);
      setLayoutName("");
      toast({ title: "Layout saved" });
    },
    onError: () =>
      toast({
        title: "Could not save layout",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!currentLayoutId) return null;
      const res = await apiRequest(
        "PATCH",
        `/api/multiviewer-layouts/${currentLayoutId}`,
        { layoutType, slots }
      );
      return (await res.json()) as MultiviewerLayout;
    },
    onSuccess: (layout) => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
      if (layout) {
        const type = layout.layoutType as MultiviewerLayoutType;
        setBaseline({
          layoutType: type,
          slots: fitSlots(layout.slots ?? [], slotCount(type)),
        });
      }
      toast({ title: "Layout updated" });
    },
    onError: () =>
      toast({
        title: "Could not update layout",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/multiviewer-layouts/${id}`);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
      if (currentLayoutId === id) {
        setCurrentLayoutId(null);
        setBaseline(null);
      }
      toast({ title: "Layout deleted" });
    },
    onError: () =>
      toast({
        title: "Could not delete layout",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/multiviewer-layouts/${id}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
      toast({ title: "Default layout set" });
    },
    onError: () =>
      toast({
        title: "Could not set default",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const currentLayout = layouts.find((l) => l.id === currentLayoutId) ?? null;
  // A layout someone else shared with me: view-only, no edit/save/delete/share.
  const isShared = Boolean(currentLayout?.shared);

  // Never leave edit mode on while viewing a read-only shared layout.
  useEffect(() => {
    if (isShared && editMode) setEditMode(false);
  }, [isShared, editMode]);

  const handleSaveClick = () => {
    if (currentLayoutId) {
      updateMutation.mutate();
    } else {
      setLayoutName("");
      setSaveDialogOpen(true);
    }
  };

  const renderTile = (index: number, featured = false) => {
    const id = slots[index] ?? null;
    const stream = id ? streamMap.get(id) ?? null : null;
    // The slot holds a stream id, but that stream is gone or no longer viewable.
    const unavailable = Boolean(id) && !stream;
    return (
      <MultiviewerTile
        key={index}
        index={index}
        stream={stream}
        unavailable={unavailable}
        editMode={editMode}
        studios={studios}
        usedStreamIds={usedStreamIds}
        onAssign={(streamId) => assignSlot(index, streamId)}
        onSolo={() => id && setSoloStreamId(id)}
        featured={featured}
      />
    );
  };

  const activeStream = activeSourceId
    ? streamMap.get(activeSourceId) ?? null
    : activeSlot !== null && slots[activeSlot]
      ? streamMap.get(slots[activeSlot] as string) ?? null
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-slate-800 to-black">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <div className="flex-1 flex relative z-10 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <StudioSidebar activeMultiviewer sourceDragEnabled={editMode} />
        </div>

        <main className="flex-1 relative flex flex-col min-w-0">
          {/* Header */}
          <div
            className="bg-card border-b border-border px-4 lg:px-6 py-3 shrink-0"
            style={{ marginTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center space-x-3">
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="lg:hidden touch-area"
                      data-testid="button-menu"
                    >
                      <Menu size={20} />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="p-0 w-64">
                    <StudioSidebar
                      activeMultiviewer
                      sourceDragEnabled={editMode}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
                <div>
                  <h2 className="text-xl font-bold" data-testid="multiviewer-title">
                    Multiviewer
                  </h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>
                      {assignedStreams.length} of {slots.length} sources
                      {currentLayout ? ` · ${currentLayout.name}` : ""}
                    </span>
                    {isDirty && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500"
                        data-testid="badge-unsaved-changes"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Unsaved changes
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Read-only badge for layouts shared to me by someone else */}
                {isShared && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                    data-testid="badge-shared-readonly"
                    title={
                      currentLayout?.ownerName
                        ? `Shared by ${currentLayout.ownerName}`
                        : "Shared with you"
                    }
                  >
                    <Lock size={12} />
                    View only
                    {currentLayout?.ownerName ? ` · ${currentLayout.ownerName}` : ""}
                  </span>
                )}

                {/* Layout type selector (editing only) */}
                {!isShared && (
                  <LayoutPicker value={layoutType} onChange={changeLayoutType} />
                )}

                {/* Saved layouts */}
                <Select
                  value={currentLayoutId ?? ""}
                  onValueChange={(id) => {
                    const layout = layouts.find((l) => l.id === id);
                    if (layout) applyLayout(layout);
                  }}
                >
                  <SelectTrigger
                    className="h-9 w-40"
                    data-testid="select-saved-layout"
                  >
                    <SelectValue placeholder="Saved layouts" />
                  </SelectTrigger>
                  <SelectContent>
                    {layouts.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No saved layouts
                      </div>
                    ) : (
                      layouts.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.isDefault ? "★ " : ""}
                          {l.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {/* Pop out the saved layout into its own chrome-less window */}
                {currentLayoutId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="touch-area"
                    onClick={() => {
                      const w = Math.min(window.screen.availWidth, 1600);
                      const h = Math.min(window.screen.availHeight, 900);
                      const left = window.screen.availWidth / 2 - w / 2;
                      const top = window.screen.availHeight / 2 - h / 2;
                      window.open(
                        `/multiviewer/view/${currentLayoutId}`,
                        `obtv-wall-${currentLayoutId}`,
                        `popup=yes,noopener,noreferrer,width=${w},height=${h},left=${left},top=${top}`
                      );
                    }}
                    disabled={isDirty}
                    title={
                      isDirty
                        ? "Save your changes first to open this layout in a new window"
                        : "Open this layout in its own window"
                    }
                    data-testid="button-popout-layout"
                  >
                    <ExternalLink size={16} className="mr-1" />
                    Pop out
                  </Button>
                )}

                {/* Editing controls are hidden for read-only shared layouts */}
                {!isShared && (
                  <>
                    {/* Edit toggle */}
                    <Button
                      variant={editMode ? "default" : "secondary"}
                      size="sm"
                      className="touch-area"
                      onClick={() => setEditMode((v) => !v)}
                      data-testid="button-edit-mode"
                    >
                      {editMode ? <Eye size={16} className="mr-1" /> : <Pencil size={16} className="mr-1" />}
                      {editMode ? "Done" : "Edit"}
                    </Button>

                    {/* Save / update */}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="touch-area"
                      onClick={handleSaveClick}
                      disabled={saveMutation.isPending || updateMutation.isPending}
                      data-testid="button-save-layout"
                    >
                      <Save size={16} className="mr-1" />
                      {currentLayoutId ? "Update" : "Save"}
                    </Button>

                    {isDirty && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="touch-area text-muted-foreground"
                        onClick={discardChanges}
                        data-testid="button-discard-changes"
                      >
                        Discard
                      </Button>
                    )}

                    {currentLayoutId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="touch-area"
                        onClick={() => {
                          setLayoutName("");
                          setSaveDialogOpen(true);
                        }}
                        data-testid="button-save-as"
                      >
                        Save as
                      </Button>
                    )}

                    {currentLayout && (
                      <>
                        {/* Share this owned layout (public link + people/groups) */}
                        <Button
                          variant="secondary"
                          size="sm"
                          className="touch-area"
                          onClick={() => setShareDialogOpen(true)}
                          data-testid="button-share-layout"
                        >
                          <Share2 size={16} className="mr-1" />
                          Share
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="touch-area"
                          onClick={() => setDefaultMutation.mutate(currentLayout.id)}
                          disabled={currentLayout.isDefault || setDefaultMutation.isPending}
                          title="Set as default"
                          data-testid="button-set-default"
                        >
                          <Star
                            size={16}
                            className={currentLayout.isDefault ? "fill-yellow-400 text-yellow-400" : ""}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="touch-area text-destructive"
                          onClick={() => deleteMutation.mutate(currentLayout.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete layout"
                          data-testid="button-delete-layout"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Grid / solo content */}
          <div className="flex-1 p-2 lg:p-3 min-h-0">
            {studios.length === 0 && assignedStreams.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Monitor size={40} className="mb-3 opacity-60" />
                <p>No studios available.</p>
              </div>
            ) : soloStreamId && soloIndex !== -1 ? (
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
            ) : (
              <MultiviewerGrid
                type={layoutType}
                renderCell={(i, big) => renderTile(i, big)}
              />
            )}
          </div>
        </main>
      </div>

        <DragOverlay dropAnimation={null}>
          {activeStream ? (
            <div className="flex items-center gap-2 rounded-lg border-2 border-primary bg-black/90 px-3 py-2 text-sm font-semibold text-white shadow-2xl">
              <span className="truncate max-w-[160px]">{activeStream.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Share dialog (owned saved layouts only) */}
      {currentLayout && !isShared && (
        <MultiviewerShareDialog
          layoutId={currentLayout.id}
          layoutName={currentLayout.name}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      )}

      {/* Save dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save layout</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Layout name"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            data-testid="input-layout-name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && layoutName.trim()) {
                saveMutation.mutate({
                  name: layoutName.trim(),
                  layoutType,
                  slots,
                });
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSaveDialogOpen(false)}
              data-testid="button-cancel-save"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                saveMutation.mutate({
                  name: layoutName.trim(),
                  layoutType,
                  slots,
                })
              }
              disabled={!layoutName.trim() || saveMutation.isPending}
              data-testid="button-confirm-save"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
