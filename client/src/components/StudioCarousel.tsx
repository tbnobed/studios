import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StreamPlayer } from "./StreamPlayer";
import { GestureHandler } from "./GestureHandler";
import { ChevronLeft, ChevronRight, Play, Camera } from "lucide-react";
import { StudioWithStreams } from "@shared/schema";

interface StudioCarouselProps {
  studios: StudioWithStreams[];
  onStudioSelect: (studio: StudioWithStreams) => void;
}

export function StudioCarousel({ studios, onStudioSelect }: StudioCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedStudio, setSelectedStudio] = useState<StudioWithStreams | null>(null);
  const [streamStatuses, setStreamStatuses] = useState<Record<string, 'loading' | 'online' | 'offline' | 'error'>>({});

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? studios.length - 1 : prev - 1));
    setSelectedStudio(null); // Clear selection when navigating
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === studios.length - 1 ? 0 : prev + 1));
    setSelectedStudio(null); // Clear selection when navigating
  };

  const handleStreamStatusChange = (streamId: string, status: 'loading' | 'online' | 'offline' | 'error') => {
    setStreamStatuses(prev => ({ ...prev, [streamId]: status }));
  };

  const handleCardClick = (studio: StudioWithStreams) => {
    if (selectedStudio?.id === studio.id) {
      // If same studio is clicked again, navigate to it
      onStudioSelect(studio);
    } else {
      // Otherwise, just select it to show previews
      setSelectedStudio(studio);
    }
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
      pattern: 'palm trees and sunset vibes',
      textColor: 'text-white'
    },
    'Plex': { 
      gradient: 'from-green-400 via-emerald-500 to-teal-500', 
      icon: '📡', 
      pattern: 'broadcasting waves and technology',
      textColor: 'text-white'
    }, 
    'Irving': { 
      gradient: 'from-blue-400 via-indigo-500 to-purple-500', 
      icon: '🏢', 
      pattern: 'city skyline and corporate',
      textColor: 'text-white'
    },
    'Nashville': { 
      gradient: 'from-purple-400 via-pink-500 to-rose-500', 
      icon: '🎵', 
      pattern: 'music notes and entertainment',
      textColor: 'text-white'
    }
  };

  const currentStudio = studios[currentIndex];
  const theme = studioThemes[currentStudio.name as keyof typeof studioThemes] || { 
    gradient: 'from-gray-400 to-gray-600', 
    icon: '📺', 
    pattern: 'broadcast studio',
    textColor: 'text-white'
  };

  if (studios.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-muted-foreground">No studios available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col justify-center px-4 max-h-screen overflow-hidden">
      {/* Studio Cards Carousel */}
      <GestureHandler
        onSwipeLeft={handleNext}
        onSwipeRight={handlePrevious}
        className="relative"
      >
        <div className="flex items-center justify-center space-x-4 mb-4">
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
            className="w-64 aspect-[9/16] overflow-hidden cursor-pointer transform transition-all duration-300 hover:scale-105 border-2 hover:border-primary/50"
            onClick={() => handleCardClick(currentStudio)}
            data-testid={`studio-card-${currentStudio.id}`}
          >
            <div className={`w-full h-full bg-gradient-to-br ${theme.gradient} relative flex flex-col items-center justify-center ${theme.textColor} overflow-hidden`}>
              {/* Background Pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="w-full h-full flex items-center justify-center text-9xl">
                  {theme.icon}
                </div>
              </div>
              
              {/* Studio Icon/Logo */}
              <div className="text-5xl mb-3 opacity-90 z-10">
                {theme.icon}
              </div>
              
              {/* Studio Name */}
              <h2 className="text-3xl font-bold mb-1 text-center text-shadow-lg tracking-wide z-10">
                {currentStudio.name}
              </h2>
              
              <p className="text-sm opacity-90 font-medium z-10">STUDIOS</p>
              
              {/* Status Badge */}
              <div className="absolute top-4 right-4 bg-black bg-opacity-50 px-3 py-1 rounded-full">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
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
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full">
                <div className="flex items-center space-x-1">
                  <Camera size={14} />
                  <span className="text-sm font-medium">{currentStudio.streams.length}</span>
                </div>
              </div>

              {/* Click Instruction */}
              <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 px-3 py-1 rounded-full">
                <span className="text-xs">TAP TO PREVIEW</span>
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
            <ChevronRight size={24} />
          </Button>
        </div>
      </GestureHandler>

      {/* Studio Indicators */}
      <div className="flex justify-center space-x-2 mb-4">
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

      {/* Stream Previews Below (when studio is selected) */}
      {selectedStudio && (
        <div className="mt-8 animate-in fade-in-50 slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-2xl font-bold">Preview: {selectedStudio.name}</h3>
              <p className="text-muted-foreground">{selectedStudio.streams.length} streams available</p>
            </div>
            <Button
              onClick={() => onStudioSelect(selectedStudio)}
              className="touch-area"
              data-testid="button-enter-studio"
            >
              Enter Studio
              <ChevronRight size={16} className="ml-2" />
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {selectedStudio.streams.map((stream) => (
              <Card key={stream.id} className="overflow-hidden hover:shadow-lg transition-all">
                <div className="aspect-video relative bg-black">
                  <StreamPlayer
                    stream={stream}
                    className="w-full h-full"
                    controls={false}
                    autoPlay={true}
                    onStatusChange={(status) => handleStreamStatusChange(stream.id, status)}
                  />
                  
                  {/* Stream Status Overlay */}
                  <div className="absolute top-2 right-2 bg-black bg-opacity-60 px-2 py-1 rounded-full">
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${
                        streamStatuses[stream.id] === 'online' ? 'bg-green-500' : 
                        streamStatuses[stream.id] === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                      }`}></div>
                      <span className="text-xs text-white uppercase">
                        {streamStatuses[stream.id] === 'online' ? 'LIVE' : 
                         streamStatuses[stream.id] === 'error' ? 'ERROR' : 'LOADING'}
                      </span>
                    </div>
                  </div>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black bg-opacity-30">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                      <Play size={20} className="text-white ml-1" />
                    </div>
                  </div>
                </div>
                
                <CardContent className="p-4">
                  <h4 className="font-medium text-base mb-1" data-testid={`stream-name-${stream.id}`}>
                    {stream.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">{stream.resolution}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Enter Studio Button (Mobile) */}
          <div className="mt-6 text-center lg:hidden">
            <Button
              onClick={() => onStudioSelect(selectedStudio)}
              size="lg"
              className="touch-area"
              data-testid="button-enter-studio-mobile"
            >
              Enter {selectedStudio.name} Studio
              <ChevronRight size={20} className="ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}