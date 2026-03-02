# Implement Minimap Component

## Task Details

- **Title:** Implement Minimap Component
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Performance & Extras](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Add a ReactFlow minimap to the dependency graph visualization. The minimap provides a bird's-eye view of the entire graph and shows the current viewport position, allowing users to navigate large graphs by clicking or dragging on the minimap.

### Minimap Configuration

```typescript
// apps/web/src/components/project/graph/graph-minimap.tsx
// ReactFlow MiniMap component configured for the dependency graph.
// Positioned in the bottom-right corner of the graph canvas.

import { MiniMap } from "@xyflow/react";
import { statusHexColors } from "@/lib/graph/status-colors";

/**
 * GraphMinimap renders ReactFlow's built-in MiniMap component
 * with custom configuration:
 *
 * - Position: bottom-right corner of the graph canvas
 *   (ReactFlow handles this via CSS positioning)
 *
 * - Dimensions: 160px width x 100px height
 *   Style: { width: 160, height: 100 }
 *
 * - Node color: mapped to entity status color
 *   nodeColor function receives the node and returns the
 *   appropriate hex color based on node.data.status
 *
 * - Background: zinc-50 (#fafafa) for the minimap background
 *
 * - Mask: semi-transparent overlay on areas outside the current viewport
 *   maskColor: "rgba(0, 0, 0, 0.08)"
 *
 * - Border: 1px solid zinc-200, rounded-lg
 *
 * - Interactive: clicking on the minimap pans the viewport to that location
 *   (this is built-in ReactFlow behavior)
 *
 * - Zoomable: false (minimap shows the full graph at all times)
 */

export function GraphMinimap() {
  const nodeColor = (node: { data: { status: string } }) => {
    return statusHexColors[node.data.status] || statusHexColors.not_started;
  };

  return (
    <MiniMap
      style={{ width: 160, height: 100 }}
      nodeColor={nodeColor}
      maskColor="rgba(0, 0, 0, 0.08)"
      zoomable={false}
      pannable
    />
  );
}
```

### Integration

```typescript
// The MiniMap is rendered as a child of the ReactFlow component.
// ReactFlow positions it using absolute positioning.

/**
 * <ReactFlow ...>
 *   <Background />
 *   <GraphMinimap />
 *   <GraphCanvasControls />
 * </ReactFlow>
 */
```

## Acceptance Criteria

- [ ] A minimap is displayed in the bottom-right corner of the graph canvas
- [ ] Minimap dimensions are 160px wide by 100px tall
- [ ] Minimap shows all nodes in the graph as small colored rectangles
- [ ] Node colors on the minimap match entity status colors (green for completed, blue for in_progress, etc.)
- [ ] The current viewport is shown as a highlighted rectangle on the minimap
- [ ] Non-viewport areas are overlaid with a semi-transparent mask
- [ ] Clicking on the minimap pans the main graph to the clicked location
- [ ] Dragging on the minimap pans the main graph viewport
- [ ] Minimap background uses zinc-50 color
- [ ] Minimap has a 1px zinc-200 border with rounded corners
- [ ] Minimap is not zoomable (always shows the full graph)
- [ ] Minimap does not interfere with other graph controls (canvas controls, toolbar)
- [ ] No `any` types are used in the implementation

## Technical Notes

- ReactFlow's built-in `MiniMap` component handles all the minimap rendering and interactivity. This task is primarily configuration and styling.
- The `nodeColor` function receives a node object and should return a CSS color string. Use the `statusHexColors` map from the shared status colors module.
- The MiniMap component must be rendered as a child of the `ReactFlow` component — ReactFlow uses React context to provide the necessary graph data.
- The `pannable` prop enables dragging the viewport rectangle on the minimap to pan the main graph. The `zoomable` prop is set to `false` so the minimap always shows the full graph extent.

## References

- **ReactFlow:** MiniMap component — built-in graph overview with viewport indicator
- **Status Colors:** `statusHexColors` from `@/lib/graph/status-colors.ts`
- **Layout:** Bottom-right positioning handled by ReactFlow's CSS

## Estimated Complexity

Low — Uses ReactFlow's built-in MiniMap component with custom node color mapping. Primarily a configuration task.
