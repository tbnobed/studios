import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus,
  Menu,
  Monitor,
  Pencil,
  Play,
  Star,
  Lock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import StudioSidebar from "@/components/StudioSidebar";
import { getLayoutDef, slotCount } from "@/lib/multiviewerLayouts";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/authUtils";
import type {
  MultiviewerLayoutWithMeta,
  MultiviewerLayoutType,
} from "@shared/schema";

// A small static schematic of a layout, with filled slots highlighted.
function LayoutThumb({
  type,
  slots,
}: {
  type: MultiviewerLayoutType;
  slots: (string | null)[];
}) {
  const def = getLayoutDef(type);
  return (
    <div
      className="grid gap-0.5 w-full aspect-video"
      style={{
        gridTemplateColumns: `repeat(${def.cols}, 1fr)`,
        gridTemplateRows: `repeat(${def.rows}, 1fr)`,
      }}
    >
      {def.cells.map((c, i) => (
        <div
          key={i}
          className={`rounded-[2px] ${
            slots[i] ? "bg-primary/70" : "bg-muted-foreground/20"
          }`}
          style={{
            gridColumn: `${c.c} / span ${c.cs}`,
            gridRow: `${c.r} / span ${c.rs}`,
          }}
        />
      ))}
    </div>
  );
}

export default function MultiviewerLanding() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: layoutsData, isLoading } = useQuery<MultiviewerLayoutWithMeta[]>({
    queryKey: ["/api/multiviewer-layouts"],
    meta: { headers: getAuthHeaders() },
  });
  const layouts = useMemo(() => layoutsData ?? [], [layoutsData]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/multiviewer-layouts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/multiviewer-layouts"] });
      toast({ title: "Multiviewer deleted" });
    },
    onError: () =>
      toast({
        title: "Could not delete multiviewer",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-gradient-to-br from-gray-900 via-slate-800 to-black">
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
                  <h2
                    className="text-xl font-bold"
                    data-testid="multiviewer-title"
                  >
                    Multiviewers
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {layouts.length === 0
                      ? "Saved layouts appear here"
                      : `${layouts.length} saved ${
                          layouts.length === 1 ? "layout" : "layouts"
                        }`}
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                className="touch-area"
                onClick={() => navigate("/multiviewer/new")}
                data-testid="button-create-multiviewer"
              >
                <Plus size={16} className="mr-1" />
                Create
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div className="aspect-video bg-muted/40 animate-pulse" />
                    <div className="p-3 space-y-2">
                      <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
                      <div className="h-3 w-1/3 rounded bg-muted/40 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : layouts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                <Monitor size={48} className="mb-4 opacity-60" />
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  No multiviewers yet
                </h3>
                <p className="max-w-sm mb-4">
                  Create a multiviewer to arrange several studio streams into a
                  single wall you can launch any time.
                </p>
                <Button
                  onClick={() => navigate("/multiviewer/new")}
                  data-testid="button-create-multiviewer-empty"
                >
                  <Plus size={16} className="mr-1" />
                  Create your first multiviewer
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {layouts.map((layout) => {
                  const type = layout.layoutType as MultiviewerLayoutType;
                  const total = slotCount(type);
                  const filled = (layout.slots ?? []).filter(Boolean).length;
                  const isShared = Boolean(layout.shared);
                  return (
                    <div
                      key={layout.id}
                      className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition"
                      data-testid={`card-multiviewer-${layout.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/multiviewer/${layout.id}`)}
                        className="block w-full text-left"
                        data-testid={`button-launch-${layout.id}`}
                      >
                        <div className="relative p-3 bg-black/40">
                          <LayoutThumb type={type} slots={layout.slots ?? []} />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition">
                            <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground opacity-0 group-hover:opacity-100 transition shadow-lg">
                              <Play size={15} className="fill-current" />
                              Launch
                            </span>
                          </div>
                        </div>
                        <div className="px-3 pt-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate flex-1">
                              {layout.name}
                            </h3>
                            {layout.isDefault && (
                              <Star
                                size={14}
                                className="fill-yellow-400 text-yellow-400 shrink-0"
                              />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {getLayoutDef(type).label} · {filled}/{total} sources
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 px-3 py-3">
                        {isShared ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                            title={
                              layout.ownerName
                                ? `Shared by ${layout.ownerName}`
                                : "Shared with you"
                            }
                            data-testid={`badge-shared-${layout.id}`}
                          >
                            <Lock size={12} />
                            View only
                            {layout.ownerName ? ` · ${layout.ownerName}` : ""}
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="touch-area"
                              onClick={() =>
                                navigate(`/multiviewer/${layout.id}/edit`)
                              }
                              data-testid={`button-edit-${layout.id}`}
                            >
                              <Pencil size={14} className="mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="touch-area text-destructive ml-auto"
                              onClick={() => deleteMutation.mutate(layout.id)}
                              disabled={deleteMutation.isPending}
                              title="Delete multiviewer"
                              data-testid={`button-delete-${layout.id}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
