"use client";

import { SlideContainer } from "@/components/presentation/presentation-page/SlideContainer";
import { usePresentationSlides } from "@/hooks/presentation/usePresentationSlides";
import { useSlideChangeWatcher } from "@/hooks/presentation/useSlideChangeWatcher";
import { cn } from "@/lib/utils";
import { usePresentationState } from "@/states/presentation-state";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlateController } from "platejs/react";
import { useEffect } from "react";
import { PresentModeHeader } from "../dashboard/PresentModeHeader";
import { ThinkingDisplay } from "../dashboard/ThinkingDisplay";
import PresentationEditor from "../editor/presentation-editor";
import { GlobalUndoRedoHandler } from "./GlobalUndoRedoHandler";

interface PresentationSlidesViewProps {
  isGeneratingPresentation: boolean;
  readOnly?: boolean;
}

export const PresentationSlidesView = ({
  isGeneratingPresentation,
  readOnly = false,
}: PresentationSlidesViewProps) => {
  const currentSlideIndex = usePresentationState((s) => s.currentSlideIndex);
  const isPresenting = usePresentationState((s) => s.isPresenting);
  const nextSlide = usePresentationState((s) => s.nextSlide);
  const previousSlide = usePresentationState((s) => s.previousSlide);
  const setShouldShowExitHeader = usePresentationState(
    (s) => s.setShouldShowExitHeader,
  );
  const currentPresentationTitle = usePresentationState(
    (s) => s.currentPresentationTitle,
  );
  const shouldShowExitHeader = usePresentationState(
    (s) => s.shouldShowExitHeader,
  );
  const { items, sensors, handleDragEnd } = usePresentationSlides();

  // Use the slide change watcher to automatically save changes (only when not read-only)
  useSlideChangeWatcher({ debounceDelay: 600, enabled: !readOnly });

  // Handle keyboard navigation in presentation mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPresenting) return;
      if (event.key === "ArrowRight" || event.key === "Space") {
        nextSlide();
      } else if (event.key === "ArrowLeft") {
        previousSlide();
      } else if (event.key === "Escape") {
        usePresentationState.getState().setIsPresenting(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, previousSlide, isPresenting]);

  // Handle showing header on mouse move
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isPresenting) return; // Only show header when in presentation mode

      if (event.clientY < 100) {
        setShouldShowExitHeader(true);
      } else {
        setShouldShowExitHeader(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isPresenting]);

  // In read-only mode, render without DndContext for sorting
  const renderSlides = () => (
    <PlateController>
      {!readOnly && <GlobalUndoRedoHandler />}

      {items.map((slide, index) => (
        <div
          key={slide.id}
          className={`slide-wrapper slide-wrapper-${index} w-full`}
        >
          <SlideContainer
            index={index}
            id={slide.id}
            slideWidth={slide.width}
            slidesCount={items.length}
            isReadOnly={readOnly}
          >
            <div
              className={cn(
                `slide-container-${index}`,
                isPresenting && "h-screen w-screen",
              )}
            >
              <PresentationEditor
                initialContent={slide}
                className={cn(
                  "min-h-[300px] rounded-md border",
                  isPresenting && "h-screen w-screen",
                )}
                id={slide.id}
                autoFocus={!readOnly && index === currentSlideIndex}
                slideIndex={index}
                isGenerating={isGeneratingPresentation}
                readOnly={readOnly || isPresenting}
              />
            </div>
          </SlideContainer>
        </div>
      ))}
    </PlateController>
  );

  return (
    <>
      <PresentModeHeader
        presentationTitle={currentPresentationTitle}
        showHeader={isPresenting && shouldShowExitHeader}
      />

      <ThinkingDisplay
        thinking={usePresentationState.getState().presentationThinking}
        isGenerating={isGeneratingPresentation}
        title="AI is thinking about your presentation..."
      />

      {readOnly ? (
        // Read-only mode: no drag-drop sorting
        renderSlides()
      ) : (
        // Edit mode: with drag-drop sorting
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {renderSlides()}
          </SortableContext>
        </DndContext>
      )}
    </>
  );
};

