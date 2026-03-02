# Implement Graph Performance & Extras — Tasks

## User Story Summary

- **Title:** Implement Graph Performance & Extras
- **Description:** Performance optimization and additional features for the dependency graph visualization. Includes offloading Dagre layout computation to a Web Worker for graphs with more than 200 nodes, a ReactFlow minimap for large graph navigation, a fullscreen mode for focused graph analysis, and an always-visible graph legend showing status color mappings.
- **Status:** Not Started
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Implement ReactFlow Graph Foundation

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Web Worker Dagre Layout](./implement-web-worker-dagre-layout.md) | Offload Dagre layout computation to a Web Worker for graphs with >200 nodes to avoid blocking the main thread | Not Started | websocket-engineer | None |
| [Implement Minimap Component](./implement-minimap-component.md) | ReactFlow minimap showing viewport position within the full graph, 160x100px, bottom-right corner | Not Started | frontend-developer | None |
| [Implement Fullscreen Mode](./implement-fullscreen-mode.md) | Toggle to expand graph to fill the viewport with toolbar and Escape to exit | Not Started | frontend-developer | None |
| [Implement Graph Legend](./implement-graph-legend.md) | Always-visible horizontal legend showing status color and label pairs | Not Started | ui-designer | None |

## Dependency Graph

```
Implement Web Worker Dagre Layout      (independent)
Implement Minimap Component            (independent)
Implement Fullscreen Mode              (independent)
Implement Graph Legend                 (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All four tasks are independent of each other and all depend on User Story 1 (ReactFlow Graph Foundation). They can be developed simultaneously.
2. **Priority ordering:** Task 1 (Web Worker Dagre Layout) is highest priority for large-graph performance. Tasks 2-4 are enhancements in any order.
