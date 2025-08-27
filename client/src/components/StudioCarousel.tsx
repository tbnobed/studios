import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StudioWithStreams } from "@shared/schema";
import { StreamPlayer } from "./StreamPlayer";
import { GestureHandler } from "./GestureHandler";

interface StudioCarouselProps {
  studios: StudioWithStreams[];
  onStudioSelect: (studio: StudioWithStreams) => void;
}

export function StudioCarousel({ studios, onStudioSelect }: StudioCarouselProps) {
  const [currentStudioIndex, setCurrentStudioIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handlePrevious = () => {
    const newIndex = currentStudioIndex > 0 ? currentStudioIndex - 1 : studios.length - 1;
    setCurrentStudioIndex(newIndex);
    scrollToCard(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentStudioIndex < studios.length - 1 ? currentStudioIndex + 1 : 0;
    setCurrentStudioIndex(newIndex);
    scrollToCard(newIndex);
  };

  const scrollToCard = (index: number) => {
    if (scrollRef.current) {
      const cardWidth = scrollRef.current.clientWidth * 0.8; // Card width is 80% of container
      const scrollPosition = index * (cardWidth + 16); // 16px gap
      scrollRef.current.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleCardClick = (studio: StudioWithStreams) => {
    onStudioSelect(studio);
  };

  if (studios.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-muted-foreground">No studios available</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <GestureHandler
        onSwipeLeft={handleNext}
        onSwipeRight={handlePrevious}
        className="w-full"
      >
        <div 
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {studios.map((studio, index) => {
            // Get the first stream with a valid URL for preview
            const previewStream = studio.streams?.find(stream => stream.streamUrl) || studio.streams?.[0];
            
            return (
              <Card
                key={studio.id}
                className={`flex-shrink-0 w-4/5 cursor-pointer hover:border-accent transition-all duration-200 ${
                  index === currentStudioIndex ? 'ring-2 ring-accent' : ''
                }`}
                style={{ scrollSnapAlign: 'start' }}
                onClick={() => handleCardClick(studio)}
                data-testid={`studio-card-${studio.id}`}
              >
                <CardContent className="p-4">
                  {/* Studio Name */}
                  <div className="mb-3">
                    <h3 className="font-semibold text-lg" data-testid={`studio-name-${studio.id}`}>
                      {studio.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {studio.streams?.length || 0} streams available
                    </p>
                  </div>

                  {/* Preview Stream */}
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-3">
                    {previewStream ? (
                      <StreamPlayer
                        stream={previewStream}
                        className="w-full h-full"
                        controls={false}
                        autoPlay={true}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <div className="w-12 h-12 mx-auto mb-2 bg-muted rounded-lg flex items-center justify-center">
                            <span className="text-2xl">📺</span>
                          </div>
                          <p className="text-sm">No preview available</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Studio Info */}
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>{studio.location || 'Location not set'}</span>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>Live</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </GestureHandler>

      {/* Studio Navigation Dots */}
      <div className="flex justify-center space-x-2 mt-4">
        {studios.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === currentStudioIndex ? 'bg-accent' : 'bg-muted'
            }`}
            onClick={() => {
              setCurrentStudioIndex(index);
              scrollToCard(index);
            }}
            data-testid={`studio-dot-${index}`}
          />
        ))}
      </div>
    </div>
  );
}