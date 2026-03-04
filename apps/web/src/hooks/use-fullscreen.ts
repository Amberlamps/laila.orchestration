'use client';

import { useCallback, useEffect, useState } from 'react';

import type { RefObject } from 'react';

/**
 * Return type for the useFullscreen hook.
 */
interface UseFullscreenReturn {
  /** Whether the referenced element is currently in fullscreen mode. */
  isFullscreen: boolean;
  /** Toggles fullscreen mode on/off for the referenced element. */
  toggleFullscreen: () => void;
  /** Enters fullscreen mode for the referenced element. */
  enterFullscreen: () => void;
  /** Exits fullscreen mode. */
  exitFullscreen: () => void;
}

/**
 * Hook that manages fullscreen state for a given element ref.
 *
 * Wraps the browser Fullscreen API with React state management.
 * Listens for the "fullscreenchange" event to keep state in sync
 * with both programmatic and user-initiated fullscreen changes
 * (e.g. pressing Escape).
 *
 * Cleanup:
 * - Removes the "fullscreenchange" event listener on unmount.
 * - Exits fullscreen if the component unmounts while in fullscreen.
 */
export function useFullscreen(elementRef: RefObject<HTMLDivElement | null>): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state with the actual fullscreen element
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === elementRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);

      // Exit fullscreen only if this component's element is the fullscreen element
      if (document.fullscreenElement === elementRef.current) {
        void document.exitFullscreen();
      }
    };
  }, [elementRef]);

  const enterFullscreen = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;

    try {
      void element.requestFullscreen();
    } catch {
      // Gracefully handle if requestFullscreen fails
      // (e.g. missing user gesture or unsupported browser)
    }
  }, [elementRef]);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement === null) return;

    try {
      void document.exitFullscreen();
    } catch {
      // Gracefully handle if exitFullscreen fails
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  return { isFullscreen, toggleFullscreen, enterFullscreen, exitFullscreen };
}
