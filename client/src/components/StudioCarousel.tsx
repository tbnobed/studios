import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StreamPlayer } from "./StreamPlayer";
import { GestureHandler } from "./GestureHandler";
import { ChevronLeft, ChevronRight, Camera } from "lucide-react";
import { StudioWithStreams } from "@shared/schema";

interface StudioCarouselProps {
  studios: StudioWithStreams[];
  onStudioSelect: (studio: StudioWithStreams) => void;
}

export function StudioCarousel({ studios, onStudioSelect }: StudioCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [streamStatuses, setStreamStatuses] = useState<Record<string, 'loading' | 'online' | 'offline' | 'error'>>({});

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? studios.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === studios.length - 1 ? 0 : prev + 1));
  };

  const handleStreamStatusChange = (streamId: string, status: 'loading' | 'online' | 'offline' | 'error') => {
    setStreamStatuses(prev => ({ ...prev, [streamId]: status }));
  };

  const handleStreamClick = (stream: any) => {
    onStudioSelect(currentStudio);
  };

  const getStudioStatus = (studio: StudioWithStreams) => {
    const statuses = studio.streams.map(stream => streamStatuses[stream.id] || 'loading');
    if (statuses.some(status => status === 'online')) return 'online';
    if (statuses.some(status => status === 'loading')) return 'loading';
    if (statuses.every(status => status === 'offline' || status === 'error')) return 'offline';
    return 'loading';
  };

  const studioThemes = {
    'SoCal': { 
      gradient: 'from-yellow-400 via-orange-500 to-red-500', 
      icon: '🌴', 
      color: 'text-orange-600'
    },
    'Plex': { 
      gradient: 'from-green-400 via-emerald-500 to-teal-500', 
      icon: '📡', 
      color: 'text-emerald-600'
    }, 
    'Irving': { 
      gradient: 'from-blue-400 via-indigo-500 to-purple-500', 
      icon: '🏢', 
      color: 'text-blue-600'
    },
    'Nashville': { 
      gradient: 'from-purple-400 via-pink-500 to-rose-500', 
      icon: '🎵', 
      color: 'text-purple-600'
    }
  };

  const currentStudio = studios[currentIndex];
  const theme = studioThemes[currentStudio.name as keyof typeof studioThemes] || { 
    gradient: 'from-gray-400 to-gray-600', 
    icon: '📺', 
    color: 'text-gray-600'
  };

  if (studios.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-muted-foreground">No studios available</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center px-4">
      {/* Studio Name Card - Top Center */}
      <GestureHandler
        onSwipeLeft={handleNext}
        onSwipeRight={handlePrevious}
        className="flex-shrink-0 mb-8"
      >
        <div className="flex items-center justify-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            className="touch-area"
            data-testid="button-previous-studio"
          >
            <ChevronLeft size={20} />
          </Button>

          <Card 
            className="w-72 h-24 overflow-hidden cursor-pointer hover:border-primary/50 border-2"
            onClick={() => onStudioSelect(currentStudio)}
            data-testid={`studio-card-${currentStudio.id}`}
          >
            <div className={`w-full h-full bg-gradient-to-r ${theme.gradient} relative flex items-center justify-center text-white`}>
              {/* Studio Icon and Name */}
              <div className="flex items-center space-x-3">
                <div className="text-2xl opacity-90">
                  {theme.icon}
                </div>
                
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-shadow-lg tracking-wide">
                    {currentStudio.name}
                  </h2>
                  <p className="text-xs opacity-90 font-medium">STUDIOS</p>
                </div>
              </div>
              
              {/* Status Badge */}
              <div className="absolute top-2 right-2 bg-black bg-opacity-50 px-2 py-1 rounded-full">
                <div className="flex items-center space-x-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    getStudioStatus(currentStudio) === 'online' ? 'bg-green-400' : 
                    getStudioStatus(currentStudio) === 'loading' ? 'bg-yellow-400' : 'bg-red-400'
                  }`}></div>
                  <span className="text-xs uppercase font-medium">
                    {getStudioStatus(currentStudio) === 'online' ? 'LIVE' : 
                     getStudioStatus(currentStudio) === 'loading' ? 'LOADING' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {/* Stream Count Badge */}
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded-full">
                <div className="flex items-center space-x-1">
                  <Camera size={12} />
                  <span className="text-xs font-medium">{currentStudio.streams.length}</span>
                </div>
              </div>
            </div>
          </Card>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            className="touch-area"
            data-testid="button-next-studio"
          >
            <ChevronRight size={20} />
          </Button>
        </div>
      </GestureHandler>

      {/* Studio Indicators */}
      <div className="flex justify-center space-x-2 mb-8 flex-shrink-0">
        {studios.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-all touch-area ${
              index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            onClick={() => setCurrentIndex(index)}
            data-testid={`studio-indicator-${index}`}
          />
        ))}
      </div>

      {/* Stream Preview Carousel - Bottom Horizontal */}
      <div className="flex-1 flex flex-col justify-end">
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2 text-center">Live Streams</h3>
          
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex space-x-3 px-4" style={{ minWidth: 'max-content' }}>
              {currentStudio.streams.map((stream) => (
                <div
                  key={stream.id}
                  className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => handleStreamClick(stream)}
                  data-testid={`stream-preview-${stream.id}`}
                >
                  <Card className="w-32 overflow-hidden border-2 hover:border-primary/50">
                    <div className="aspect-video relative bg-black">
                      <StreamPlayer
                        stream={stream}
                        className="w-full h-full"
                        controls={false}
                        autoPlay={true}
                        onStatusChange={(status) => handleStreamStatusChange(stream.id, status)}
                      />
                      
                      {/* Stream Status Overlay */}
                      <div className="absolute top-1 right-1 bg-black bg-opacity-60 px-1 py-0.5 rounded-full">
                        <div className="flex items-center space-x-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            streamStatuses[stream.id] === 'online' ? 'bg-green-500' : 
                            streamStatuses[stream.id] === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                          }`}></div>
                          <span className="text-xs text-white font-medium">
                            {streamStatuses[stream.id] === 'online' ? 'LIVE' : 
                             streamStatuses[stream.id] === 'error' ? 'ERROR' : 'LOAD'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <CardContent className="p-2">
                      <h4 className="font-medium text-xs truncate" data-testid={`stream-name-${stream.id}`}>
                        {stream.name}
                      </h4>
                      <p className="text-xs text-muted-foreground">{stream.resolution}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Enter Studio Button */}
        <div className="text-center mb-4 flex-shrink-0">
          <Button
            onClick={() => onStudioSelect(currentStudio)}
            className="touch-area"
            data-testid="button-enter-studio"
          >
            Enter {currentStudio.name} Studio
            <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}