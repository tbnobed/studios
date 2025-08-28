import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Video
} from "lucide-react";
import { StreamPlayer } from "@/components/StreamPlayer";
import { GestureHandler } from "@/components/GestureHandler";
import { StudioCarousel } from "@/components/StudioCarousel";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { StudioWithStreams, Stream } from "@shared/schema";
import { removeAuthToken, getAuthHeaders, isUnauthorizedError } from "@/lib/authUtils";
import obedtvLogo from "@/assets/obedtv-logo.png";
import tbnLogo from "../assets/tbnlogo-white_1756354700943.png";
import obLogo from "@assets/image_1756407804157.png";

type ViewMode = 'grid' | 'single';

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStudio, setSelectedStudio] = useState<StudioWithStreams | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const StudioSidebar = () => (
    <div className={`${sidebarCollapsed ? 'w-20' : 'w-64'} h-full bg-card/50 backdrop-blur border-r border-border/40 transition-all duration-300 flex flex-col`}>
      <div className="p-6 flex-1">
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
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            data-testid="button-toggle-sidebar"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </Button>
        </div>
        
        <div className="space-y-2">
          {studios.map((studio) => (
            <button
              key={studio.id}
              className={`w-full ${sidebarCollapsed ? 'p-3 h-12 justify-center' : 'p-4 h-16 justify-between'} 
                group relative overflow-hidden rounded-xl border transition-all duration-200 
                text-left flex items-center touch-area transform hover:scale-[1.02] ${
                selectedStudio?.id === studio.id 
                  ? 'border-primary bg-gradient-to-r from-orange-500/25 to-orange-400/15 shadow-md ring-1 ring-orange-500/30' 
                  : 'border-border/20 hover:border-border/40 bg-gradient-to-r from-slate-500/30 to-slate-400/20 backdrop-blur hover:from-slate-500/40 hover:to-slate-400/30 hover:shadow-sm'
              }`}
              onClick={() => handleSelectStudio(studio)}
              data-testid={`studio-card-${studio.name.toLowerCase()}`}
              title={sidebarCollapsed ? `${studio.name} - ${studio.streams.length} streams available` : undefined}
            >
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center space-y-1">
                  <span className={`text-sm font-medium transition-colors duration-200 ${
                    selectedStudio?.id === studio.id ? 'text-primary' : 'opacity-80'
                  }`}>{studio.name.charAt(0)}</span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                    selectedStudio?.id === studio.id ? 'bg-primary' : 'bg-green-400'
                  }`}></div>
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
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                      selectedStudio?.id === studio.id ? 'bg-primary' : 'bg-green-400'
                    }`}></div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 ${
                      selectedStudio?.id === studio.id ? 'text-orange-300' : 'opacity-60'
                    }`}>
                      {selectedStudio?.id === studio.id ? 'Selected' : 'Live'}
                    </span>
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
        
        {/* Admin Section */}
        {user?.role === 'admin' && (
          <div className="border-t border-border/30 mt-8 pt-6">
            {!sidebarCollapsed && (
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.1em] opacity-60 mb-4">
                Admin
              </h3>
            )}
            <div className="space-y-2">
              <button
                className={`w-full ${sidebarCollapsed ? 'p-3 h-12 justify-center' : 'p-3 h-12 justify-start'}
                  group relative overflow-hidden rounded-lg border border-border/20 hover:border-border/40
                  bg-gradient-to-r from-emerald-500/25 to-emerald-400/15 backdrop-blur
                  hover:from-emerald-500/35 hover:to-emerald-400/25 
                  transition-all duration-200 hover:shadow-sm
                  text-left flex items-center touch-area`}
                onClick={() => window.location.href = '/admin'}
                data-testid="button-manage-users"
                title={sidebarCollapsed ? 'Manage Users' : undefined}
              >
                <Settings className={sidebarCollapsed ? '' : 'mr-3'} size={14} opacity={0.7} />
                {!sidebarCollapsed && <span className="text-xs font-medium opacity-80">Manage Users</span>}
              </button>
              <button
                className={`w-full ${sidebarCollapsed ? 'p-3 h-12 justify-center' : 'p-3 h-12 justify-start'}
                  group relative overflow-hidden rounded-lg border border-border/20 hover:border-border/40
                  bg-gradient-to-r from-blue-500/25 to-blue-400/15 backdrop-blur
                  hover:from-blue-500/35 hover:to-blue-400/25 
                  transition-all duration-200 hover:shadow-sm
                  text-left flex items-center touch-area`}
                onClick={() => window.location.href = '/admin?tab=studios'}
                data-testid="button-manage-studios"
                title={sidebarCollapsed ? 'Manage Studios' : undefined}
              >
                <Monitor className={sidebarCollapsed ? '' : 'mr-3'} size={14} opacity={0.7} />
                {!sidebarCollapsed && <span className="text-xs font-medium opacity-80">Manage Studios</span>}
              </button>
              <button
                className={`w-full ${sidebarCollapsed ? 'p-3 h-12 justify-center' : 'p-3 h-12 justify-start'}
                  group relative overflow-hidden rounded-lg border border-border/20 hover:border-border/40
                  bg-gradient-to-r from-purple-500/25 to-purple-400/15 backdrop-blur
                  hover:from-purple-500/35 hover:to-purple-400/25 
                  transition-all duration-200 hover:shadow-sm
                  text-left flex items-center touch-area`}
                onClick={() => window.location.href = '/admin?tab=streams'}
                data-testid="button-manage-streams"
                title={sidebarCollapsed ? 'Manage Streams' : undefined}
              >
                <Video className={sidebarCollapsed ? '' : 'mr-3'} size={14} opacity={0.7} />
                {!sidebarCollapsed && <span className="text-xs font-medium opacity-80">Manage Streams</span>}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* OB Logo Footer */}
      <div className="p-4 border-t border-border/30">
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start space-x-2'}`}>
          <img 
            src={obLogo} 
            alt="OB Logo" 
            className="w-12 h-12 opacity-75 ml-[84px] mr-[84px]"
          />
          
        </div>
      </div>
    </div>
  );

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
      <header className="md:hidden px-4 py-3 flex items-center justify-between shrink-0 fixed top-0 left-0 right-0 z-30 bg-card/80 backdrop-blur border-b border-border">
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
              <StudioSidebar />
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
          <StudioSidebar />
        </div>

        {/* Main Content */}
        <main className="flex-1 relative">
          {/* Studio Header */}
          {selectedStudio && (
            <div className="bg-card border-b border-border px-4 lg:px-6 py-4 mt-16 md:mt-0">
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
                      className={`touch-area ${viewMode === 'single' ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => setViewMode('single')}
                      data-testid="button-single-view"
                    >
                      <Maximize size={16} />
                    </Button>
                  </div>
                  
                  {/* Gesture Hints */}
                  <div className="hidden md:flex items-center space-x-4 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-1 gesture-hint">
                      <span>Tap to select</span>
                    </div>
                    <div className="flex items-center space-x-1 gesture-hint">
                      <span>Pinch to zoom</span>
                    </div>
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
                  className="lg:hidden absolute inset-0 pt-16"
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
                        selectedStudio?.id === studio.id ? 'ring-4 ring-primary/30' : ''
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
                      
                      {/* TBN Logo positioned at top */}
                      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-10">
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
                            selectedStudio?.id === studio.id ? 'text-primary-foreground' : 'text-white'
                          }`}>
                            {studio.name}
                          </h1>
                          <p className={`text-lg mb-1 drop-shadow transition-colors duration-300 ${
                            selectedStudio?.id === studio.id ? 'text-primary-foreground/90' : 'text-white/90'
                          }`}>
                            {studio.location}
                          </p>
                          <p className={`drop-shadow transition-colors duration-300 ${
                            selectedStudio?.id === studio.id ? 'text-primary-foreground/80' : 'text-white/80'
                          }`}>
                            {studio.streams.length} streams available
                          </p>
                          {selectedStudio?.id === studio.id && (
                            <div className="mt-4 inline-flex items-center space-x-2 bg-primary/20 text-primary-foreground px-3 py-1 rounded-full text-sm font-medium backdrop-blur">
                              <div className="w-2 h-2 bg-primary-foreground rounded-full animate-pulse"></div>
                              <span>SELECTED</span>
                            </div>
                          )}
                        </div>
                        
                        
                        
                        {/* Live indicator */}
                        <div className="flex items-center space-x-2 mt-6">
                          <div className={`w-3 h-3 rounded-full live-indicator transition-colors duration-300 ${
                            selectedStudio?.id === studio.id ? 'bg-primary-foreground' : 'bg-green-500'
                          }`}></div>
                          <span className={`font-medium drop-shadow transition-colors duration-300 ${
                            selectedStudio?.id === studio.id ? 'text-primary-foreground' : 'text-white'
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
                      
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white touch-area"
                        onClick={() => {
                          setCurrentStreamIndex(selectedStudio.streams.indexOf(stream));
                          setViewMode('single');
                        }}
                        data-testid={`button-fullscreen-${stream.id}`}
                      >
                        <Maximize size={12} />
                      </Button>
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
    </div>
  );
}
