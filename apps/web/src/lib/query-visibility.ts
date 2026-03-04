/**
 * Integrates the Page Visibility API with TanStack Query's focus management.
 *
 * Overrides the default event listener with a `visibilitychange`-based handler
 * that passes an explicit boolean to `focusManager.setFocused()`, ensuring:
 *
 * - Polling pauses when the tab is hidden (`refetchIntervalInBackground: false`
 *   takes effect because `focusManager` reports unfocused).
 * - Polling resumes *and* an immediate refetch fires when the tab becomes
 *   visible again (`refetchOnWindowFocus: true` triggers).
 * - Multi-monitor setups work correctly -- `visibilitychange` fires based on
 *   tab visibility, not OS-level window focus.
 */

import { focusManager } from '@tanstack/react-query';

/**
 * Configure TanStack Query's `focusManager` to use the Page Visibility API
 * instead of the default focus/blur events.
 *
 * Call once at app startup (e.g. inside a `useEffect` in `_app.tsx`).
 *
 * @returns A cleanup function that removes the `visibilitychange` listener.
 */
export const setupVisibilityIntegration = (): (() => void) => {
  // focusManager.setEventListener replaces the default listener with our
  // custom one. The setup callback receives a `handleFocus` function and
  // returns an optional cleanup. TanStack Query stores the cleanup internally
  // and invokes it when setEventListener is called again.
  //
  // We additionally capture a reference to the handler so we can provide an
  // explicit teardown function for use in React's useEffect cleanup.

  let handler: (() => void) | undefined;

  focusManager.setEventListener((handleFocus) => {
    const onVisibilityChange = (): void => {
      handleFocus(document.visibilityState === 'visible');
    };

    handler = onVisibilityChange;
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });

  return () => {
    if (handler) {
      document.removeEventListener('visibilitychange', handler);
    }
  };
};
