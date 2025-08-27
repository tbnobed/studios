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
  Play
} from "lucide-react";
import { StreamPlayer } from "@/components/StreamPlayer";
import { GestureHandler } from "@/components/GestureHandler";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { StudioWithStreams, Stream } from "@shared/schema";
import { removeAuthToken, getAuthHeaders, isUnauthorizedError } from "@/lib/authUtils";

type ViewMode = 'grid' | 'single';

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedStudio, setSelectedStudio] = useState<StudioWithStreams | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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

  const StudioSidebar = () => (
    <div className="w-64 h-full bg-card border-r border-border">
      <div className="p-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Studios
        </h2>
        
        <div className="space-y-3">
          {studios.map((studio) => (
            <Button
              key={studio.id}
              variant="ghost"
              className={`w-full p-4 h-auto justify-between ${getStudioGradientClass(studio.name)} hover:shadow-lg transition-all touch-area`}
              onClick={() => handleSelectStudio(studio)}
              data-testid={`studio-card-${studio.name.toLowerCase()}`}
            >
              <div className="text-left">
                <h3 className="font-semibold">{studio.name}</h3>
                <p className="text-sm opacity-75">
                  {studio.streams.filter(s => s.status === 'online').length} Active Streams
                </p>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full live-indicator"></div>
                <span className="text-xs font-medium">LIVE</span>
              </div>
            </Button>
          ))}
        </div>
        
        {/* Admin Section */}
        {user?.role === 'admin' && (
          <div className="border-t border-border mt-6 pt-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Admin
            </h3>
            <Button
              variant="secondary"
              className="w-full touch-area"
              data-testid="button-admin-panel"
            >
              <Settings className="mr-2" size={16} />
              Manage Users
            </Button>
          </div>
        )}
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
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
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
          
          <h1 className="font-semibold text-lg">OBTV Studios</h1>
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
              <Card className="absolute top-12 right-0 w-48 z-50 shadow-xl">
                <CardContent className="p-2">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="font-medium text-sm">{user?.username}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start touch-area"
                    data-testid="button-settings"
                  >
                    <Settings className="mr-2" size={16} />
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive touch-area"
                    onClick={handleLogout}
                    data-testid="button-logout"
                  >
                    <LogOut className="mr-2" size={16} />
                    Sign Out
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <StudioSidebar />
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden relative">
          {/* Studio Header */}
          {selectedStudio && (
            <div className="bg-card border-b border-border px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold" data-testid="current-studio-name">
                    {selectedStudio.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedStudio.streams.length} streams available
                  </p>
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
          <div className="flex-1 p-4 overflow-auto custom-scrollbar">
            {!selectedStudio ? (
              // Welcome State
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto mb-6 bg-muted rounded-2xl flex items-center justify-center">
                    <Play className="text-4xl text-muted-foreground" size={48} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Welcome to OBTV Studio Manager</h3>
                  <p className="text-muted-foreground mb-6">
                    Select a studio from the sidebar to view live streams
                  </p>
                  <Button
                    onClick={() => setSidebarOpen(true)}
                    className="touch-area lg:hidden"
                    data-testid="button-choose-studio"
                  >
                    <Menu className="mr-2" size={16} />
                    Choose Studio
                  </Button>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              // Grid View
              <GestureHandler
                onSwipeLeft={handleNextStream}
                onSwipeRight={handlePreviousStream}
                className="h-full"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 h-full auto-rows-fr">
                  {selectedStudio.streams.map((stream) => (
                    <Card key={stream.id} className="overflow-hidden hover:border-accent transition-colors">
                      <div className="video-container relative">
                        <StreamPlayer
                          stream={stream}
                          className="w-full h-full"
                          controls={true}
                          autoPlay={false}
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
                          <span className="text-xs text-muted-foreground">
                            {stream.resolution}
                          </span>
                          <div className="flex items-center space-x-1">
                            <div className={`w-1 h-1 rounded-full ${
                              stream.status === 'online' ? 'bg-green-500' : 
                              stream.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                            }`}></div>
                            <span className={`text-xs font-medium capitalize ${
                              stream.status === 'online' ? 'text-green-500' : 
                              stream.status === 'error' ? 'text-red-500' : 'text-yellow-500'
                            }`}>
                              {stream.status}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </GestureHandler>
            ) : (
              // Single View Mode
              <GestureHandler
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
              </GestureHandler>
            )}
          </div>
        </main>
      </div>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setUserMenuOpen(false)}
        />
      )}
    </div>
  );
}
