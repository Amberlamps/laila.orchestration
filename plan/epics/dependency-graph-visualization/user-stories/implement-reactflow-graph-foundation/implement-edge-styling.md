# Implement Edge Styling

## Task Details

- **Title:** Implement Edge Styling
- **Status:** Not Started
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement ReactFlow Graph Foundation](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** Set Up ReactFlow with Dagre Layout

## Description

Style the dependency edges in the ReactFlow graph with curved arrow connectors, status-aware coloring, hover highlights, and animated edges for in-progress items. Edges visually represent the dependency relationships between tasks in the DAG.

### Edge Configuration

```typescript
// apps/web/src/lib/graph/edge-config.ts
// Default edge styling and configuration for the dependency graph.
// Defines edge appearance for normal, hovered, and active states.

import { MarkerType, type Edge, type EdgeProps } from "@xyflow/react";

/**
 * Default edge style:
 * - type: "smoothstep" (curved step edges following the grid)
 * - stroke: zinc-300 (#d4d4d8) for default state
 * - strokeWidth: 1.5
 * - markerEnd: ArrowClosed marker in zinc-300
 * - animated: false by default
 *
 * Highlighted edge style (when source or target node is hovered/selected):
 * - stroke: indigo-500 (#6366f1)
 * - strokeWidth: 2
 * - markerEnd: ArrowClosed marker in indigo-500
 * - z-index elevated above other edges
 *
 * In-progress edge style (when source node has status "in_progress"):
 * - animated: true (ReactFlow's built-in dash animation)
 * - stroke: blue-500 (#3b82f6)
 * - markerEnd: ArrowClosed marker in blue-500
 */
```

### Custom Edge Component (Optional)

```typescript
// apps/web/src/components/project/graph/edges/dependency-edge.tsx
// Optional custom edge component for advanced styling.
// Uses ReactFlow's BaseEdge with SmoothStepEdge path computation.

import { memo } from "react";
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

/**
 * DependencyEdge renders:
 *
 * - SmoothStep path between source and target nodes
 * - Default: zinc-300 stroke, 1.5px width
 * - Highlighted: indigo-500 stroke, 2px width (when connected
 *   node is hovered or selected)
 * - Animated: dashed animation for in-progress dependencies
 * - Arrow marker at the target end
 *
 * The custom edge component is optional — ReactFlow's built-in
 * "smoothstep" edge type with style overrides may be sufficient.
 * Use a custom component only if more control is needed (e.g.,
 * edge labels or click handlers).
 */
```

### Edge Highlight on Node Hover

```typescript
// apps/web/src/hooks/use-edge-highlight.ts
// Hook that highlights edges connected to a hovered or selected node.
// Updates edge styles dynamically based on node interaction state.

import { useCallback, useMemo } from "react";
import type { Edge, Node } from "@xyflow/react";

/**
 * useEdgeHighlight(edges: Edge[], hoveredNodeId: string | null, selectedNodeId: string | null):
 *   Edge[]
 *
 * Returns a new edges array with updated styles:
 * 1. Find all edges where source or target matches hoveredNodeId or selectedNodeId
 * 2. For matching edges: apply highlighted style (indigo-500, wider stroke)
 * 3. For non-matching edges: apply default style (zinc-300, standard stroke)
 *
 * Uses useMemo to avoid recomputing on every render.
 * Only recomputes when edges, hoveredNodeId, or selectedNodeId change.
 */
```

### Node Hover Tracking

```typescript
// The graph container tracks which node is being hovered
// using ReactFlow's onNodeMouseEnter and onNodeMouseLeave callbacks.

/**
 * const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
 *
 * <ReactFlow
 *   onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
 *   onNodeMouseLeave={() => setHoveredNodeId(null)}
 *   edges={highlightedEdges}
 *   ...
 * />
 */
```

## Acceptance Criteria

- [ ] Edges render as smooth-step curved connectors between nodes
- [ ] Default edge color is zinc-300 with 1.5px stroke width
- [ ] Edges have an ArrowClosed marker at the target end
- [ ] When a node is hovered, all connected edges (incoming and outgoing) highlight to indigo-500 with 2px stroke
- [ ] When a node is selected, all connected edges highlight to indigo-500 with 2px stroke
- [ ] Edge highlight is removed when the node is no longer hovered or selected
- [ ] Edges connected to in-progress nodes use ReactFlow's animated property (dashed animation)
- [ ] In-progress edges use blue-500 color to match the in-progress status color
- [ ] Edge highlighting uses `useMemo` for performance — only recomputes when hover/selection state changes
- [ ] Node hover state is tracked via ReactFlow's `onNodeMouseEnter` and `onNodeMouseLeave` callbacks
- [ ] Edge z-index is elevated for highlighted edges so they appear above non-highlighted edges
- [ ] Edge component is memoized with `memo()` if using a custom edge component
- [ ] No `any` types are used in the implementation

## Technical Notes

- ReactFlow's built-in "smoothstep" edge type provides curved step connectors that follow a grid pattern, appropriate for DAG visualization. This is specified via `type: "smoothstep"` on each edge object.
- Edge animation (`animated: true`) adds a CSS dashed-line animation to the edge path. This is built into ReactFlow and requires no custom CSS.
- For edge highlighting, the approach is to maintain a `hoveredNodeId` state and recompute edge styles using `useMemo`. Alternatively, use ReactFlow's `onEdgeMouseEnter`/`onEdgeMouseLeave` for edge-specific interactions.
- The `MarkerType.ArrowClosed` enum creates a filled arrowhead at the edge target. The marker color should match the edge stroke color.
- If using a custom edge component, register it via the `edgeTypes` prop on ReactFlow with a stable `useMemo` reference, similar to `nodeTypes`.

## References

- **ReactFlow:** Edge types, `smoothstep` edges, `animated` prop, `MarkerType` enum
- **ReactFlow Callbacks:** `onNodeMouseEnter`, `onNodeMouseLeave` for hover tracking
- **Colors:** Tailwind CSS v4 — zinc-300, indigo-500, blue-500

## Estimated Complexity

Medium — Edge styling with dynamic highlighting based on node interaction state. The hover tracking and edge recomputation require careful state management.
