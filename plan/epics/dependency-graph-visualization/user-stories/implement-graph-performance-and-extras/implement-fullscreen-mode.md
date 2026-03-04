# Implement Fullscreen Mode

## Task Details

- **Title:** Implement Fullscreen Mode
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Performance & Extras](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement a fullscreen toggle for the dependency graph that expands the graph to fill the entire browser viewport. The graph toolbar (filters, controls) remains visible in fullscreen mode. Users can exit fullscreen via the Escape key or a dedicated exit button.

### Fullscreen Toggle Component

```typescript
// apps/web/src/components/project/graph/graph-fullscreen-toggle.tsx
// Button that toggles fullscreen mode for the graph container.
// Uses the browser Fullscreen API for native fullscreen behavior.

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * GraphFullscreenToggle:
 *
 * - Button in the graph canvas controls toolbar
 * - Icon: Maximize when not fullscreen, Minimize when fullscreen
 * - Tooltip: "Enter fullscreen" / "Exit fullscreen"
 * - Ghost variant, small size (consistent with other canvas controls)
 *
 * Fullscreen behavior:
 * - Uses the browser Fullscreen API (document.fullscreenElement,
 *   element.requestFullscreen(), document.exitFullscreen())
 * - Targets the graph container element (not the entire page)
 * - The graph container receives the fullscreen class
 *
 * Exit methods:
 * - Click the Minimize button
 * - Press Escape key (browser handles this natively via Fullscreen API)
 * - Browser's native fullscreen exit (F11 key)
 */
```

### Fullscreen Hook

```typescript
// apps/web/src/hooks/use-fullscreen.ts
// Hook that manages fullscreen state for a given element ref.
// Wraps the browser Fullscreen API with React state management.

import { useState, useCallback, useEffect } from 'react';

/**
 * useFullscreen(elementRef: RefObject<HTMLElement>):
 *   { isFullscreen: boolean, toggleFullscreen: () => void,
 *     enterFullscreen: () => void, exitFullscreen: () => void }
 *
 * State:
 * - isFullscreen: derived from document.fullscreenElement
 *
 * Methods:
 * - enterFullscreen(): calls elementRef.current.requestFullscreen()
 * - exitFullscreen(): calls document.exitFullscreen()
 * - toggleFullscreen(): enters or exits based on current state
 *
 * Effects:
 * - Listens for "fullscreenchange" event on document
 * - Updates isFullscreen state when fullscreen state changes
 * - Handles both user-initiated and programmatic fullscreen changes
 * - Calls fitView() on the ReactFlow instance when entering/exiting
 *   to re-fit the graph to the new container dimensions
 *
 * Cleanup:
 * - Removes "fullscreenchange" event listener on unmount
 * - Exits fullscreen if component unmounts while in fullscreen
 */
```

### Fullscreen Container Styling

```typescript
// The graph container receives special styling when in fullscreen mode.

/**
 * CSS/Tailwind classes for fullscreen state:
 *
 * Normal mode:
 * - Container has its standard height from the tab layout
 *   (e.g., min-h-[600px] or calculated from viewport)
 *
 * Fullscreen mode (applied via the Fullscreen API):
 * - Container fills the entire viewport: w-screen h-screen
 * - Background: bg-white (prevents transparency)
 * - The graph toolbar (filters, view toggle) remains visible
 *   at the top of the fullscreen container
 * - Canvas controls and minimap remain in their positions
 * - ReactFlow's fitView() is called to adjust to new dimensions
 *
 * The Fullscreen API applies the :fullscreen pseudo-class,
 * which can be targeted with CSS:
 * .graph-container:fullscreen { width: 100vw; height: 100vh; }
 */
```

## Acceptance Criteria

- [ ] A fullscreen toggle button is displayed in the graph canvas controls
- [ ] Button shows Maximize icon when not in fullscreen, Minimize when in fullscreen
- [ ] Tooltip displays "Enter fullscreen" / "Exit fullscreen" based on state
- [ ] Clicking the button enters fullscreen mode for the graph container
- [ ] In fullscreen mode, the graph fills the entire browser viewport
- [ ] Graph toolbar (filters, view toggle, controls) remains visible in fullscreen
- [ ] Canvas controls (zoom, fit-to-view) remain functional in fullscreen
- [ ] Minimap remains visible and functional in fullscreen
- [ ] Pressing Escape exits fullscreen mode (native browser behavior via Fullscreen API)
- [ ] Clicking the Minimize button exits fullscreen mode
- [ ] Graph calls `fitView()` when entering and exiting fullscreen to adjust to new dimensions
- [ ] The fullscreen hook properly cleans up event listeners on unmount
- [ ] Fullscreen state is tracked via the `fullscreenchange` event for reliable state synchronization
- [ ] No `any` types are used in the implementation

## Technical Notes

- The Fullscreen API (`element.requestFullscreen()`, `document.exitFullscreen()`) is supported in all modern browsers. The graph container element is targeted (not `document.documentElement`) so only the graph fills the screen, not the entire page.
- The `:fullscreen` CSS pseudo-class can be used for fullscreen-specific styling. In Tailwind CSS, this can be achieved with a custom variant or by applying classes conditionally based on the `isFullscreen` state.
- When the container dimensions change (entering/exiting fullscreen), ReactFlow may not automatically re-render to fill the new space. Calling `fitView()` after a short delay (`requestAnimationFrame` or `setTimeout(0)`) ensures the graph adjusts.
- The `useFullscreen` hook should handle the case where `requestFullscreen()` fails (e.g., if the browser blocks it due to missing user gesture). Use a try-catch and fall back gracefully.

## References

- **Fullscreen API:** `element.requestFullscreen()`, `document.exitFullscreen()`, `fullscreenchange` event (MDN)
- **ReactFlow:** `fitView()` from `useReactFlow()` hook
- **Design System:** Button (ghost variant), Tooltip from shadcn/ui
- **Icons:** Lucide React — Maximize, Minimize

## Estimated Complexity

Medium — Browser Fullscreen API integration with React state management, dimension change handling, and fitView synchronization.
