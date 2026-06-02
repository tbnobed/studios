import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { 
  Menu, 
  User, 
  Settings, 
  LogOut, 
  Grid3X3, 
  Maximize, 
  ChevronLeft, 
  ChevronRight,
  Play,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  Monitor,
  Video,
  Heart
} from "lucide-react";
import { StreamPlayer } from "@/components/StreamPlayer";
import { GestureHandler } from "@/components/GestureHandler";
import { StudioCarousel } from "@/components/StudioCarousel";
import StudioSidebar from "@/components/StudioSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { StudioWithStreams, Stream, FavoriteWithStream } from "@shared/schema";
import { removeAuthToken, getAuthHeaders, isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import obedtvLogo from "@assets/image_1756407804157.png";
import tbnLogo from "../assets/tbnlogo-white_1756354700943.png";
import obLogo from "@assets/image_1756407804157.png";

type ViewMode = 'grid' | 'single';

function hexToRgba(hex: string | null | undefined, alpha: number): string {
  const fallback = '#64748b'; // slate-500
  let h = (hex || fallback).replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    h = fallback.replace('#', '');
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedStudio, setSelectedStudio] = useState<StudioWithStreams | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [streamStatuses, setStreamStatuses] = useState<Record<string, 'online' | 'offline' | 'error'>>({});
  const [currentStudioIndex, setCurrentStudioIndex] = useState(0);

  // Fetch user's accessible studios
  const { data: studios = [], isLoading: studiosLoading, error: studiosError } = useQuery<StudioWithStreams[]>({
    queryKey: ["/api/studios"],
    meta: {
      headers: getAuthHeaders(),
    },
  });

  // Fetch user's favorites to drive the heart toggle state.
  const { data: favorites = [] } = useQuery<FavoriteWithStream[]>({
    queryKey: ["/api/favorites"],
    meta: {
      headers: getAuthHeaders(),
    },
  });
  const favoriteStreamIds = new Set(favorites.map((f) => f.streamId));

  const addFavoriteMutation = useMutation({
    mutationFn: async (streamId: string) => {
      const res = await apiRequest("POST", "/api/favorites", { streamId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/favorites"] });
    },
    onError: (error: Error) => {
      const full = error.message.includes("Favorites are full");
      toast({
        title: full ? "Favorites are full" : "Could not add favorite",
        description: full
          ? "You can have up to 40 favorites. Remove some first."
          : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeFavoriteMutation = useMutation({
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

  const toggleFavorite = (streamId: string) => {
    if (favoriteStreamIds.has(streamId)) {
      removeFavoriteMutation.mutate(streamId);
    } else {
      addFavoriteMutation.mutate(streamId);
    }
  };

  useEffect(() => {
    if (studiosError && isUnauthorizedError(studiosError as Error)) {
      toast({
        title: "Session Expired",
        description: "Please sign in again",
        variant: "destructive",
      });
      setTimeout(() => {
        removeAuthToken();
        window.location.reload();
      }, 1000);
    }
  }, [studiosError, toast]);

  const handleSelectStudio = (studio: StudioWithStreams) => {
    setSelectedStudio(studio);
    setCurrentStreamIndex(0);
    setSidebarOpen(false);
  };

  // Select a studio from the ?studio=<id> query param (e.g. navigating from Favorites)
  const appliedStudioParam = useRef(false);
  useEffect(() => {
    if (appliedStudioParam.current || studios.length === 0) return;
    const studioId = new URLSearchParams(window.location.search).get('studio');
    if (!studioId) return;
    const match = studios.find((s) => s.id === studioId);
    if (match) {
      setSelectedStudio(match);
      setCurrentStreamIndex(0);
      appliedStudioParam.current = true;
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [studios]);

  const handleLogout = () => {
    removeAuthToken();
    window.location.reload();
  };

  const handleNextStream = () => {
    if (selectedStudio && selectedStudio.streams.length > 0) {
      setCurrentStreamIndex((prev) => 
        prev >= selectedStudio.streams.length - 1 ? 0 : prev + 1
      );
    }
  };

  const handlePreviousStream = () => {
    if (selectedStudio && selectedStudio.streams.length > 0) {
      setCurrentStreamIndex((prev) => 
        prev <= 0 ? selectedStudio.streams.length - 1 : prev - 1
      );
    }
  };

  const getStudioGradientClass = (studioName: string) => {
    const name = studioName.toLowerCase().replace(/\s+/g, '');
    switch (name) {
      case 'socal': return 'studio-gradient-socal text-gray-900';
      case 'plex': return 'studio-gradient-plex text-white';
      case 'irving': return 'studio-gradient-irving text-gray-900';
      case 'nashville': return 'studio-gradient-nashville text-white';
      default: return 'bg-card text-card-foreground';
    }
  };

  const getStreamStatus = (stream: Stream) => {
    return streamStatuses[stream.id] || stream.status;
  };

  const handleStreamStatusChange = (streamId: string, status: 'online' | 'offline' | 'error') => {
    setStreamStatuses(prev => ({
      ...prev,
      [streamId]: status
    }));
  };

  if (studiosLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading studios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-900 via-slate-800 to-black relative overflow-hidden md:overflow-visible">
      {/* Glossy overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"></div>
      {/* Mobile Header */}
      <header className="md:hidden px-4 py-3 flex items-center justify-between shrink-0 fixed left-0 right-0 z-30 bg-card/80 backdrop-blur border-b border-border" style={{ top: 'max(0px, env(safe-area-inset-top))' }}>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">
            {user?.firstName} {user?.lastName}
          </span>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="touch-area text-destructive hover:text-destructive"
          onClick={handleLogout}
          data-testid="button-mobile-logout"
        >
          <LogOut size={16} />
        </Button>
      </header>
      {/* Desktop Header */}
      <header className="hidden md:flex bg-card/80 backdrop-blur border-b border-border px-4 py-3 items-center justify-between shrink-0 relative z-20">
        <div className="flex items-center space-x-3">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="lg:hidden touch-area" data-testid="button-menu">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <StudioSidebar
                selectedStudioId={selectedStudio?.id}
                onSelectStudio={handleSelectStudio}
                onNavigate={() => setSidebarOpen(false)}
              />
            </SheetContent>
          </Sheet>
          
          <button
            onClick={() => window.location.href = '/'}
            className="hover:opacity-80 transition-opacity cursor-pointer"
            data-testid="link-home"
          >
            <img 
              src={tbnLogo} 
              alt="TBN Studios Logo" 
              className="h-16 w-auto opacity-75"
            />
          </button>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {user?.firstName} {user?.lastName}
          </span>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="touch-area"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              data-testid="button-user-menu"
            >
              <User size={20} />
            </Button>
            
            {/* User Menu Dropdown */}
            {userMenuOpen && (
              <Card className="absolute top-12 right-0 w-48 z-[60] shadow-xl">
                <CardContent className="p-2">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="font-medium text-sm">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  {user?.role === 'admin' && (
                    <button
                      className="w-full flex items-center justify-start px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setUserMenuOpen(false);
                        setTimeout(() => {
                          window.location.href = '/admin';
                        }, 50);
                      }}
                      data-testid="button-admin"
                    >
                      <Shield className="mr-2" size={16} />
                      Admin Panel
                    </button>
                  )}
                  <button
                    className="w-full flex items-center justify-start px-2 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUserMenuOpen(false);
                      setTimeout(() => {
                        window.location.href = '/settings';
                      }, 50);
                    }}
                    data-testid="button-settings"
                  >
                    <Settings className="mr-2" size={16} />
                    Settings
                  </button>
                  <button
                    className="w-full flex items-center justify-start px-2 py-2 text-sm text-destructive hover:bg-accent rounded-md transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUserMenuOpen(false);
                      setTimeout(() => {
                        handleLogout();
                      }, 50);
                    }}
                    data-testid="button-logout"
                  >
                    <LogOut className="mr-2" size={16} />
                    Sign Out
                  </button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 flex md:pt-0 relative z-10 overflow-hidden md:overflow-visible md:min-h-0">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <StudioSidebar
            selectedStudioId={selectedStudio?.id}
            onSelectStudio={handleSelectStudio}
          />
        </div>

        {/* Main Content */}
        <main className="flex-1 relative">
          {/* Studio Header */}
          {selectedStudio && (
            <div className="bg-card border-b border-border px-4 lg:px-6 py-4 studio-header" style={{ marginTop: 'max(64px, calc(env(safe-area-inset-top) + 64px))' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {/* Mobile Back Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden touch-area"
                    onClick={() => setSelectedStudio(null)}
                    data-testid="button-back-to-studios"
                  >
                    <ChevronLeft size={20} />
                  </Button>
                  <div>
                    <h2 className="text-xl font-bold" data-testid="current-studio-name">
                      {selectedStudio.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedStudio.streams.length} streams available
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {/* View Mode Toggle */}
                  <div className="flex bg-muted rounded-lg p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`touch-area ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => setViewMode('grid')}
                      data-testid="button-grid-view"
                    >
                      <Grid3X3 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`hidden md:block touch-area ${viewMode === 'single' ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => setViewMode('single')}
                      data-testid="button-single-view"
                    >
                      <Maximize size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Video Content */}
          <div className="flex-1 md:p-2 overflow-hidden md:overflow-visible md:h-auto">
            {!selectedStudio ? (
              <div className="h-full">
                {/* Mobile Studio Selection with Full Screen Background */}
                <GestureHandler
                  onSwipeLeft={() => {
                    if (currentStudioIndex < studios.length - 1) {
                      setCurrentStudioIndex(currentStudioIndex + 1);
                    }
                  }}
                  onSwipeRight={() => {
                    if (currentStudioIndex > 0) {
                      setCurrentStudioIndex(currentStudioIndex - 1);
                    }
                  }}
                  className="lg:hidden absolute inset-0"
                >
                  {/* Studio Background Cards */}
                  {studios.map((studio, index) => (
                    <div
                      key={studio.id}
                      className={`absolute inset-0 transition-all duration-500 transform cursor-pointer hover:scale-[1.02] ${
                        index === currentStudioIndex 
                          ? 'opacity-100 scale-100' 
                          : index < currentStudioIndex 
                            ? 'opacity-0 scale-95 -translate-x-full' 
                            : 'opacity-0 scale-95 translate-x-full'
                      } ${getStudioGradientClass(studio.name)} ${
                        selectedStudio && selectedStudio.id === studio.id ? 'ring-4 ring-primary/30' : ''
                      }`}
                      style={{
                        backgroundImage: studio.imageUrl ? `url(${studio.imageUrl})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundBlendMode: studio.imageUrl ? 'overlay' : 'normal'
                      }}
                      onClick={() => handleSelectStudio(studio)}
                    >
                      {/* Overlay for better text readability */}
                      <div className="absolute inset-0 bg-black/30"></div>
                      
                      {/* TBN Logo positioned at top with safe area support */}
                      <div className="absolute left-1/2 transform -translate-x-1/2 z-10" style={{ top: 'max(44px, env(safe-area-inset-top))' }}>
                        <img 
                          src={tbnLogo} 
                          alt="TBN Logo" 
                          className="w-80 h-auto max-w-none mt-[121px] mb-[121px]"
                        />
                      </div>
                      
                      {/* Studio Content */}
                      <div className="relative h-full flex flex-col justify-center items-center px-6 text-center">
                        <div className="mb-8">
                          <h1 className={`text-[48px] font-bold mb-2 drop-shadow-lg transition-colors duration-300 ${
                            selectedStudio && selectedStudio.id === studio.id ? 'text-primary-foreground' : 'text-white'
                          }`}>
                            {studio.name}
                          </h1>
                          <p className={`text-lg mb-1 drop-shadow transition-colors duration-300 ${
                            selectedStudio && selectedStudio.id === studio.id ? 'text-primary-foreground/90' : 'text-white/90'
                          }`}>
                            {studio.location}
                          </p>
                          <p className={`drop-shadow transition-colors duration-300 ${
                            selectedStudio && selectedStudio.id === studio.id ? 'text-primary-foreground/80' : 'text-white/80'
                          }`}>
                            {studio.streams.length} streams available
                          </p>
                          {selectedStudio && selectedStudio.id === studio.id && (
                            <div className="mt-4 inline-flex items-center space-x-2 bg-primary/20 text-primary-foreground px-3 py-1 rounded-full text-sm font-medium backdrop-blur">
                              <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse"></div>
                              <span>SELECTED</span>
                            </div>
                          )}
                        </div>
                        
                        
                        
                        {/* Live indicator */}
                        <div className="flex items-center space-x-2 mt-6">
                          <div className={`w-3 h-3 rounded-full live-indicator transition-colors duration-300 ${
                            selectedStudio && selectedStudio.id === studio.id ? 'bg-primary-foreground' : 'bg-green-500'
                          }`}></div>
                          <span className={`font-medium drop-shadow transition-colors duration-300 ${
                            selectedStudio && selectedStudio.id === studio.id ? 'text-primary-foreground' : 'text-white'
                          }`}>LIVE</span>
                        </div>
                      </div>
                      
                      {/* Stream Previews Overlay - positioned at bottom */}
                      <div className="absolute bottom-24 left-4 right-4">
                        <div className="grid grid-cols-2 gap-2">
                          {studio.streams.slice(0, 4).map((stream) => (
                            <div
                              key={stream.id}
                              className="aspect-video bg-black/60 backdrop-blur rounded-lg overflow-hidden border border-white/20"
                            >
                              <StreamPlayer
                                stream={stream}
                                className="w-full h-full"
                                controls={false}
                                autoPlay={true}
                                onStatusChange={(status) => handleStreamStatusChange(stream.id, status)}
                              />
                              <div className="absolute bottom-1 left-1 right-1 text-xs text-white/90 bg-black/60 px-2 py-1 rounded truncate">
                                {stream.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Navigation Arrows */}
                  {studios.length > 1 && (
                    <>
                      {currentStudioIndex > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white touch-area z-20"
                          onClick={() => setCurrentStudioIndex(currentStudioIndex - 1)}
                          data-testid="button-previous-studio"
                        >
                          <ChevronLeft size={20} />
                        </Button>
                      )}
                      
                      {currentStudioIndex < studios.length - 1 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white touch-area z-20"
                          onClick={() => setCurrentStudioIndex(currentStudioIndex + 1)}
                          data-testid="button-next-studio"
                        >
                          <ChevronRight size={20} />
                        </Button>
                      )}
                    </>
                  )}
                  
                  
                </GestureHandler>

                {/* Desktop Welcome State */}
                <div className="hidden lg:flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 mx-auto mb-6 bg-muted rounded-2xl flex items-center justify-center">
                      <Play className="text-4xl text-muted-foreground" size={48} />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Welcome to OBTV Studio Manager</h3>
                    <p className="text-muted-foreground mb-6">
                      Select a studio from the sidebar to view live streams
                    </p>
                  </div>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              // Grid View
              (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {selectedStudio.streams.map((stream) => (
                  <Card key={stream.id} className="overflow-hidden hover:border-accent transition-colors">
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
                          onClick={() => toggleFavorite(stream.id)}
                          disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                          data-testid={`button-favorite-${stream.id}`}
                          aria-label={favoriteStreamIds.has(stream.id) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart
                            size={12}
                            className={favoriteStreamIds.has(stream.id) ? "fill-red-500 text-red-500" : ""}
                          />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-black/60 hover:bg-black/80 text-white touch-area"
                          onClick={() => {
                            setCurrentStreamIndex(selectedStudio.streams.indexOf(stream));
                            setViewMode('single');
                          }}
                          data-testid={`button-fullscreen-${stream.id}`}
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
                ))}
              </div>)
            ) : (
              // Single View Mode
              (<GestureHandler
                onSwipeLeft={handleNextStream}
                onSwipeRight={handlePreviousStream}
                onPinchZoom={(scale) => {
                  // Handle pinch-to-zoom for video element
                  const video = document.querySelector('#main-video') as HTMLElement;
                  if (video) {
                    video.style.transform = `scale(${Math.min(Math.max(scale, 1), 3)})`;
                  }
                }}
                className="h-full"
              >
                <div className="h-full bg-black rounded-lg overflow-hidden relative">
                  {selectedStudio.streams[currentStreamIndex] && (
                    <>
                      <StreamPlayer
                        stream={selectedStudio.streams[currentStreamIndex]}
                        className="w-full h-full"
                        controls={true}
                        autoPlay={true}
                        onStatusChange={(status) => handleStreamStatusChange(selectedStudio.streams[currentStreamIndex].id, status)}
                      />
                      
                      {/* Video Controls Overlay */}
                      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-black/60 hover:bg-black/80 text-white touch-area"
                            onClick={handlePreviousStream}
                            data-testid="button-previous-stream"
                          >
                            <ChevronLeft size={16} />
                          </Button>
                          <div className="bg-black/60 text-white px-3 py-2 rounded text-sm font-medium">
                            Stream {currentStreamIndex + 1} of {selectedStudio.streams.length}
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-black/60 hover:bg-black/80 text-white touch-area"
                            onClick={handleNextStream}
                            data-testid="button-next-stream"
                          >
                            <ChevronRight size={16} />
                          </Button>
                        </div>
                        
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-black/60 hover:bg-black/80 text-white touch-area"
                          onClick={() => setViewMode('grid')}
                          data-testid="button-exit-fullscreen"
                        >
                          <Grid3X3 size={16} />
                        </Button>
                      </div>
                      
                      {/* Touch Gesture Indicators */}
                      <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-2 rounded-lg text-xs gesture-hint">
                        Pinch to zoom • Swipe to navigate
                      </div>
                    </>
                  )}
                </div>
              </GestureHandler>)
            )}
          </div>
        </main>
      </div>
      
      {/* Mobile OB Logo - Static at bottom */}
      <div className="md:hidden fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
        <img 
          src={obLogo} 
          alt="OB Logo" 
          className="w-12 h-12 opacity-75"
        />
      </div>
    </div>
  );
}
