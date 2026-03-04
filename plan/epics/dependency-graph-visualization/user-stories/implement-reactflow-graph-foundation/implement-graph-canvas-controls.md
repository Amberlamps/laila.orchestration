# Implement Graph Canvas Controls

## Task Details

- **Title:** Implement Graph Canvas Controls
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement ReactFlow Graph Foundation](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** Set Up ReactFlow with Dagre Layout

## Description

Implement canvas control buttons for the dependency graph: zoom in, zoom out, zoom percentage display, pan (click-drag, which is default ReactFlow behavior), fit-to-view button, and reset button. Controls are rendered as a floating toolbar on the graph canvas.

### Canvas Controls Component

```typescript
// apps/web/src/components/project/graph/graph-canvas-controls.tsx
// Floating toolbar with zoom and navigation controls for the graph canvas.
// Uses ReactFlow's useReactFlow hook for programmatic zoom and pan.

import { useCallback } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

/**
 * GraphCanvasControls renders a floating toolbar:
 *
 * Position: bottom-left of the graph canvas
 * Layout: horizontal button group with dividers
 * Background: bg-white, shadow-md, rounded-lg, border
 *
 * Buttons:
 * 1. Zoom Out (-)
 *    - Icon: ZoomOut (16px)
 *    - onClick: zoomOut() from useReactFlow
 *    - Disabled when zoom <= 0.1 (minimum zoom)
 *
 * 2. Zoom Percentage Display
 *    - Shows current zoom level as percentage (e.g., "100%")
 *    - Font: text-sm, font-mono (JetBrains Mono)
 *    - Reads from useViewport().zoom * 100
 *    - Not a button — display only, min-width for stability
 *
 * 3. Zoom In (+)
 *    - Icon: ZoomIn (16px)
 *    - onClick: zoomIn() from useReactFlow
 *    - Disabled when zoom >= 2.0 (maximum zoom)
 *
 * 4. Divider (vertical line, h-6, border-l, mx-1)
 *
 * 5. Fit to View
 *    - Icon: Maximize2 (16px)
 *    - onClick: fitView({ padding: 0.2, duration: 300 })
 *    - Animates the viewport to show all nodes
 *
 * 6. Reset
 *    - Icon: RotateCcw (16px)
 *    - onClick: fitView({ padding: 0.2, duration: 300 })
 *      + reset any filters/selections
 *    - Restores the graph to its initial state
 *
 * All buttons: ghost variant, size sm, with Tooltip on hover
 * showing the action name.
 */
```

### Zoom Constraints

```typescript
// Configure min/max zoom on the ReactFlow component.

/**
 * <ReactFlow
 *   minZoom={0.1}
 *   maxZoom={2.0}
 *   defaultViewport={{ x: 0, y: 0, zoom: 1 }}
 *   ...
 * />
 *
 * Zoom step: each zoomIn()/zoomOut() call changes zoom by 0.2x
 * (ReactFlow default). Can be customized via options parameter:
 * zoomIn({ duration: 200 }), zoomOut({ duration: 200 })
 */
```

### Keyboard Shortcuts

```typescript
// Optional keyboard shortcut support for graph navigation.

/**
 * Keyboard shortcuts (handled by ReactFlow's built-in support):
 * - Ctrl/Cmd + Scroll: zoom in/out
 * - Click + Drag: pan the canvas
 * - Ctrl/Cmd + 0: fit to view (custom)
 *
 * ReactFlow handles scroll-to-zoom and click-to-pan by default.
 * Custom keyboard shortcuts can be added via useEffect with
 * keydown event listeners.
 */
```

## Acceptance Criteria

- [ ] A floating control toolbar is rendered at the bottom-left of the graph canvas
- [ ] Toolbar has white background, shadow, rounded corners, and border styling
- [ ] Zoom Out button decreases zoom level and is disabled at minimum zoom (0.1x)
- [ ] Zoom In button increases zoom level and is disabled at maximum zoom (2.0x)
- [ ] Current zoom percentage is displayed between zoom buttons in JetBrains Mono font
- [ ] Zoom percentage updates in real-time as the user zooms via scroll or buttons
- [ ] Fit to View button animates the viewport to show all nodes with 0.2 padding
- [ ] Reset button restores the graph to its initial viewport state
- [ ] All buttons use ghost variant styling with Lucide icons (16px)
- [ ] Each button has a Tooltip showing the action name on hover
- [ ] Pan functionality works via click-and-drag on the canvas (ReactFlow default)
- [ ] Scroll-to-zoom works via Ctrl/Cmd + scroll wheel (ReactFlow default)
- [ ] ReactFlow is configured with `minZoom={0.1}` and `maxZoom={2.0}`
- [ ] No `any` types are used in the implementation

## Technical Notes

- ReactFlow's `useReactFlow()` hook provides `zoomIn()`, `zoomOut()`, `fitView()`, and `setViewport()` methods for programmatic viewport control.
- The `useViewport()` hook returns the current `{ x, y, zoom }` state and updates on every viewport change.
- The zoom percentage display should use `Math.round(zoom * 100)` for clean integer display.
- The toolbar should use `position: absolute` within the ReactFlow container, with `z-index` above the graph but below tooltips/modals.
- ReactFlow's built-in `Controls` component exists but is replaced here with a custom implementation for consistent design system styling.

## References

- **ReactFlow:** `useReactFlow()` hook, `useViewport()` hook, `fitView()` method
- **Design System:** Button (ghost variant), Tooltip from shadcn/ui
- **Icons:** Lucide React — ZoomIn, ZoomOut, Maximize2, RotateCcw
- **Fonts:** JetBrains Mono for zoom percentage display

## Estimated Complexity

Low-Medium — Uses ReactFlow's built-in viewport control API. The main work is creating a well-styled toolbar component with proper disabled states and responsive zoom display.
