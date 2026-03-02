# Implement Derived Dependency Computation

## Task Details

- **Title:** Implement Derived Dependency Computation
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement DAG Operations](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Cycle Detection, Implement Topological Sort

## Description

Implement functions to derive user-story-level and epic-level dependency graphs from the task-level DAG. In this system, dependencies are only defined at the task level. Story and epic dependencies are inferred: if any task in Story A depends on a task in Story B, then Story A depends on Story B. Similarly, if any story in Epic X depends on a story in Epic Y, then Epic X depends on Epic Y.

These derived dependencies are computed on-the-fly (not stored in the database) to ensure they are always consistent with the task-level truth.

### Derivation Logic

```typescript
// packages/domain/src/dag/derived-dependencies.ts
// Derive user-story-level and epic-level dependency graphs
// from the task-level DAG. Dependencies roll up: if any task
// in Story A depends on a task in Story B, Story A depends on Story B.
import type { AdjacencyList, DagEdge } from "./types";

/**
 * Mapping from a task ID to its parent container (story or epic).
 */
export interface TaskGrouping {
  taskId: string;
  userStoryId: string;
  epicId: string;
}

/**
 * Derived dependency graph at a higher level (story or epic).
 * Uses the same adjacency list structure as the task DAG.
 */
export interface DerivedDependencyGraph {
  adjacencyList: AdjacencyList;
  // The edges that caused each derived dependency.
  // Useful for explaining "why does Story A depend on Story B?"
  edgeProvenance: Map<string, DagEdge[]>;
}

/**
 * Derive user-story-level dependencies from the task-level DAG.
 *
 * Algorithm:
 * 1. For each task-level dependency edge (A depends on B):
 *    a. Look up Story(A) and Story(B)
 *    b. If Story(A) !== Story(B), add Story(A) depends on Story(B)
 * 2. Deduplicate: multiple task edges between the same two stories
 *    produce only one story-level dependency.
 *
 * The edgeProvenance map tracks which task-level edges caused each
 * derived dependency, enabling "why?" explanations in the UI.
 *
 * @param taskAdjacencyList - The task-level DAG
 * @param taskGroupings - Mapping from task IDs to their parent story/epic
 * @returns Derived story-level dependency graph
 */
export function deriveStoryDependencies(
  taskAdjacencyList: AdjacencyList,
  taskGroupings: Map<string, TaskGrouping>
): DerivedDependencyGraph {
  const storyAdjacencyList: AdjacencyList = new Map();
  const edgeProvenance = new Map<string, DagEdge[]>();

  for (const [taskFrom, taskDeps] of taskAdjacencyList) {
    const fromGrouping = taskGroupings.get(taskFrom);
    if (!fromGrouping) continue;

    for (const taskTo of taskDeps) {
      const toGrouping = taskGroupings.get(taskTo);
      if (!toGrouping) continue;

      // Only create a story dependency for cross-story edges.
      // Intra-story edges don't create story-level dependencies.
      if (fromGrouping.userStoryId === toGrouping.userStoryId) continue;

      const storyFrom = fromGrouping.userStoryId;
      const storyTo = toGrouping.userStoryId;

      // Add the story-level edge (storyFrom depends on storyTo).
      if (!storyAdjacencyList.has(storyFrom)) {
        storyAdjacencyList.set(storyFrom, new Set());
      }
      storyAdjacencyList.get(storyFrom)!.add(storyTo);

      // Track provenance: which task edge caused this story dependency.
      const provenanceKey = `${storyFrom}->${storyTo}`;
      if (!edgeProvenance.has(provenanceKey)) {
        edgeProvenance.set(provenanceKey, []);
      }
      edgeProvenance.get(provenanceKey)!.push({
        from: taskFrom,
        to: taskTo,
      });
    }
  }

  return { adjacencyList: storyAdjacencyList, edgeProvenance };
}

/**
 * Derive epic-level dependencies from the story-level dependency graph.
 *
 * Same roll-up logic: if any story in Epic X depends on a story
 * in Epic Y, then Epic X depends on Epic Y.
 *
 * @param storyAdjacencyList - The derived story-level dependency graph
 * @param storyToEpic - Mapping from story IDs to their parent epic IDs
 * @returns Derived epic-level dependency graph
 */
export function deriveEpicDependencies(
  storyAdjacencyList: AdjacencyList,
  storyToEpic: Map<string, string>
): DerivedDependencyGraph {
  const epicAdjacencyList: AdjacencyList = new Map();
  const edgeProvenance = new Map<string, DagEdge[]>();

  for (const [storyFrom, storyDeps] of storyAdjacencyList) {
    const epicFrom = storyToEpic.get(storyFrom);
    if (!epicFrom) continue;

    for (const storyTo of storyDeps) {
      const epicTo = storyToEpic.get(storyTo);
      if (!epicTo) continue;

      // Only create an epic dependency for cross-epic edges.
      if (epicFrom === epicTo) continue;

      if (!epicAdjacencyList.has(epicFrom)) {
        epicAdjacencyList.set(epicFrom, new Set());
      }
      epicAdjacencyList.get(epicFrom)!.add(epicTo);

      // Track provenance: which story edge caused this epic dependency.
      const provenanceKey = `${epicFrom}->${epicTo}`;
      if (!edgeProvenance.has(provenanceKey)) {
        edgeProvenance.set(provenanceKey, []);
      }
      edgeProvenance.get(provenanceKey)!.push({
        from: storyFrom,
        to: storyTo,
      });
    }
  }

  return { adjacencyList: epicAdjacencyList, edgeProvenance };
}

/**
 * Compute the full derived dependency chain: task -> story -> epic.
 * Convenience function that runs both derivations in sequence.
 *
 * @param taskAdjacencyList - The task-level DAG
 * @param taskGroupings - Mapping from task IDs to their parent story/epic
 * @returns Both story-level and epic-level derived dependency graphs
 */
export function deriveAllDependencies(
  taskAdjacencyList: AdjacencyList,
  taskGroupings: Map<string, TaskGrouping>
): {
  storyDependencies: DerivedDependencyGraph;
  epicDependencies: DerivedDependencyGraph;
} {
  const storyDependencies = deriveStoryDependencies(
    taskAdjacencyList,
    taskGroupings
  );

  // Build story-to-epic mapping from the task groupings.
  const storyToEpic = new Map<string, string>();
  for (const grouping of taskGroupings.values()) {
    storyToEpic.set(grouping.userStoryId, grouping.epicId);
  }

  const epicDependencies = deriveEpicDependencies(
    storyDependencies.adjacencyList,
    storyToEpic
  );

  return { storyDependencies, epicDependencies };
}
```

### Provenance Tracking

The `edgeProvenance` map is a key feature. When the UI shows "Story A depends on Story B," the user can ask "why?" and see the specific task-level edges that caused this derived dependency. This makes the dependency graph transparent and debuggable.

## Acceptance Criteria

- [ ] `deriveStoryDependencies()` correctly creates story-level edges from cross-story task dependencies
- [ ] Intra-story task dependencies do not create story-level dependencies
- [ ] Multiple task edges between the same two stories produce only one story-level dependency
- [ ] `deriveEpicDependencies()` correctly creates epic-level edges from cross-epic story dependencies
- [ ] Intra-epic story dependencies do not create epic-level dependencies
- [ ] Edge provenance is tracked for all derived dependencies (task edges for stories, story edges for epics)
- [ ] `deriveAllDependencies()` computes both story and epic levels in sequence
- [ ] The derived dependency graphs are themselves acyclic (given an acyclic task DAG)
- [ ] Missing grouping entries are handled gracefully (skipped, not errored)
- [ ] All functions are pure — no side effects, no database calls
- [ ] All types are properly exported
- [ ] No `any` types used

## Technical Notes

- Derived dependencies are computed on-the-fly, not stored in the database. This ensures consistency with the task-level DAG as the single source of truth.
- The provenance map uses a string key format `"storyFrom->storyTo"` for simplicity. Consider using a more structured key if needed.
- If the task-level DAG is acyclic, the derived story and epic DAGs are also guaranteed to be acyclic. This can be proven: if there were a cycle at the story level, it would imply a cycle at the task level (by following provenance edges). This means cycle detection is NOT needed on derived graphs.
- Performance: for large projects (hundreds of tasks, dozens of stories), the derivation is O(E) where E is the number of task-level edges. This is fast enough to compute on every request.
- The `TaskGrouping` type is a minimal projection. The API layer loads the full records and extracts this subset.

## References

- **Functional Requirements:** FR-DAG-007 (derived dependencies), FR-DAG-008 (provenance tracking)
- **Design Specification:** Section 5.1.6 (Derived Dependency Computation), Section 5.1.7 (Provenance)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Medium — The derivation algorithm is conceptually simple (group edges by parent container) but the provenance tracking, proper deduplication, and multi-level composition add meaningful implementation complexity. The type design for groupings and provenance requires careful thought.
