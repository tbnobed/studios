import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useDraggable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Settings,
  Monitor,
  Video,
  Heart,
  LayoutGrid,
  User,
  Shield,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getAuthHeaders, removeAuthToken } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { StudioWithStreams, Stream } from "@shared/schema";
import tbnLogo from "@/assets/tbnlogo-white_1756354700943.png";
import obLogo from "@/assets/ob-logo.png";

function hexToRgba(hex: string | null | undefined, alpha: number): string {
  const fallback = "#64748b"; // slate-500
  let h = (hex || fallback).replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    h = fallback.replace("#", "");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface StudioSidebarProps {
  selectedStudioId?: string | null;
  onSelectStudio?: (studio: StudioWithStreams) => void;
  activeFavorites?: boolean;
  activeMultiviewer?: boolean;
  /** When true, studio cards expand to reveal sources that can be dragged onto tiles. */
  sourceDragEnabled?: boolean;
  /** Multiviewer only: clicking a studio loads all of its feeds into the grid. */
  onLoadStudio?: (studio: StudioWithStreams) => void;
  onNavigate?: () => void;
}

export default function StudioSidebar({
  selectedStudioId,
  onSelectStudio,
  activeFavorites,
  activeMultiviewer,
  sourceDragEnabled,
  onLoadStudio,
  onNavigate,
}: StudioSidebarProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [expandedStudioId, setExpandedStudioId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const { data: studios = [] } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    meta: {
      headers: getAuthHeaders(),
    },
  });

  const handleStudioClick = (studio: StudioWithStreams) => {
    if (onSelectStudio) {
      onSelectStudio(studio);
    } else {
      setLocation(`/dashboard?studio=${studio.id}`);
    }
    onNavigate?.();
  };

  const handleNav = (path: string) => {
    setLocation(path);
    onNavigate?.();
  };

  const handleLogout = () => {
    removeAuthToken();
    toast({
      title: "Signed Out",
      description: "You have been successfully signed out",
    });
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  };

  return (
    <div
      className={`${sidebarCollapsed ? "w-20" : "w-64"} h-full bg-card/50 backdrop-blur border-r border-border/40 transition-all duration-300 flex flex-col`}
    >
      {/* TBN Logo */}
      <div className="px-3 py-4 border-b border-border/30 flex items-center justify-center shrink-0">
        <button
          onClick={() => handleNav("/dashboard")}
          className="hover:opacity-80 transition-opacity cursor-pointer"
          data-testid="link-home"
        >
          <img
            src={tbnLogo}
            alt="TBN Studios Logo"
            className={`${sidebarCollapsed ? "h-8" : "h-14"} w-auto opacity-75`}
          />
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          {!sidebarCollapsed && (
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] opacity-60">
              Studios
            </h2>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="touch-area h-6 w-6 p-0 opacity-50 hover:opacity-100 transition-opacity"
            onClick={toggleCollapsed}
            data-testid="button-toggle-sidebar"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </Button>
        </div>

        <div className="space-y-2">
          {studios.map((studio) => {
            // In multiviewer edit mode the cards expand to show draggable
            // sources. Outside edit mode a click loads the studio's feeds.
            const expandable =
              Boolean(activeMultiviewer) &&
              !sidebarCollapsed &&
              Boolean(sourceDragEnabled);
            const expanded = expandable && expandedStudioId === studio.id;
            const handleCardClick = () => {
              // Multiviewer edit mode: cards manage drag sources, never load.
              if (activeMultiviewer && sourceDragEnabled) {
                if (!sidebarCollapsed) {
                  setExpandedStudioId((prev) =>
                    prev === studio.id ? null : studio.id
                  );
                }
                return;
              }
              // Multiviewer view mode: clicking loads the studio's feeds.
              if (activeMultiviewer && onLoadStudio) {
                onLoadStudio(studio);
                onNavigate?.();
                return;
              }
              handleStudioClick(studio);
            };
            return (
            <div key={studio.id}>
            <button
              className={`w-full ${sidebarCollapsed ? "p-3 h-12 justify-center" : "p-4 h-16 justify-between"} 
                group relative overflow-hidden rounded-xl border transition-all duration-200 
                text-left flex items-center touch-area transform hover:scale-[1.02] backdrop-blur ${
                  selectedStudioId === studio.id ? "shadow-md" : "hover:shadow-sm"
                }`}
              style={
                selectedStudioId === studio.id
                  ? {
                      backgroundColor: hexToRgba(studio.colorCode, 0.18),
                      borderColor: hexToRgba(studio.colorCode, 0.55),
                      boxShadow: `0 1px 8px ${hexToRgba(studio.colorCode, 0.25)}`,
                    }
                  : {
                      backgroundColor: hexToRgba(studio.colorCode, 0.07),
                      borderColor: hexToRgba(studio.colorCode, 0.18),
                    }
              }
              onClick={handleCardClick}
              data-testid={`studio-card-${studio.name.toLowerCase()}`}
              title={
                sidebarCollapsed
                  ? `${studio.name} - ${studio.streams.length} streams available`
                  : undefined
              }
            >
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center space-y-1">
                  <span
                    className={`text-sm font-medium transition-colors duration-200 ${
                      selectedStudioId === studio.id ? "text-primary" : "opacity-80"
                    }`}
                  >
                    {studio.name.charAt(0)}
                  </span>
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                      selectedStudioId === studio.id ? "bg-primary" : "bg-green-400"
                    }`}
                  ></div>
                </div>
              ) : (
                <>
                  <div className="text-left flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate">{studio.name}</h3>
                    <p className="text-xs text-muted-foreground opacity-70">
                      {studio.streams.length} streams
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    {expandable ? (
                      <ChevronRight
                        size={16}
                        className={`opacity-60 transition-transform duration-200 ${
                          expanded ? "rotate-90" : ""
                        }`}
                      />
                    ) : (
                      <>
                        <div
                          className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                            selectedStudioId === studio.id ? "bg-primary" : "bg-green-400"
                          }`}
                        ></div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 ${
                            selectedStudioId === studio.id ? "text-orange-300" : "opacity-60"
                          }`}
                        >
                          {selectedStudioId === studio.id ? "Selected" : "Live"}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}
            </button>
            {expanded && (
              <div className="mt-1 space-y-1 pl-2" data-testid={`studio-sources-${studio.id}`}>
                {studio.streams.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground opacity-60">
                    No sources
                  </p>
                ) : (
                  studio.streams.map((stream) => (
                    <DraggableSource
                      key={stream.id}
                      stream={stream}
                      colorCode={studio.colorCode}
                      enabled={Boolean(sourceDragEnabled)}
                    />
                  ))
                )}
              </div>
            )}
            </div>
            );
          })}
        </div>

        {/* Favorites + Multiviewer Links */}
        <div className="border-t border-border/30 mt-8 pt-6 space-y-2">
          <button
            className={`w-full ${sidebarCollapsed ? "p-3 h-12 justify-center" : "p-3 h-12 justify-start"}
              group relative overflow-hidden rounded-lg border transition-all duration-200 hover:shadow-sm
              bg-gradient-to-r from-red-500/25 to-red-400/15 backdrop-blur
              hover:from-red-500/35 hover:to-red-400/25
              text-left flex items-center touch-area ${
                activeFavorites ? "border-red-400/60 shadow-sm" : "border-border/20 hover:border-border/40"
              }`}
            onClick={() => handleNav("/favorites")}
            data-testid="button-nav-favorites"
            title={sidebarCollapsed ? "Favorites" : undefined}
          >
            <Heart
              className={sidebarCollapsed ? "" : "mr-3"}
              size={14}
              opacity={activeFavorites ? 1 : 0.7}
              fill={activeFavorites ? "currentColor" : "none"}
            />
            {!sidebarCollapsed && (
              <span className="text-xs font-medium opacity-80">Favorites</span>
            )}
          </button>

          <button
            className={`w-full ${sidebarCollapsed ? "p-3 h-12 justify-center" : "p-3 h-12 justify-start"}
              group relative overflow-hidden rounded-lg border transition-all duration-200 hover:shadow-sm
              bg-gradient-to-r from-sky-500/25 to-sky-400/15 backdrop-blur
              hover:from-sky-500/35 hover:to-sky-400/25
              text-left flex items-center touch-area ${
                activeMultiviewer ? "border-sky-400/60 shadow-sm" : "border-border/20 hover:border-border/40"
              }`}
            onClick={() => handleNav("/multiviewer")}
            data-testid="button-nav-multiviewer"
            title={sidebarCollapsed ? "Multiviewer" : undefined}
          >
            <LayoutGrid
              className={sidebarCollapsed ? "" : "mr-3"}
              size={14}
              opacity={activeMultiviewer ? 1 : 0.7}
            />
            {!sidebarCollapsed && (
              <span className="text-xs font-medium opacity-80">Multiviewer</span>
            )}
          </button>
        </div>

        {/* Admin Section */}
        {user?.role === "admin" && (
          <div className="border-t border-border/30 mt-8 pt-6">
            {!sidebarCollapsed && (
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] opacity-60 mb-4">
                Admin
              </h3>
            )}
            <div className="space-y-2">
              <button
                className={`w-full ${sidebarCollapsed ? "p-3 h-12 justify-center" : "p-3 h-12 justify-start"}
                  group relative overflow-hidden rounded-lg border border-border/20 hover:border-border/40
                  bg-gradient-to-r from-emerald-500/25 to-emerald-400/15 backdrop-blur
                  hover:from-emerald-500/35 hover:to-emerald-400/25 
                  transition-all duration-200 hover:shadow-sm
                  text-left flex items-center touch-area`}
                onClick={() => (window.location.href = "/admin")}
                data-testid="button-manage-users"
                title={sidebarCollapsed ? "Manage Users" : undefined}
              >
                <Settings className={sidebarCollapsed ? "" : "mr-3"} size={14} opacity={0.7} />
                {!sidebarCollapsed && (
                  <span className="text-xs font-medium opacity-80">Manage Users</span>
                )}
              </button>
              <button
                className={`w-full ${sidebarCollapsed ? "p-3 h-12 justify-center" : "p-3 h-12 justify-start"}
                  group relative overflow-hidden rounded-lg border border-border/20 hover:border-border/40
                  bg-gradient-to-r from-blue-500/25 to-blue-400/15 backdrop-blur
                  hover:from-blue-500/35 hover:to-blue-400/25 
                  transition-all duration-200 hover:shadow-sm
                  text-left flex items-center touch-area`}
                onClick={() => (window.location.href = "/admin?tab=studios")}
                data-testid="button-manage-studios"
                title={sidebarCollapsed ? "Manage Studios" : undefined}
              >
                <Monitor className={sidebarCollapsed ? "" : "mr-3"} size={14} opacity={0.7} />
                {!sidebarCollapsed && (
                  <span className="text-xs font-medium opacity-80">Manage Studios</span>
                )}
              </button>
              <button
                className={`w-full ${sidebarCollapsed ? "p-3 h-12 justify-center" : "p-3 h-12 justify-start"}
                  group relative overflow-hidden rounded-lg border border-border/20 hover:border-border/40
                  bg-gradient-to-r from-purple-500/25 to-purple-400/15 backdrop-blur
                  hover:from-purple-500/35 hover:to-purple-400/25 
                  transition-all duration-200 hover:shadow-sm
                  text-left flex items-center touch-area`}
                onClick={() => (window.location.href = "/admin?tab=streams")}
                data-testid="button-manage-streams"
                title={sidebarCollapsed ? "Manage Streams" : undefined}
              >
                <Video className={sidebarCollapsed ? "" : "mr-3"} size={14} opacity={0.7} />
                {!sidebarCollapsed && (
                  <span className="text-xs font-medium opacity-80">Manage Streams</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* OB Logo Footer */}
      <div className="p-4">
        <div className="flex items-center justify-center">
          <img
            src={obLogo}
            alt="OB Logo"
            className={`${sidebarCollapsed ? "w-12 h-12" : "w-24 h-24"} opacity-75`}
          />
        </div>
      </div>

      {/* User Menu */}
      <div className="p-3 shrink-0 relative">
        {userMenuOpen && (
          <Card className="absolute bottom-full left-3 w-56 mb-2 z-[60] shadow-xl">
            <CardContent className="p-2">
              <div className="px-3 py-2 border-b border-border">
                <p className="font-medium text-sm truncate">{user?.username}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              {user?.role === "admin" && (
                <button
                  className="w-full flex items-center justify-start px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                  onClick={() => {
                    setUserMenuOpen(false);
                    window.location.href = "/admin";
                  }}
                  data-testid="button-admin"
                >
                  <Shield className="mr-2" size={16} />
                  Admin Panel
                </button>
              )}
              <button
                className="w-full flex items-center justify-start px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                onClick={() => {
                  setUserMenuOpen(false);
                  handleNav("/settings");
                }}
                data-testid="button-settings"
              >
                <Settings className="mr-2" size={16} />
                Settings
              </button>
              <button
                className="w-full flex items-center justify-start px-2 py-2 text-sm text-destructive hover:bg-accent rounded-md transition-colors"
                onClick={() => {
                  setUserMenuOpen(false);
                  handleLogout();
                }}
                data-testid="button-logout"
              >
                <LogOut className="mr-2" size={16} />
                Sign Out
              </button>
            </CardContent>
          </Card>
        )}
        <button
          className={`w-full flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} rounded-lg p-2 hover:bg-accent transition-colors touch-area`}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          data-testid="button-user-menu"
          title={sidebarCollapsed ? user?.username ?? "Account" : undefined}
        >
          {!sidebarCollapsed && (
            <span className="text-sm font-medium truncate">
              {user?.firstName || user?.lastName
                ? `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()
                : user?.username}
            </span>
          )}
          <User size={18} className="shrink-0" />
        </button>
      </div>
    </div>
  );
}

/** Shared id namespace so a dragged sidebar source is distinguishable from a tile. */
export const sourceDndId = (streamId: string) => `source-${streamId}`;

function DraggableSource({
  stream,
  colorCode,
  enabled,
}: {
  stream: Stream;
  colorCode: string | null | undefined;
  enabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sourceDndId(stream.id),
    disabled: !enabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
        enabled ? "cursor-grab touch-none active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-40" : ""}`}
      style={{
        backgroundColor: hexToRgba(colorCode, 0.08),
        borderColor: hexToRgba(colorCode, 0.2),
      }}
      data-testid={`sidebar-source-${stream.id}`}
      {...(enabled ? attributes : {})}
      {...(enabled ? listeners : {})}
    >
      {enabled && <GripVertical size={12} className="shrink-0 opacity-50" />}
      <span className="truncate">{stream.name}</span>
    </div>
  );
}
