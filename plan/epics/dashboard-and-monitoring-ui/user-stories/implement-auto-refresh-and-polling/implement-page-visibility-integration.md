# Implement Page Visibility Integration

## Task Details

- **Title:** Implement Page Visibility Integration
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Auto-Refresh & Polling](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** Configure Polling for Dashboard Views

## Description

Integrate the browser's Page Visibility API with TanStack Query's polling configuration to intelligently pause polling when the browser tab is not visible and resume it when the user returns. On focus, trigger an immediate refresh to ensure the user always sees current data.

### Visibility-Aware Query Provider

```typescript
// apps/web/src/lib/query-visibility.ts
// Integrates Page Visibility API with TanStack Query's focus management.
// Ensures polling pauses when the tab is hidden and resumes on visibility.

import { focusManager } from '@tanstack/react-query';

/**
 * setupVisibilityIntegration():
 *
 * Configures TanStack Query's focusManager to use the
 * Page Visibility API for detecting tab focus state.
 *
 * Implementation:
 * 1. Override focusManager.setEventListener to use "visibilitychange" event
 *    instead of the default "focus"/"blur" events.
 *
 * 2. When document.visibilityState === "hidden":
 *    - focusManager.setFocused(false)
 *    - This causes refetchIntervalInBackground: false to take effect,
 *      pausing all polling queries.
 *
 * 3. When document.visibilityState === "visible":
 *    - focusManager.setFocused(true)
 *    - Combined with refetchOnWindowFocus: true, this triggers
 *      an immediate refetch of all active queries.
 *
 * 4. Cleanup: return a function that removes the event listener,
 *    for use in the app's unmount lifecycle.
 */

export function setupVisibilityIntegration(): () => void {
  // Set up the custom event listener using Page Visibility API.
  // This provides more reliable tab visibility detection than
  // the default focus/blur events, especially in multi-monitor setups.

  const callback = focusManager.setEventListener((handleFocus) => {
    const visibilityChangeHandler = () => {
      handleFocus(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', visibilityChangeHandler);

    return () => {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
    };
  });

  return callback;
}
```

### App Integration

```typescript
// apps/web/src/pages/_app.tsx
// Initialize visibility integration in the Next.js App component.
// Must be called once at app startup.

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupVisibilityIntegration } from '@/lib/query-visibility';

/**
 * In the App component:
 *
 * useEffect(() => {
 *   const cleanup = setupVisibilityIntegration();
 *   return cleanup;
 * }, []);
 *
 * This ensures:
 * - Visibility tracking starts when the app mounts
 * - Event listeners are cleaned up on unmount
 * - Polling behavior is consistent across all pages
 */
```

### Online Status Integration

```typescript
// apps/web/src/lib/query-online.ts
// Optional: integrate browser online/offline status with TanStack Query.
// Pauses all queries when the browser goes offline.

import { onlineManager } from '@tanstack/react-query';

/**
 * setupOnlineIntegration():
 *
 * Configures TanStack Query's onlineManager to detect
 * browser online/offline state. When offline:
 * - All queries are paused (no network requests)
 * - Mutations are queued for retry when online
 *
 * When back online:
 * - All paused queries are resumed and refetched
 * - Queued mutations are retried
 *
 * Uses navigator.onLine and "online"/"offline" window events.
 */
```

## Acceptance Criteria

- [ ] Polling pauses when the browser tab becomes hidden (document.visibilityState === "hidden")
- [ ] Polling resumes when the browser tab becomes visible (document.visibilityState === "visible")
- [ ] An immediate refetch of all active queries is triggered when the tab regains visibility
- [ ] The visibility integration uses the Page Visibility API ("visibilitychange" event) rather than focus/blur events
- [ ] TanStack Query's `focusManager` is configured with a custom event listener for visibility changes
- [ ] The integration is initialized once in `_app.tsx` on app mount
- [ ] Event listeners are properly cleaned up on app unmount
- [ ] The integration works correctly with the 15-second polling interval from the polling configuration task
- [ ] The integration works correctly in multi-monitor setups where a tab may be visible but not focused
- [ ] No `any` types are used in the implementation

## Technical Notes

- The Page Visibility API (`document.visibilityState` and the `visibilitychange` event) is more reliable than `window.focus`/`window.blur` for detecting whether the user can see the tab. Focus/blur events can fire in unexpected scenarios (e.g., interacting with browser DevTools).
- TanStack Query v5's `focusManager.setEventListener()` accepts a callback that receives a `handleFocus` function. The callback should set up the event listener and return a cleanup function.
- `refetchOnWindowFocus: true` (already configured in the polling task) works in conjunction with the focusManager — when focusManager detects the tab is focused again, all queries with `refetchOnWindowFocus: true` will immediately refetch.
- The online status integration is optional but recommended for robustness. TanStack Query's default online detection using `navigator.onLine` is usually sufficient.

## References

- **Page Visibility API:** `document.visibilityState`, `visibilitychange` event (MDN)
- **TanStack Query v5:** `focusManager.setEventListener()`, `onlineManager`, `refetchOnWindowFocus`
- **Next.js:** `_app.tsx` component lifecycle for app-wide initialization
- **Browser API:** `navigator.onLine`, `online`/`offline` window events

## Estimated Complexity

Low — Small utility function with event listener setup. The main consideration is ensuring proper cleanup and understanding TanStack Query's focus management internals.
