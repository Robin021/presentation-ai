"use client";

import { Button } from "@/components/ui/button";
import { usePresentationState } from "@/states/presentation-state";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

export function PresentModeOverlay({ totalSlides }: { totalSlides: number }) {
  const currentSlideIndex = usePresentationState((s) => s.currentSlideIndex);
  const nextSlide = usePresentationState((s) => s.nextSlide);
  const previousSlide = usePresentationState((s) => s.previousSlide);
  const setCurrentSlideIndex = usePresentationState(
    (s) => s.setCurrentSlideIndex,
  );
  const setIsPresenting = usePresentationState((s) => s.setIsPresenting);
  const [showSideArrows, setShowSideArrows] = useState(false);
  const [showHint, setShowHint] = useState(true);

  // Auto-dismiss hint after 4 seconds
  useEffect(() => {
    if (showHint) {
      const timer = setTimeout(() => setShowHint(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showHint]);

  // Show side arrows when mouse approaches edges, hide when idle
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      const nearEdge = e.clientX < 120 || e.clientX > window.innerWidth - 120;
      if (nearEdge) {
        if (hideTimer) clearTimeout(hideTimer);
        setShowSideArrows(true);
      } else {
        if (!hideTimer) {
          hideTimer = setTimeout(() => setShowSideArrows(false), 1500);
        }
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return (
    <>
      {/* Keyboard hint overlay — auto-dismisses */}
      {showHint && (
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-start justify-center pt-12">
          <div className="rounded-full bg-black/60 px-6 py-3 text-sm text-white/90 backdrop-blur-sm transition-opacity duration-500">
            ← → 翻页 · Esc 退出
          </div>
        </div>
      )}

      {/* Side navigation arrows */}
      {showSideArrows && currentSlideIndex > 0 && (
        <button
          onClick={previousSlide}
          className="fixed left-4 top-1/2 z-[1002] -translate-y-1/2 rounded-full bg-black/30 p-3 text-white/80 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}
      {showSideArrows && currentSlideIndex < totalSlides - 1 && (
        <button
          onClick={nextSlide}
          className="fixed right-4 top-1/2 z-[1002] -translate-y-1/2 rounded-full bg-black/30 p-3 text-white/80 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white"
          aria-label="Next slide"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[1002] bg-gradient-to-t from-black/60 to-transparent pb-6 pt-12">
        <div className="mx-auto flex max-w-2xl items-center justify-center gap-4">
          {/* Prev */}
          <Button
            variant="ghost"
            size="icon"
            disabled={currentSlideIndex === 0}
            onClick={previousSlide}
            className="h-9 w-9 rounded-full text-white/70 hover:bg-white/20 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlideIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === currentSlideIndex
                    ? "w-6 bg-white"
                    : "w-2 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Next */}
          <Button
            variant="ghost"
            size="icon"
            disabled={currentSlideIndex === totalSlides - 1}
            onClick={nextSlide}
            className="h-9 w-9 rounded-full text-white/70 hover:bg-white/20 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          {/* Slide counter */}
          <span className="ml-2 min-w-[4rem] text-center text-sm text-white/60 tabular-nums">
            {currentSlideIndex + 1} / {totalSlides}
          </span>

          {/* Exit */}
          <Button
            variant="ghost"
            onClick={() => setIsPresenting(false)}
            className="ml-2 gap-1.5 rounded-full text-white/70 hover:bg-white/20 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Exit
          </Button>
        </div>
      </div>
    </>
  );
}
