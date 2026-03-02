# Set Up ReactFlow with Dagre Layout

## Task Details

- **Title:** Set Up ReactFlow with Dagre Layout
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement ReactFlow Graph Foundation](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None

## Description

Install and configure ReactFlow and @dagrejs/dagre for rendering an interactive top-to-bottom DAG (Directed Acyclic Graph) of task dependencies within a project. Create the graph container component that will be rendered in the project detail Graph tab. Implement the data transformation layer that converts task dependency data from the API into ReactFlow-compatible node and edge arrays.

### Package Installation

```bash
# Install ReactFlow for interactive graph rendering
# and @dagrejs/dagre for automatic DAG layout computation.
pnpm add @xyflow/react @dagrejs/dagre
```

### Graph Container Component

```typescript
// apps/web/src/components/project/graph/dependency-graph-container.tsx
// Main container component for the dependency graph visualization.
// Wraps ReactFlow with the Dagre-computed layout.

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { projectKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api-client";
import { computeDagreLayout } from "@/lib/graph/dagre-layout";
import { transformToGraphData } from "@/lib/graph/transform-graph-data";
import type { TaskDependencyGraph } from "@laila/shared";

/**
 * DependencyGraphContainer:
 *
 * 1. Fetches task dependency data from the API:
 *    GET /api/v1/projects/:id/graph
 *    Returns: { nodes: TaskNode[], edges: DependencyEdge[] }
 *
 * 2. Transforms API data into ReactFlow format:
 *    - Each task becomes a ReactFlow Node with position { x, y }
 *    - Each dependency becomes a ReactFlow Edge with source and target IDs
 *
 * 3. Computes layout using Dagre:
 *    - Direction: top-to-bottom (TB)
 *    - Node separation: 50px horizontal, 80px vertical
 *    - Rank separation: 100px
 *
 * 4. Renders ReactFlow with:
 *    - Background: dots pattern (BackgroundVariant.Dots)
 *    - fitView on initial render
 *    - Nodes and edges from computed layout
 *    - Custom node types registered
 *
 * Must be wrapped in ReactFlowProvider at the page level.
 */
```

### Dagre Layout Computation

```typescript
// apps/web/src/lib/graph/dagre-layout.ts
// Computes node positions using @dagrejs/dagre for automatic DAG layout.
// Separates layout computation from rendering for testability and
// potential Web Worker offloading (in the performance task).

import Dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

/**
 * computeDagreLayout(nodes: Node[], edges: Edge[], options?):
 *   { nodes: Node[], edges: Edge[] }
 *
 * Options:
 * - direction: "TB" | "LR" (default "TB" for top-to-bottom)
 * - nodeWidth: number (default 180)
 * - nodeHeight: number (default 60)
 * - rankSep: number (default 100, vertical spacing between ranks)
 * - nodeSep: number (default 50, horizontal spacing between siblings)
 *
 * Algorithm:
 * 1. Create a new Dagre graph: new Dagre.graphlib.Graph()
 * 2. Set graph direction and spacing options
 * 3. Add each node with { width: nodeWidth, height: nodeHeight }
 * 4. Add each edge with source and target
 * 5. Call Dagre.layout(graph)
 * 6. Read computed positions from graph.node(id)
 * 7. Return nodes with updated positions and original edges
 */
```

### Data Transformation

```typescript
// apps/web/src/lib/graph/transform-graph-data.ts
// Transforms API task dependency data into ReactFlow nodes and edges.
// Maps entity types, statuses, and dependency relationships.

import type { Node, Edge } from "@xyflow/react";
import type { TaskDependencyGraph, GraphNode, GraphEdge } from "@laila/shared";

/**
 * transformToGraphData(apiData: TaskDependencyGraph):
 *   { nodes: Node[], edges: Edge[] }
 *
 * Node transformation:
 * - id: entity ID (string)
 * - type: custom node type based on entity type ("epicNode", "storyNode", "taskNode")
 * - data: { label, status, entityType, entityId, parentName }
 * - position: { x: 0, y: 0 } (will be computed by Dagre)
 *
 * Edge transformation:
 * - id: "edge-{sourceId}-{targetId}"
 * - source: source entity ID
 * - target: target entity ID
 * - type: "smoothstep" (curved edges)
 * - animated: true if source node is in_progress
 * - markerEnd: { type: MarkerType.ArrowClosed }
 */
```

## Acceptance Criteria

- [ ] ReactFlow (`@xyflow/react`) and Dagre (`@dagrejs/dagre`) are installed as project dependencies
- [ ] Graph container component renders inside the project detail Graph tab
- [ ] Component is wrapped in `ReactFlowProvider` at the page level
- [ ] Task dependency data is fetched from `GET /api/v1/projects/:id/graph` using TanStack Query
- [ ] API data is transformed into ReactFlow-compatible node and edge arrays
- [ ] Dagre layout is computed with top-to-bottom direction, 180px node width, 60px node height
- [ ] Nodes are positioned automatically by Dagre with 100px rank separation and 50px node separation
- [ ] ReactFlow renders with a dots background pattern
- [ ] Graph calls `fitView()` on initial render to show the complete graph
- [ ] Loading state displays a centered spinner while data is being fetched
- [ ] Error state displays an error message if the API request fails
- [ ] Empty state displays "No dependencies to visualize" when the graph has no nodes
- [ ] Layout computation is separated into a pure function (`computeDagreLayout`) for testability
- [ ] Data transformation is separated into a pure function (`transformToGraphData`) for testability
- [ ] No `any` types are used in the implementation

## Technical Notes

- ReactFlow v12+ uses `@xyflow/react` as the package name (previously `reactflow`). Ensure the correct package is installed.
- ReactFlow requires a parent container with explicit width and height. Use `w-full h-full` with a minimum height of `min-h-[600px]` for the Graph tab content area.
- The `fitView` option on ReactFlow automatically adjusts zoom and pan to show all nodes on initial render. Pass `fitView` as a prop and optionally `fitViewOptions={{ padding: 0.2 }}` for breathing room.
- Dagre's `setGraph` accepts `rankdir` ("TB" for top-to-bottom), `ranksep`, `nodesep`, and `edgesep`. The layout is computed synchronously, which may be slow for large graphs (addressed in the Web Worker task).
- Custom node types must be registered via the `nodeTypes` prop on ReactFlow, using a stable reference (useMemo) to prevent unnecessary re-renders.

## References

- **ReactFlow:** `@xyflow/react` — React library for node-based graphs and diagrams
- **Dagre:** `@dagrejs/dagre` — Directed graph layout algorithm for DAGs
- **API:** `GET /api/v1/projects/:id/graph` endpoint from Epic 6
- **TanStack Query:** Query hooks for data fetching

## Estimated Complexity

High — Foundation task requiring integration of three libraries (ReactFlow, Dagre, TanStack Query), data transformation logic, and layout computation. All subsequent graph tasks build on this.
