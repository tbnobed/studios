import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  X,
  Grid3X3,
  Move,
  Menu,
  Maximize,
} from "lucide-react";
import StudioSidebar from "@/components/StudioSidebar";
import { StreamPlayer } from "@/components/StreamPlayer";
import { StreamSingleView } from "@/components/StreamSingleView";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/authUtils";
import type { FavoriteWithStream, Stream } from "@shared/schema";

const FAVORITES_PER_PAGE = 8;
const FAVORITES_MAX_PAGES = 5;

type Mode = "view" | "arrange";

function SortableFavorite({
  favorite,
  onRemove,
  isRemoving,
}: {
  favorite: FavoriteWithStream;
  onRemove: (streamId: string) => void;
  isRemoving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: favorite.streamId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="overflow-hidden border-border/60"
      data-testid={`arrange-favorite-${favorite.streamId}`}
    >
      <div className="relative bg-muted aspect-video flex items-center justify-center">
        <div className="text-center px-2">
          <p className="text-xs text-muted-foreground">
            {favorite.stream.studio?.name}
          </p>
        </div>
        <button
          {...attributes}
          {...listeners}
          className="absolute inset-0 cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors touch-none"
          data-testid={`drag-handle-${favorite.streamId}`}
          aria-label="Drag to reorder"
        >
          <GripVertical className="text-white/80" size={24} />
        </button>
        <Button
          variant="destructive"
          size="sm"
          className="absolute top-1 right-1 h-7 w-7 p-0"
          onClick={() => onRemove(favorite.streamId)}
          disabled={isRemoving}
          data-testid={`button-remove-favorite-${favorite.streamId}`}
          aria-label="Remove favorite"
        >
          <X size={14} />
        </Button>
      </div>
      <CardContent className="p-2">
        <h4 className="font-medium text-xs truncate" title={favorite.stream.name}>
          {favorite.stream.name}
        </h4>
      </CardContent>
    </Card>
  );
}

export default function Favorites() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("view");
  const [currentPage, setCurrentPage] = useState(0);
  const [order, setOrder] = useState<FavoriteWithStream[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [singleViewIndex, setSingleViewIndex] = useState<number | null>(null);
  const [streamStatuses, setStreamStatuses] = useState<
    Record<string, "online" | "offline" | "error">
  >({});

  const getStreamStatus = (stream: Stream) => {
    return streamStatuses[stream.id] || stream.status;
  };

  const handleStreamStatusChange = (
    streamId: string,
    status: "online" | "offline" | "error"
  ) => {
    setStreamStatuses((prev) => ({ ...prev, [streamId]: status }));
  };

  const { data, isLoading } = useQuery<FavoriteWithStream[]>({
    queryKey: ["/api/favorites"],
    meta: { headers: getAuthHeaders() },
  });
  // Stable reference so the effect below only runs when the data actually
  // changes. Using `data ?? []` inline would create a new array every render,
  // causing an infinite setState loop that tears down the stream players.
  const favorites = useMemo(() => data ?? [], [data]);

  // Keep the local arrange order in sync with the server data.
  useEffect(() => {
    setOrder(favorites);
  }, [favorites]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const reorderMutation = useMutation({
    mutationFn: async (items: FavoriteWithStream[]) => {
      const payload = items.map((fav, idx) => ({
        streamId: fav.streamId,
        page: Math.floor(idx / FAVORITES_PER_PAGE) + 1,
        position: idx % FAVORITES_PER_PAGE,
      }));
      const res = await apiRequest("PUT", "/api/favorites/reorder", {
        items: payload,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
      toast({ title: "Order saved" });
    },
    onError: () => {
      toast({
        title: "Could not save order",
        description: "Please try again.",
        variant: "destructive",
      });
      setOrder(favorites);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (streamId: string) => {
      await apiRequest("DELETE", `/api/favorites/${streamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
    onError: () => {
      toast({
        title: "Could not remove favorite",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((items) => {
      const oldIndex = items.findIndex((i) => i.streamId === active.id);
      const newIndex = items.findIndex((i) => i.streamId === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      const next = arrayMove(items, oldIndex, newIndex);
      reorderMutation.mutate(next);
      return next;
    });
  };

  // View mode pagination.
  const totalPages = Math.max(
    1,
    Math.min(FAVORITES_MAX_PAGES, Math.ceil(favorites.length / FAVORITES_PER_PAGE))
  );
  const pageStreams = useMemo(() => {
    const start = currentPage * FAVORITES_PER_PAGE;
    return favorites.slice(start, start + FAVORITES_PER_PAGE);
  }, [favorites, currentPage]);
  const favoriteStreams = useMemo(
    () => favorites.map((f) => f.stream),
    [favorites]
  );

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  useEffect(() => {
    if (singleViewIndex !== null && !favorites[singleViewIndex]) {
      setSingleViewIndex(null);
    }
  }, [favorites, singleViewIndex]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-slate-800 to-black">
      <div className="flex-1 flex md:pt-0 relative z-10 overflow-hidden md:overflow-visible md:min-h-0">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <StudioSidebar activeFavorites />
        </div>

        {/* Main Content */}
        <main className="flex-1 relative">
          {/* Favorites Header (matches studio header) */}
          <div className="bg-card border-b border-border px-4 lg:px-6 py-4 studio-header" style={{ marginTop: 'env(safe-area-inset-top)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* Mobile Menu */}
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
                      activeFavorites
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
                <div>
                  <h2 className="text-xl font-bold" data-testid="favorites-title">
                    Favorites
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {favorites.length} streams available
                  </p>
                </div>
              </div>
              {favorites.length > 0 && (
                <div className="flex items-center space-x-3">
                  {/* View Mode Toggle */}
                  <div className="flex bg-muted rounded-lg p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`touch-area ${mode === "view" && singleViewIndex === null ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => {
                        setMode("view");
                        setSingleViewIndex(null);
                      }}
                      data-testid="button-grid-view"
                    >
                      <Grid3X3 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`hidden md:block touch-area ${singleViewIndex !== null ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => {
                        setMode("view");
                        setSingleViewIndex((idx) => (idx === null ? 0 : idx));
                      }}
                      data-testid="button-single-view"
                    >
                      <Maximize size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`touch-area ${mode === "arrange" ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => {
                        setSingleViewIndex(null);
                        setMode("arrange");
                      }}
                      data-testid="button-mode-arrange"
                    >
                      <Move size={16} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Video Content */}
          <div className="flex-1 md:p-2 overflow-hidden md:overflow-visible md:h-auto">
          {/* Loading */}
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground">
              Loading favorites...
            </div>
          ) : favorites.length === 0 ? (
            // Empty state
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 bg-muted rounded-2xl flex items-center justify-center">
                <Heart className="text-muted-foreground" size={40} />
              </div>
              <h3 className="text-xl font-semibold mb-2">No favorites yet</h3>
              <p className="text-muted-foreground mb-6">
                Tap the heart on any stream to add it here.
              </p>
              <Button onClick={() => setLocation("/dashboard")} data-testid="button-browse-streams">
                Browse streams
              </Button>
            </div>
          ) : mode === "arrange" ? (
            // Arrange mode (drag-and-drop)
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Drag streams to reorder. They fill {FAVORITES_PER_PAGE} per page,
                up to {FAVORITES_MAX_PAGES} pages.
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={order.map((f) => f.streamId)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {order.map((favorite) => (
                      <SortableFavorite
                        key={favorite.streamId}
                        favorite={favorite}
                        onRemove={(id) => removeMutation.mutate(id)}
                        isRemoving={removeMutation.isPending}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ) : singleViewIndex !== null && favorites[singleViewIndex] ? (
            // Single View Mode (identical to studio tabs)
            // Bound to the viewport so the expanded player fits the screen
            // (the player letterboxes via object-contain instead of overflowing).
            <div className="h-[calc(100dvh-6.5rem)]">
            <StreamSingleView
              streams={favoriteStreams}
              currentIndex={singleViewIndex}
              onNext={() =>
                setSingleViewIndex((idx) =>
                  idx === null ? idx : (idx + 1) % favorites.length
                )
              }
              onPrevious={() =>
                setSingleViewIndex((idx) =>
                  idx === null
                    ? idx
                    : (idx - 1 + favorites.length) % favorites.length
                )
              }
              onExit={() => setSingleViewIndex(null)}
              onStatusChange={handleStreamStatusChange}
            />
            </div>
          ) : (
            // View mode (paged live players)
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {pageStreams.map((favorite, i) => {
                  const globalIdx = currentPage * FAVORITES_PER_PAGE + i;
                  const stream = favorite.stream;
                  return (
                  <Card
                    key={favorite.streamId}
                    className="overflow-hidden hover:border-accent transition-colors"
                    data-testid={`favorite-${favorite.streamId}`}
                  >
                    <div className="video-container relative">
                      <StreamPlayer
                        stream={stream}
                        className="w-full h-full"
                        controls={true}
                        autoPlay={true}
                        onStatusChange={(status) => handleStreamStatusChange(stream.id, status)}
                      />
                      <div className="absolute top-2 right-2 flex items-center space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-black/60 hover:bg-black/80 text-white touch-area"
                          onClick={() => removeMutation.mutate(stream.id)}
                          disabled={removeMutation.isPending}
                          data-testid={`button-favorite-${stream.id}`}
                          aria-label="Remove from favorites"
                        >
                          <Heart size={12} className="fill-red-500 text-red-500" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-black/60 hover:bg-black/80 text-white touch-area"
                          onClick={() => setSingleViewIndex(globalIdx)}
                          data-testid={`button-fullscreen-${stream.id}`}
                          aria-label="View fullscreen"
                        >
                          <Maximize size={12} />
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <h4 className="font-medium text-sm" data-testid={`stream-name-${stream.id}`}>
                        {stream.name}
                      </h4>
                      <div className="flex items-center justify-between mt-2">
                        <span className="hidden md:block text-xs text-muted-foreground">
                          {stream.resolution}
                        </span>
                        <div className="flex items-center space-x-1 md:ml-auto">
                          <div className={`w-1 h-1 rounded-full ${
                            getStreamStatus(stream) === 'online' ? 'bg-green-500' :
                            getStreamStatus(stream) === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                          }`}></div>
                          <span className={`text-xs font-medium capitalize ${
                            getStreamStatus(stream) === 'online' ? 'text-green-500' :
                            getStreamStatus(stream) === 'error' ? 'text-red-500' : 'text-yellow-500'
                          }`}>
                            {getStreamStatus(stream)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    data-testid="button-next-page"
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
