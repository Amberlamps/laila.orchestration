# Implement Web Worker Dagre Layout

## Task Details

- **Title:** Implement Web Worker Dagre Layout
- **Status:** Not Started
- **Assigned Agent:** websocket-engineer
- **Parent User Story:** [Implement Graph Performance & Extras](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

For dependency graphs with more than 200 nodes, offload the Dagre layout computation to a Web Worker to avoid blocking the main thread and freezing the UI. Implement a layout cache that stores computed positions and only recomputes when the dependency structure changes. Show a loading indicator during Web Worker computation.

### Web Worker Implementation

```typescript
// apps/web/src/workers/dagre-layout.worker.ts
// Web Worker that computes Dagre layout positions for large graphs.
// Receives serialized nodes and edges, computes layout, returns positioned nodes.

import Dagre from "@dagrejs/dagre";

/**
 * Worker message protocol:
 *
 * Input message:
 * {
 *   type: "compute-layout",
 *   payload: {
 *     nodes: Array<{ id: string, width: number, height: number }>,
 *     edges: Array<{ source: string, target: string }>,
 *     options: {
 *       direction: "TB" | "LR",
 *       rankSep: number,
 *       nodeSep: number,
 *     }
 *   }
 * }
 *
 * Output message:
 * {
 *   type: "layout-complete",
 *   payload: {
 *     positions: Record<string, { x: number, y: number }>,
 *     duration: number  // computation time in ms
 *   }
 * }
 *
 * Error message:
 * {
 *   type: "layout-error",
 *   payload: { message: string }
 * }
 *
 * The worker performs:
 * 1. Create a new Dagre graph
 * 2. Configure graph with provided options
 * 3. Add all nodes and edges
 * 4. Call Dagre.layout()
 * 5. Collect computed positions
 * 6. Post result back to main thread
 */

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === "compute-layout") {
    try {
      const startTime = performance.now();
      const graph = new Dagre.graphlib.Graph();
      graph.setDefaultEdgeLabel(() => ({}));
      graph.setGraph({
        rankdir: payload.options.direction,
        ranksep: payload.options.rankSep,
        nodesep: payload.options.nodeSep,
      });

      // Add nodes and edges to the graph
      for (const node of payload.nodes) {
        graph.setNode(node.id, {
          width: node.width,
          height: node.height,
        });
      }
      for (const edge of payload.edges) {
        graph.setEdge(edge.source, edge.target);
      }

      // Compute layout
      Dagre.layout(graph);

      // Collect positions
      const positions: Record<string, { x: number; y: number }> = {};
      for (const nodeId of graph.nodes()) {
        const nodeData = graph.node(nodeId);
        positions[nodeId] = { x: nodeData.x, y: nodeData.y };
      }

      const duration = performance.now() - startTime;
      self.postMessage({
        type: "layout-complete",
        payload: { positions, duration },
      });
    } catch (error) {
      self.postMessage({
        type: "layout-error",
        payload: {
          message:
            error instanceof Error
              ? error.message
              : "Unknown layout error",
        },
      });
    }
  }
};
```

### Layout Manager Hook

```typescript
// apps/web/src/hooks/use-dagre-layout.ts
// Hook that manages layout computation, choosing between
// synchronous (small graphs) and Web Worker (large graphs).

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import { computeDagreLayout } from "@/lib/graph/dagre-layout";

/**
 * useDagreLayout(nodes: Node[], edges: Edge[], options?):
 *   { layoutNodes: Node[], layoutEdges: Edge[], isComputing: boolean }
 *
 * Threshold: 200 nodes
 *
 * If nodes.length <= 200:
 *   - Compute layout synchronously using computeDagreLayout()
 *   - isComputing is always false (computation is fast enough)
 *
 * If nodes.length > 200:
 *   - Serialize nodes and edges to plain objects
 *   - Post message to the Web Worker
 *   - Set isComputing = true
 *   - On worker response: apply positions to nodes, set isComputing = false
 *   - On worker error: fall back to synchronous computation with console.warn
 *
 * Layout caching:
 *   - Cache key: hash of sorted node IDs + sorted edge source-target pairs
 *   - If the cache key matches the previous computation, skip recomputation
 *   - Cache is stored in a useRef to persist across renders
 *   - Cache is invalidated when dependencies change (node/edge structure)
 *
 * Cleanup:
 *   - Terminate Web Worker on unmount
 *   - Ignore stale worker responses (if component re-rendered while computing)
 */
```

### Loading Indicator

```typescript
// apps/web/src/components/project/graph/graph-layout-loading.tsx
// Loading overlay displayed while the Web Worker computes layout.

/**
 * GraphLayoutLoading renders:
 *
 * - Semi-transparent overlay over the graph canvas
 *   (bg-white/80, backdrop-blur-sm)
 * - Centered content:
 *   - Spinner animation (animate-spin)
 *   - "Computing layout..." text (text-sm, text-zinc-500)
 *   - Node count context: "Positioning X nodes" (text-xs, text-zinc-400)
 * - Z-index above graph but below toolbar
 */
```

## Acceptance Criteria

- [ ] Graphs with <= 200 nodes use synchronous Dagre layout computation (no change from foundation)
- [ ] Graphs with > 200 nodes automatically offload layout computation to a Web Worker
- [ ] A loading overlay with spinner is displayed while the Web Worker computes the layout
- [ ] The loading overlay shows "Computing layout..." and the node count
- [ ] The main thread remains responsive during Web Worker computation (no UI freezing)
- [ ] Layout results are cached and reused when the dependency structure has not changed
- [ ] Cache is invalidated when nodes or edges change (additions, removals, or structural changes)
- [ ] The Web Worker is terminated on component unmount to prevent memory leaks
- [ ] Stale Web Worker responses are ignored if the component has re-rendered during computation
- [ ] If the Web Worker fails, the system falls back to synchronous computation with a console warning
- [ ] The Web Worker message protocol uses typed interfaces (no `any`)
- [ ] The layout manager hook works transparently — consuming components do not need to know whether sync or async layout is used
- [ ] No `any` types are used in the implementation

## Technical Notes

- Next.js supports Web Workers via `new Worker(new URL("./worker.ts", import.meta.url))`. The worker file should be in the `workers/` directory and will be bundled by webpack/turbopack.
- The worker must import `@dagrejs/dagre` independently — it runs in a separate JavaScript context and does not share imports with the main thread.
- The cache key computation should use a deterministic hash (e.g., sorted JSON of node IDs and edge pairs). This avoids recomputing layout when the data reference changes but the structure is identical.
- For the 200-node threshold: typical Dagre layout computation takes ~50ms for 100 nodes, ~200ms for 500 nodes, and ~1s for 1000+ nodes on modern hardware. The 200-node threshold provides a safety margin.
- The `useRef` approach for the Web Worker instance ensures the same worker is reused across renders, avoiding the overhead of creating a new worker on each re-render.

## References

- **Web Workers:** `new Worker(new URL())` pattern for Next.js/webpack
- **Dagre:** `@dagrejs/dagre` layout computation
- **React Patterns:** useRef for Web Worker lifecycle management, useEffect cleanup
- **Performance:** Main thread blocking avoidance, layout caching

## Estimated Complexity

High — Web Worker integration with Next.js bundling, message protocol design, layout caching with structural hash, fallback mechanism, and lifecycle management (cleanup, stale response handling).
