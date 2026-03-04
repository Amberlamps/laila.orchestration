# Implement View Level Toggle

## Task Details

- **Title:** Implement View Level Toggle
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Graph Interactivity](./tasks.md)
- **Parent Epic:** [Dependency Graph Visualization](../../user-stories.md)
- **Dependencies:** None (requires User Story 1: Implement ReactFlow Graph Foundation)

## Description

Implement a toggle control that allows users to switch between three view levels for the dependency graph: Task (default, most granular), Story (derived story dependencies), and Epic (derived epic dependencies). Each view level shows entities at that abstraction level with dependencies derived from the underlying task-level DAG.

### View Level Toggle Component

```typescript
// apps/web/src/components/project/graph/graph-view-level-toggle.tsx
// Toggle control for switching between Task, Story, and Epic graph views.
// Rendered in the graph toolbar above the canvas.

import { cn } from '@/lib/utils';
import { ListChecks, BookOpen, Layers } from 'lucide-react';

/**
 * GraphViewLevelToggle renders:
 *
 * - Segmented control (button group) with 3 options:
 *   1. "Tasks" — ListChecks icon + label
 *      Shows individual task nodes with task-level dependencies
 *   2. "Stories" — BookOpen icon + label
 *      Shows story nodes with derived story-level dependencies
 *   3. "Epics" — Layers icon + label
 *      Shows epic nodes with derived epic-level dependencies
 *
 * - Active segment: bg-indigo-50, text-indigo-700, font-medium
 * - Inactive segment: bg-white, text-zinc-600, hover:bg-zinc-50
 * - Container: border, rounded-lg, overflow-hidden
 * - Default view: "Tasks"
 *
 * Props:
 * - viewLevel: "tasks" | "stories" | "epics"
 * - onViewLevelChange: (level: "tasks" | "stories" | "epics") => void
 */
```

### Derived Dependencies

```typescript
// apps/web/src/lib/graph/derive-view-levels.ts
// Functions to derive story-level and epic-level dependency graphs
// from the underlying task-level DAG.

import type { Node, Edge } from '@xyflow/react';

/**
 * deriveStoryView(taskNodes: Node[], taskEdges: Edge[]):
 *   { nodes: Node[], edges: Edge[] }
 *
 * Algorithm:
 * 1. Group task nodes by their parent story ID
 * 2. Create one story-level node per group:
 *    - Aggregate status: if any task is in_progress -> in_progress,
 *      if all completed -> completed, if any blocked -> blocked, etc.
 *    - Label: story title
 *    - EntityType: "story"
 * 3. Derive story-level edges:
 *    - For each task-level edge where source and target are in different stories,
 *      create a story-level edge from source story to target story
 *    - Deduplicate: one edge per unique (source_story, target_story) pair
 * 4. Return story nodes and derived edges
 */

/**
 * deriveEpicView(taskNodes: Node[], taskEdges: Edge[]):
 *   { nodes: Node[], edges: Edge[] }
 *
 * Algorithm:
 * 1. Group task nodes by their parent epic ID
 * 2. Create one epic-level node per group:
 *    - Aggregate status from constituent tasks
 *    - Label: epic title
 *    - EntityType: "epic"
 * 3. Derive epic-level edges:
 *    - For each task-level edge where source and target are in different epics,
 *      create an epic-level edge from source epic to target epic
 *    - Deduplicate: one edge per unique (source_epic, target_epic) pair
 * 4. Return epic nodes and derived edges
 */
```

### View Level Hook

```typescript
// apps/web/src/hooks/use-graph-view-level.ts
// Hook that manages view level state and computes the appropriate
// node/edge set for the current view level.

/**
 * useGraphViewLevel(taskNodes: Node[], taskEdges: Edge[]):
 *   { viewLevel, setViewLevel, displayNodes, displayEdges }
 *
 * Computes displayNodes and displayEdges based on the current viewLevel:
 * - "tasks": returns taskNodes and taskEdges directly
 * - "stories": returns deriveStoryView(taskNodes, taskEdges)
 * - "epics": returns deriveEpicView(taskNodes, taskEdges)
 *
 * Uses useMemo to avoid recomputing derived views on every render.
 * Recomputes when viewLevel or the source data changes.
 */
```

## Acceptance Criteria

- [ ] A segmented toggle control is displayed in the graph toolbar with three options: Tasks, Stories, Epics
- [ ] Each option has an appropriate Lucide icon: ListChecks for Tasks, BookOpen for Stories, Layers for Epics
- [ ] Active segment has indigo background tint and indigo text color
- [ ] Inactive segments have white background with hover highlight
- [ ] Default view level is "Tasks" showing the full task-level dependency graph
- [ ] Switching to "Stories" view shows story-level nodes with derived dependencies
- [ ] Switching to "Epics" view shows epic-level nodes with derived dependencies
- [ ] Story-level dependencies are derived by deduplicating cross-story task edges
- [ ] Epic-level dependencies are derived by deduplicating cross-epic task edges
- [ ] Aggregated status for story/epic nodes reflects the constituent tasks' statuses
- [ ] Dagre layout is recomputed when the view level changes
- [ ] Graph calls `fitView()` after view level change to show all nodes
- [ ] Derived view computations use `useMemo` for performance
- [ ] No `any` types are used in the implementation

## Technical Notes

- The derivation algorithm is the key complexity here. Story dependencies are derived by examining task-level edges: if task A in Story X depends on task B in Story Y, then Story X depends on Story Y. Multiple such task edges between the same two stories collapse into a single story-level edge.
- Status aggregation for derived nodes follows priority: `failed > blocked > in_progress > not_started > completed`. If any constituent task is failed, the derived node is failed. If no failures but any blocked, the derived node is blocked, etc.
- The derived view functions should be pure and testable — they take nodes/edges in and return nodes/edges out, with no side effects.
- When changing view levels, the graph should smoothly transition by calling `fitView({ duration: 300 })` after the new layout is computed.

## References

- **Graph Library:** ReactFlow node types and edge data
- **Layout:** Dagre recomputation for derived view levels
- **Design Pattern:** Segmented control (shadcn/ui ToggleGroup or custom)
- **Icons:** Lucide React — ListChecks, BookOpen, Layers

## Estimated Complexity

High — The dependency derivation algorithm requires grouping tasks by parent entity, deduplicating edges, and aggregating statuses. The view level toggle itself is simple, but the underlying computation is significant.
