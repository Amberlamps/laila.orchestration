/**
 * Hook that manages fullscreen state for a given element ref.
 *
 * Wraps the browser Fullscreen API with React state management.
 * Listens for the "fullscreenchange" event to keep state in sync
 * with both programmatic and user-initiated fullscreen changes
 * (e.g. pressing Escape).
 *
 * @module use-fullscreen
 */
import { useCallback, useEffect, useState } from 'react';

import type { RefObject } from 'react';

interface UseFullscreenReturn {
  /** Whether the referenced element is currently in fullscreen mode. */
  isFullscreen: boolean;
  /** Toggles between entering and exiting fullscreen. */
  toggleFullscreen: () => void;
  /** Enters fullscreen mode for the referenced element. */
  enterFullscreen: () => void;
  /** Exits fullscreen mode. */
  exitFullscreen: () => void;
}

/**
 * Manages fullscreen state for a given element.
 *
 * @param elementRef - React ref pointing to the element to fullscreen.
 * @returns Fullscreen state and control methods.
 */
export const useFullscreen = (elementRef: RefObject<HTMLElement | null>): UseFullscreenReturn => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state with the actual fullscreen element on any fullscreen change.
  // Checks specifically that OUR element is the fullscreen element so the
  // toggle state cannot become incorrect when another element enters fullscreen.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === elementRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [elementRef]);

  // Exit fullscreen on unmount if OUR element is still the fullscreen element
  useEffect(() => {
    const element = elementRef.current;

    return () => {
      if (element !== null && document.fullscreenElement === element) {
        void document.exitFullscreen().catch(() => {
          // Swallow errors — element may already have been removed
        });
      }
    };
  }, [elementRef]);

  const enterFullscreen = useCallback(() => {
    const element = elementRef.current;
    if (element === null) return;

    void element.requestFullscreen().catch(() => {
      // Fullscreen request may be blocked if not triggered by a user gesture
    });
  }, [elementRef]);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement !== elementRef.current) return;

    void document.exitFullscreen().catch(() => {
      // Swallow errors — may already have exited
    });
  }, [elementRef]);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  return { isFullscreen, toggleFullscreen, enterFullscreen, exitFullscreen };
};
