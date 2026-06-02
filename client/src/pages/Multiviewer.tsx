import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  PictureInPicture2,
  Save,
  Trash2,
  Star,
  Pencil,
  Eye,
  Menu,
  Monitor,
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
import StudioSidebar from "@/components/StudioSidebar";
import { MultiviewerTile } from "@/components/MultiviewerTile";
import { StreamSingleView } from "@/components/StreamSingleView";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/authUtils";
import type {
  MultiviewerLayout,
  MultiviewerLayoutType,
  Stream,
  StudioWithStreams,
} from "@shared/schema";

type TileStream = Stream & { studio?: { id: string; name: string } };

const LAYOUTS: {
  type: MultiviewerLayoutType;
  label: string;
  slots: number;
  icon: typeof Grid2x2;
}[] = [
  { type: "2x2", label: "2 × 2", slots: 4, icon: Grid2x2 },
  { type: "3x3", label: "3 × 3", slots: 9, icon: Grid3x3 },
  { type: "4x4", label: "4 × 4", slots: 16, icon: LayoutGrid },
  { type: "featured", label: "Featured", slots: 7, icon: PictureInPicture2 },
];

function slotCount(type: MultiviewerLayoutType): number {
  return LAYOUTS.find((l) => l.type === type)?.slots ?? 4;
}

// Resize a slots array to `count`, preserving existing assignments.
function fitSlots(slots: (string | null)[], count: number): (string | null)[] {
  const next = slots.slice(0, count);
  while (next.length < count) next.push(null);
  return next;
}

export default function Multiviewer() {
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [layoutType, setLayoutType] = useState<MultiviewerLayoutType>("2x2");
  const [slots, setSlots] = useState<(string | null)[]>(() => fitSlots([], 4));
  const [editMode, setEditMode] = useState(false);
  const [currentLayoutId, setCurrentLayoutId] = useState<string | null>(null);
  const [soloStreamId, setSoloStreamId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const appliedDefaultRef = useRef(false);

  const { data: studiosData } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    meta: { headers: getAuthHeaders() },
  });
  const studios = useMemo(() => studiosData ?? [], [studiosData]);

  const { data: layoutsData } = useQuery<MultiviewerLayout[]>({
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
    return map;
  }, [studios]);

  // Auto-load the user's default layout once, on first arrival.
  useEffect(() => {
    if (appliedDefaultRef.current || layouts.length === 0) return;
    const def = layouts.find((l) => l.isDefault);
    if (def) {
      applyLayout(def);
    }
    appliedDefaultRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts]);

  const applyLayout = (layout: MultiviewerLayout) => {
    const type = layout.layoutType as MultiviewerLayoutType;
    setLayoutType(type);
    setSlots(fitSlots(layout.slots ?? [], slotCount(type)));
    setCurrentLayoutId(layout.id);
    setEditMode(false);
  };

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
    onSuccess: (layout) => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
      setCurrentLayoutId(layout.id);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
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
      if (currentLayoutId === id) setCurrentLayoutId(null);
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
    return (
      <MultiviewerTile
        key={index}
        stream={stream}
        editMode={editMode}
        studios={studios}
        usedStreamIds={usedStreamIds}
        onAssign={(streamId) => assignSlot(index, streamId)}
        onSolo={() => id && setSoloStreamId(id)}
        featured={featured}
      />
    );
  };

  const gridClass =
    layoutType === "2x2"
      ? "grid grid-cols-2 grid-rows-2 gap-2"
      : layoutType === "3x3"
        ? "grid grid-cols-3 grid-rows-3 gap-2"
        : "grid grid-cols-4 grid-rows-4 gap-2";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-slate-800 to-black">
      <div className="flex-1 flex relative z-10 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <StudioSidebar activeMultiviewer />
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
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
                <div>
                  <h2 className="text-xl font-bold" data-testid="multiviewer-title">
                    Multiviewer
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {assignedStreams.length} of {slots.length} sources
                    {currentLayout ? ` · ${currentLayout.name}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Layout type selector */}
                <div className="flex bg-muted rounded-lg p-1">
                  {LAYOUTS.map(({ type, label, icon: Icon }) => (
                    <Button
                      key={type}
                      variant="ghost"
                      size="sm"
                      className={`touch-area px-2 ${
                        layoutType === type ? "bg-primary text-primary-foreground" : ""
                      }`}
                      onClick={() => changeLayoutType(type)}
                      data-testid={`button-layout-${type}`}
                      title={label}
                    >
                      <Icon size={16} />
                    </Button>
                  ))}
                </div>

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
              </div>
            </div>
          </div>

          {/* Grid / solo content */}
          <div className="flex-1 p-2 lg:p-3 min-h-0">
            {studios.length === 0 ? (
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
            ) : layoutType === "featured" ? (
              <div className="h-full flex flex-col gap-2">
                <div className="flex-[3] min-h-0">{renderTile(0, true)}</div>
                <div className="flex-1 min-h-0 grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {Array.from({ length: 6 }, (_, i) => renderTile(i + 1))}
                </div>
              </div>
            ) : (
              <div className={`h-full ${gridClass}`}>
                {Array.from({ length: slotCount(layoutType) }, (_, i) =>
                  renderTile(i)
                )}
              </div>
            )}
          </div>
        </main>
      </div>

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
