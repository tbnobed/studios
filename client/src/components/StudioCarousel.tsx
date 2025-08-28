import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StreamPlayer } from "./StreamPlayer";
import { GestureHandler } from "./GestureHandler";
import { ChevronLeft, ChevronRight, Camera, Play } from "lucide-react";
import { StudioWithStreams } from "@shared/schema";

interface StudioCarouselProps {
  studios: StudioWithStreams[];
  onStudioSelect: (studio: StudioWithStreams) => void;
}

export function StudioCarousel({ studios, onStudioSelect }: StudioCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [streamStatuses, setStreamStatuses] = useState<Record<string, 'loading' | 'online' | 'offline' | 'error'>>({});

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? studios.length - 1 : prev - 1));
    setPreviewIndex(0); // Reset preview index when changing studios
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === studios.length - 1 ? 0 : prev + 1));
    setPreviewIndex(0); // Reset preview index when changing studios
  };

  const handlePreviewPrevious = () => {
    const streamsPerView = 6;
    const maxIndex = Math.max(0, currentStudio.streams.length - streamsPerView);
    setPreviewIndex((prev) => Math.max(0, prev - streamsPerView));
  };

  const handlePreviewNext = () => {
    const streamsPerView = 6;
    const maxIndex = Math.max(0, currentStudio.streams.length - streamsPerView);
    setPreviewIndex((prev) => Math.min(maxIndex, prev + streamsPerView));
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
    <div className="w-full h-full flex flex-col">
      {/* STUDIO CARD SECTION - 75% of container height */}
      <div className="flex-[6] flex items-center justify-center relative z-10 min-h-0">
        <GestureHandler
          onSwipeLeft={handleNext}
          onSwipeRight={handlePrevious}
          className="flex items-center space-x-4 h-full"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            className="touch-area flex-shrink-0"
            data-testid="button-previous-studio"
          >
            <ChevronLeft size={20} />
          </Button>

          {/* Large Portrait Card (9:16 aspect ratio) - Uses full height of container */}
          <Card 
            className="overflow-hidden cursor-pointer hover:border-primary/50 border-2"
            style={{ width: '55vw', height: '40vh' }}
            onClick={() => onStudioSelect(currentStudio)}
            data-testid={`studio-card-${currentStudio.id}`}
          >
            <div className={`w-full h-full ${currentStudio.imageUrl ? 'bg-black' : `bg-gradient-to-br ${theme.gradient}`} relative flex flex-col items-center justify-center text-white`}>
              {currentStudio.imageUrl ? (
                /* Studio Background Image */
                <div className="absolute inset-0 w-full h-full">
                  <img 
                    src={currentStudio.imageUrl} 
                    alt={currentStudio.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20"></div>
                </div>
              ) : null}
              
              {/* Studio Icon and Name */}
              <div className="flex flex-col items-center space-y-4 z-10 relative">
                {!currentStudio.imageUrl && (
                  <div className="text-6xl opacity-90">
                    {theme.icon}
                  </div>
                )}
                
                <div className="text-center">
                  <h2 className="font-bold text-shadow-lg tracking-wide mb-2" style={{ fontSize: 'clamp(1.5rem, 4vh, 3rem)' }}>
                    {currentStudio.name}
                  </h2>
                  <p className="opacity-90 font-medium" style={{ fontSize: 'clamp(0.875rem, 2vh, 1.5rem)' }}>STUDIOS</p>
                </div>
              </div>
              
              {/* Status Badge */}
              <div className="absolute top-4 right-4 bg-black bg-opacity-60 px-3 py-2 rounded-full">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    getStudioStatus(currentStudio) === 'online' ? 'bg-green-400' : 
                    getStudioStatus(currentStudio) === 'loading' ? 'bg-yellow-400' : 'bg-red-400'
                  }`}></div>
                  <span className="text-sm uppercase font-medium">
                    {getStudioStatus(currentStudio) === 'online' ? 'LIVE' : 
                     getStudioStatus(currentStudio) === 'loading' ? 'LOADING' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              {/* Stream Count Badge */}
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-60 px-3 py-2 rounded-full">
                <div className="flex items-center space-x-2">
                  <Camera size={16} />
                  <span className="text-sm font-medium">{currentStudio.streams.length}</span>
                </div>
              </div>

              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="w-full h-full bg-gradient-to-t from-black/50 via-transparent to-black/20"></div>
              </div>
            </div>
          </Card>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            className="touch-area flex-shrink-0"
            data-testid="button-next-studio"
          >
            <ChevronRight size={20} />
          </Button>
        </GestureHandler>
      </div>

      {/* PREVIEW SECTION - 25% of container height */}
      <div className="flex-1 p-2 relative z-10 min-h-0">
        {/* Studio Indicators */}
        <div className="flex justify-center space-x-2 mt-[32px] mb-[32px]">
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

        {/* Stream Preview Grid */}
        <div className="flex items-center space-x-2 h-full">
          {/* Previous Button */}
          {previewIndex > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviewPrevious}
              className="touch-area flex-shrink-0"
              data-testid="button-preview-previous"
            >
              <ChevronLeft size={16} />
            </Button>
          )}
          
          {/* Stream Previews - 2x3 Grid */}
          <div className="flex-1 overflow-hidden h-full">
            <GestureHandler
              onSwipeLeft={handlePreviewNext}
              onSwipeRight={handlePreviewPrevious}
              className="w-full h-full flex justify-center"
            >
              <div className="grid grid-cols-3 grid-rows-2 gap-1 w-full max-w-xl mx-auto">
                {currentStudio.streams.slice(previewIndex, previewIndex + 6).map((stream) => (
                  <div
                    key={stream.id}
                    className="cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => handleStreamClick(stream)}
                    data-testid={`stream-preview-${stream.id}`}
                  >
                    <Card className="w-full overflow-hidden border-2 hover:border-primary/50">
                      <div className="aspect-video relative bg-black">
                        <StreamPlayer
                          stream={stream}
                          className="w-full h-full"
                          controls={false}
                          autoPlay={true}
                          showOverlay={false}
                          onStatusChange={(status) => handleStreamStatusChange(stream.id, status)}
                        />
                      </div>
                      
                      <CardContent className="p-0.5">
                        <h4 className="font-medium text-xs truncate text-center" data-testid={`stream-name-${stream.id}`}>
                          {stream.name}
                        </h4>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </GestureHandler>
          </div>
          
          {/* Next Button */}
          {previewIndex + 6 < currentStudio.streams.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviewNext}
              className="touch-area flex-shrink-0"
              data-testid="button-preview-next"
            >
              <ChevronRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}