import { usePresentationState } from "@/states/presentation-state";
import { useEffect } from "react";
import { useDebouncedSave } from "./useDebouncedSave";

interface UseSlideChangeWatcherOptions {
  /**
   * The delay in milliseconds before triggering a save.
   * @default 1000
   */
  debounceDelay?: number;
  /**
   * Whether the watcher is enabled. When false, no saves will be triggered.
   * @default true
   */
  enabled?: boolean;
}

/**
 * A hook that watches for changes to the slides and triggers
 * a debounced save function whenever changes are detected.
 */
export const useSlideChangeWatcher = (
  options: UseSlideChangeWatcherOptions = {},
) => {
  const { debounceDelay = 1000, enabled = true } = options;
  const slides = usePresentationState((s) => s.slides);
  const isGeneratingPresentation = usePresentationState(
    (s) => s.isGeneratingPresentation,
  );
  const { save, saveImmediately } = useDebouncedSave({ delay: debounceDelay });

  // Watch for changes to the slides array and trigger save
  useEffect(() => {
    // Only save if enabled, we have slides, and we're not generating
    if (enabled && slides.length > 0) {
      save();
    }
  }, [slides, save, isGeneratingPresentation, enabled]);

  return {
    saveImmediately,
  };
};

