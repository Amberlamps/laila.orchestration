# Implement Hover Tooltips

## Task Details

- **Title:** Implement Hover Tooltips
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Interactivity](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement hover tooltips on graph nodes that display detailed entity information when the user hovers over a node. The tooltip shows the full entity title (not truncated), status, parent epic/story, dependency count, and assigned worker (if applicable).

### Tooltip Component

```typescript
// apps/web/src/components/project/graph/graph-node-tooltip.tsx
// Tooltip component displayed when hovering over a graph node.
// Positioned near the hovered node with smart placement.

import { StatusBadge } from '@/components/ui/status-badge';
import { Bot, ArrowDown, ArrowUp, Layers, BookOpen } from 'lucide-react';
import type { GraphNodeData } from '@laila/shared';

/**
 * GraphNodeTooltip renders:
 *
 * - Container: bg-white, shadow-lg, rounded-lg, border, p-3
 *   - Max width: max-w-xs (320px)
 *   - Pointer events: none (so tooltip doesn't interfere with mouse)
 *   - Z-index: above all graph elements
 *
 * - Content:
 *   1. Full title (not truncated)
 *      - text-sm, font-semibold, text-zinc-900
 *      - Word wrap for long titles
 *
 *   2. Status badge (compact)
 *      - Uses StatusBadge component
 *
 *   3. Parent info (if applicable):
 *      - "Epic: {epicName}" for stories and tasks
 *      - "Story: {storyName}" for tasks
 *      - Layers/BookOpen icon prefix, text-xs, text-zinc-500
 *
 *   4. Dependency counts:
 *      - "X dependencies" (ArrowUp icon — upstream deps)
 *      - "X dependents" (ArrowDown icon — downstream deps)
 *      - text-xs, text-zinc-500
 *
 *   5. Assigned worker (if applicable):
 *      - "Worker: {workerName}" with Bot icon
 *      - Only shown for in-progress stories/tasks
 *      - text-xs, text-zinc-600
 *
 * Sections separated by dividers (border-t, my-1.5).
 */
```

### Tooltip Positioning

```typescript
// apps/web/src/hooks/use-graph-tooltip.ts
// Hook that manages tooltip visibility and position based on node hover.

import { useState, useCallback, useRef } from 'react';
import type { Node } from '@xyflow/react';

/**
 * useGraphTooltip():
 *   { tooltipData, tooltipPosition, onNodeMouseEnter, onNodeMouseLeave }
 *
 * State:
 * - tooltipData: GraphNodeData | null (data to display in tooltip)
 * - tooltipPosition: { x: number, y: number } (screen coordinates)
 *
 * onNodeMouseEnter(event, node):
 * - Sets tooltipData from node.data
 * - Computes screen position from mouse event coordinates
 * - Offsets tooltip by 16px right and 16px down from cursor
 * - Ensures tooltip stays within viewport bounds
 *
 * onNodeMouseLeave():
 * - Clears tooltipData (hides tooltip)
 *
 * Debounce: 150ms delay before showing tooltip
 * to avoid flickering during rapid mouse movement.
 */
```

### Integration

```typescript
// The tooltip integrates with the graph container via
// ReactFlow's onNodeMouseEnter and onNodeMouseLeave callbacks.

/**
 * const {
 *   tooltipData,
 *   tooltipPosition,
 *   onNodeMouseEnter,
 *   onNodeMouseLeave,
 * } = useGraphTooltip();
 *
 * <ReactFlow
 *   onNodeMouseEnter={onNodeMouseEnter}
 *   onNodeMouseLeave={onNodeMouseLeave}
 *   ...
 * />
 * {tooltipData && (
 *   <GraphNodeTooltip
 *     data={tooltipData}
 *     position={tooltipPosition}
 *   />
 * )}
 */
```

## Acceptance Criteria

- [ ] Hovering over a node displays a tooltip with detailed entity information
- [ ] Tooltip shows the full entity title (not truncated to 30 characters)
- [ ] Tooltip shows the current status via a StatusBadge component
- [ ] Tooltip shows the parent epic name for stories and tasks
- [ ] Tooltip shows the parent story name for tasks
- [ ] Tooltip shows the upstream dependency count with ArrowUp icon
- [ ] Tooltip shows the downstream dependent count with ArrowDown icon
- [ ] Tooltip shows the assigned worker name with Bot icon for in-progress entities
- [ ] Tooltip appears with a 150ms delay to prevent flickering during rapid mouse movement
- [ ] Tooltip disappears when the mouse leaves the node
- [ ] Tooltip is positioned near the cursor with 16px offset, within viewport bounds
- [ ] Tooltip has white background, shadow, rounded corners, and border styling
- [ ] Tooltip does not interfere with mouse events (pointer-events: none)
- [ ] Tooltip content sections are separated by subtle dividers
- [ ] No `any` types are used in the implementation

## Technical Notes

- The tooltip is rendered as an absolutely-positioned element outside the ReactFlow canvas but within the graph container's coordinate space. Use the mouse event's `clientX`/`clientY` for screen-space positioning.
- The 150ms debounce prevents tooltip flickering when the user moves the mouse quickly across nodes. Use a `setTimeout`/`clearTimeout` pattern in the hover handler.
- Viewport boundary detection: if the tooltip would extend beyond the right edge of the viewport, position it to the left of the cursor instead. Similarly for the bottom edge.
- The tooltip data (dependency counts, parent names, worker assignment) should be included in the node data during the data transformation step, so no additional API calls are needed on hover.

## References

- **ReactFlow:** `onNodeMouseEnter`, `onNodeMouseLeave` callback props
- **Design System:** StatusBadge from Epic 8
- **Icons:** Lucide React — Bot, ArrowUp, ArrowDown, Layers, BookOpen
- **UX Pattern:** Tooltip positioning with viewport boundary detection

## Estimated Complexity

Medium — Tooltip component with rich content, debounced hover state management, and viewport-aware positioning logic.
