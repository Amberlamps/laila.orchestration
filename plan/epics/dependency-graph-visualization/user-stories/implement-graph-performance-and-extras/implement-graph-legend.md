# Implement Graph Legend

## Task Details

- **Title:** Implement Graph Legend
- **Status:** Not Started
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Graph Performance & Extras](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement an always-visible legend for the dependency graph that displays the status color mappings. The legend helps users understand what each node color represents without needing to hover over individual nodes.

### Graph Legend Component

```typescript
// apps/web/src/components/project/graph/graph-legend.tsx
// Always-visible legend showing status color and label pairs.
// Positioned below or beside the graph canvas.

import { statusHexColors } from "@/lib/graph/status-colors";

/**
 * GraphLegend renders:
 *
 * - Container: horizontal flex row, centered, gap-4
 *   - Positioned below the graph canvas (or at the bottom of the
 *     graph container, above the minimap)
 *   - Background: bg-white/80, backdrop-blur-sm for subtle transparency
 *   - Padding: px-4 py-2
 *   - Border: border-t border-zinc-200 (top border only)
 *
 * - Legend items (one per status):
 *   - Small colored circle (w-3 h-3, rounded-full) in status color
 *   - Status label (text-xs, text-zinc-600):
 *     - "Not Started" — zinc-400
 *     - "In Progress" — blue-500
 *     - "Completed" — emerald-500
 *     - "Blocked" — amber-500
 *     - "Failed" — red-500
 *
 * - Layout:
 *   - Desktop: single horizontal row with all items
 *   - Mobile: wraps to multiple rows (flex-wrap)
 *   - Items are evenly distributed with gap-4 spacing
 *
 * - Always visible — not toggleable or collapsible
 * - Does not scroll — stays fixed at the bottom of the graph area
 */

const legendItems = [
  { status: "not_started", label: "Not Started", color: "#a1a1aa" },
  { status: "in_progress", label: "In Progress", color: "#3b82f6" },
  { status: "completed", label: "Completed", color: "#10b981" },
  { status: "blocked", label: "Blocked", color: "#f59e0b" },
  { status: "failed", label: "Failed", color: "#ef4444" },
];
```

### Integration

```typescript
// The legend is rendered below the ReactFlow component
// within the graph container.

/**
 * <div className="graph-container">
 *   <GraphToolbar />
 *   <ReactFlow ...>
 *     <Background />
 *     <GraphMinimap />
 *   </ReactFlow>
 *   <GraphLegend />
 * </div>
 */
```

## Acceptance Criteria

- [ ] A legend is displayed at the bottom of the graph container
- [ ] Legend shows 5 status items: Not Started, In Progress, Completed, Blocked, Failed
- [ ] Each item has a small colored circle (w-3, h-3, rounded-full) in the appropriate status color
- [ ] Each item has a text label next to the colored circle
- [ ] Legend items are arranged in a horizontal row with gap-4 spacing
- [ ] Legend wraps to multiple rows on narrow screens (flex-wrap)
- [ ] Legend has a subtle top border (border-t, border-zinc-200) separating it from the graph canvas
- [ ] Legend uses semi-transparent background (bg-white/80 with backdrop-blur-sm)
- [ ] Legend is always visible and is not toggleable or collapsible
- [ ] Status colors in the legend match the colors used for node borders in the graph
- [ ] Legend remains visible in fullscreen mode
- [ ] Text labels use text-xs and text-zinc-600 for subtle, non-distracting appearance
- [ ] No `any` types are used in the implementation

## Technical Notes

- The legend is a simple presentational component with no state or data fetching. It uses the same `statusHexColors` map that the graph nodes and minimap use for color consistency.
- The legend is positioned outside the ReactFlow component (below it) within the graph container. This prevents it from being affected by graph pan/zoom interactions.
- The `bg-white/80 backdrop-blur-sm` provides a subtle glass-morphism effect that allows the graph to show through slightly while keeping the legend readable.
- In fullscreen mode, the legend's position (at the bottom of the container) should be preserved. Since it is part of the graph container that goes fullscreen, it will naturally be included.

## References

- **Status Colors:** `statusHexColors` from `@/lib/graph/status-colors.ts`
- **Design Pattern:** Chart legend — standard visualization element for color mapping
- **Styling:** Tailwind CSS v4 — flex, gap, border, backdrop-blur

## Estimated Complexity

Low — Simple presentational component with no state, data fetching, or complex logic. Just a styled list of color-label pairs.
