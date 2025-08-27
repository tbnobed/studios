import { useEffect, useRef } from "react";

interface GestureHandlerProps {
  children: React.ReactNode;
  onPinchZoom?: (scale: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  className?: string;
}

export function GestureHandler({
  children,
  onPinchZoom,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  className = ""
}: GestureHandlerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startTouchesRef = useRef<TouchList | null>(null);
  const initialDistanceRef = useRef<number>(0);
  const initialScaleRef = useRef<number>(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startTouchesRef.current = e.touches;
      
      if (e.touches.length === 1) {
        // Single touch - track for swipe
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        // Two touches - track for pinch
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && onPinchZoom) {
        // Only prevent default for pinch zoom
        e.preventDefault();
        
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (initialDistanceRef.current > 0) {
          const scale = distance / initialDistanceRef.current;
          onPinchZoom(scale);
        }
      }
      // Allow normal scrolling for single touch
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (startTouchesRef.current && startTouchesRef.current.length === 1 && e.changedTouches.length === 1) {
        // Single touch ended - check for swipe
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);
        
        // Minimum swipe distance
        const minSwipeDistance = 50;
        
        if (absDeltaX > minSwipeDistance && absDeltaX > absDeltaY) {
          // Horizontal swipe
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        } else if (absDeltaY > minSwipeDistance && absDeltaY > absDeltaX) {
          // Vertical swipe
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      }
      
      startTouchesRef.current = null;
      initialDistanceRef.current = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onPinchZoom, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
