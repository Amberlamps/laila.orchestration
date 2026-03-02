# Implement Topological Sort

## Task Details

- **Title:** Implement Topological Sort
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement DAG Operations](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** None

## Description

Implement topological sort for task ordering within user stories and across the project. Topological sort produces a linear ordering of tasks such that for every dependency edge (A depends on B), B comes before A in the ordering. This ordering is used for recommended task execution order and dependency resolution.

The algorithm must handle disconnected components gracefully — tasks that have no dependency relationships with each other should still appear in the output in a deterministic order.

### Algorithm: Kahn's Algorithm (BFS-based)

Use Kahn's algorithm for topological sort because it:
1. Naturally detects cycles (if the result contains fewer nodes than the input, a cycle exists)
2. Processes nodes level by level, which aligns with the "waves of ready tasks" mental model
3. Is iterative (no recursion stack overflow risk)

```typescript
// packages/domain/src/dag/topological-sort.ts
// Topological sort for task ordering using Kahn's algorithm (BFS).
// Produces a linear ordering where dependencies come before dependents.
// Handles disconnected components and provides deterministic output.
import type { AdjacencyList } from "./types";

/**
 * Result of a topological sort operation.
 * Either a valid sorted ordering, or an error if the graph has a cycle.
 */
export type TopologicalSortResult =
  | { success: true; sorted: string[] }
  | { success: false; error: "CYCLE_DETECTED" };

/**
 * Perform topological sort on the task DAG using Kahn's algorithm.
 *
 * Algorithm:
 * 1. Compute in-degree for each node (number of incoming edges).
 * 2. Add all nodes with in-degree 0 to a queue (these have no dependencies).
 * 3. Process nodes from the queue:
 *    a. Add the node to the sorted result.
 *    b. For each node that depends on this node, decrement its in-degree.
 *    c. If a dependent's in-degree reaches 0, add it to the queue.
 * 4. If the sorted result has fewer nodes than the graph, a cycle exists.
 *
 * Determinism: Within each "level" (nodes with the same in-degree at the
 * same processing stage), nodes are sorted alphabetically by ID to ensure
 * deterministic output regardless of Map/Set iteration order.
 *
 * @param adjacencyList - The DAG as an adjacency list (node -> set of dependencies)
 * @param allNodeIds - All node IDs in the graph (including isolated nodes)
 * @returns Sorted node IDs or error if cycle detected
 *
 * Time complexity: O(V + E)
 * Space complexity: O(V)
 */
export function topologicalSort(
  adjacencyList: AdjacencyList,
  allNodeIds: string[]
): TopologicalSortResult {
  // Step 1: Compute in-degree for each node.
  // In-degree = number of tasks that depend on this task.
  // Note: adjacencyList stores "X depends on Y" as X -> Set(Y),
  // so we need the reverse direction for in-degree computation.
  const inDegree = new Map<string, number>();
  const reverseDeps = new Map<string, Set<string>>();

  // Initialize all nodes with in-degree 0.
  for (const nodeId of allNodeIds) {
    inDegree.set(nodeId, 0);
    if (!reverseDeps.has(nodeId)) {
      reverseDeps.set(nodeId, new Set());
    }
  }

  // Build reverse dependency map and compute in-degrees.
  // If A depends on B (adjacencyList: A -> Set(B)),
  // then B has a reverse dep on A (reverseDeps: B -> Set(A)),
  // and A's in-degree is incremented.
  for (const [node, dependencies] of adjacencyList) {
    inDegree.set(node, (inDegree.get(node) ?? 0) + dependencies.size);
    for (const dep of dependencies) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, new Set());
      }
      reverseDeps.get(dep)!.add(node);
    }
  }

  // Step 2: Collect all nodes with in-degree 0 (no unmet dependencies).
  // Sort alphabetically for deterministic output.
  const queue: string[] = allNodeIds
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort();

  const sorted: string[] = [];

  // Step 3: Process the queue (BFS).
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    // For each node that depends on `current`, decrement its in-degree.
    const dependents = reverseDeps.get(current) ?? new Set();
    const newlyReady: string[] = [];

    for (const dependent of dependents) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);

      if (newDegree === 0) {
        newlyReady.push(dependent);
      }
    }

    // Sort newly ready nodes for deterministic output.
    newlyReady.sort();
    queue.push(...newlyReady);
  }

  // Step 4: If not all nodes are in the sorted result, a cycle exists.
  if (sorted.length !== allNodeIds.length) {
    return { success: false, error: "CYCLE_DETECTED" };
  }

  return { success: true, sorted };
}

/**
 * Compute topological sort for tasks within a single user story.
 * Filters the full DAG to only include edges between tasks in the story.
 *
 * @param adjacencyList - The full project DAG
 * @param storyTaskIds - Task IDs belonging to the user story
 * @returns Sorted task IDs within the story
 */
export function topologicalSortForStory(
  adjacencyList: AdjacencyList,
  storyTaskIds: string[]
): TopologicalSortResult {
  // Build a sub-graph containing only intra-story edges.
  const storyTaskSet = new Set(storyTaskIds);
  const storyAdjacencyList: AdjacencyList = new Map();

  for (const taskId of storyTaskIds) {
    const deps = adjacencyList.get(taskId);
    if (deps) {
      const intraDeps = new Set<string>();
      for (const dep of deps) {
        if (storyTaskSet.has(dep)) {
          intraDeps.add(dep);
        }
      }
      if (intraDeps.size > 0) {
        storyAdjacencyList.set(taskId, intraDeps);
      }
    }
  }

  return topologicalSort(storyAdjacencyList, storyTaskIds);
}
```

## Acceptance Criteria

- [ ] `topologicalSort()` produces a valid linear ordering where all dependencies come before their dependents
- [ ] The sort is deterministic — same input always produces the same output (alphabetical tiebreaker)
- [ ] Disconnected components are included in the output (isolated nodes appear in alphabetical order)
- [ ] Cycles are detected and reported via the `CYCLE_DETECTED` error result
- [ ] `topologicalSortForStory()` correctly filters to intra-story edges and sorts within a story
- [ ] Cross-story dependencies are excluded in the story-level sort (only intra-story edges considered)
- [ ] Time complexity is O(V + E) for the sorting algorithm
- [ ] All functions are pure — no side effects, no database calls, no mutations of input data
- [ ] Empty graphs return an empty sorted array (not an error)
- [ ] Single-node graphs return the single node
- [ ] All functions are properly typed with no `any` types

## Technical Notes

- Kahn's algorithm is preferred over DFS-based topological sort because it naturally provides level-by-level processing and cycle detection without needing a separate cycle check.
- The deterministic output (alphabetical tiebreaker) is important for consistency in the UI and API responses. Without this, the output could vary between runs due to Map/Set iteration order.
- The `allNodeIds` parameter is separate from the adjacency list because isolated nodes (no edges) would not appear in the adjacency list but should still be in the output.
- The story-level sort function filters cross-story edges because those are handled at the story dependency level, not the task execution order level.
- Consider adding a `topologicalSortLevels()` variant that returns nodes grouped by their "wave" (all level-0 nodes, then level-1, etc.). This is useful for parallel execution planning.
- This module lives in `packages/domain/` with zero external dependencies.

## References

- **Functional Requirements:** FR-DAG-003 (topological sort), FR-DAG-004 (deterministic ordering)
- **Design Specification:** Section 5.1.2 (Topological Sort Algorithm), Section 5.1.3 (Story-level Ordering)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Medium — Kahn's algorithm is a well-documented algorithm, but the implementation requires handling disconnected components, deterministic ordering, story-level filtering, and proper type definitions. The reverse dependency map adds a layer of data structure management.
