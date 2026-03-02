# Implement Cycle Detection

## Task Details

- **Title:** Implement Cycle Detection
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement DAG Operations](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a cycle detection algorithm for the project-wide task dependency DAG using depth-first search (DFS). The function takes the current graph edges and a proposed new edge, and returns either a success result (the edge is safe to add) or an error result containing the cycle path description.

This is a **safety-critical** function. If a cycle is introduced into the dependency graph, it creates a deadlock where tasks can never be started because they mutually depend on each other. The cycle detector is the gatekeeper that prevents this.

### Graph Representation

The DAG is represented as an adjacency list where each node is a task ID and edges represent "depends on" relationships (finish-to-start):

```typescript
// packages/domain/src/dag/types.ts
// Type definitions for the DAG data structures.
// The DAG uses task IDs as nodes and dependency edges as directed arcs.

/**
 * A directed edge in the task dependency DAG.
 * Semantics: the task `from` depends on the task `to`.
 * (i.e., `to` must finish before `from` can start)
 */
export interface DagEdge {
  /** The dependent task ID (the task that is waiting) */
  from: string;
  /** The dependency task ID (the task that must complete first) */
  to: string;
}

/**
 * Adjacency list representation of the DAG.
 * Key: task ID. Value: set of task IDs that this task depends on.
 * Example: { "task-3": Set(["task-1", "task-2"]) }
 * means task-3 depends on task-1 and task-2.
 */
export type AdjacencyList = Map<string, Set<string>>;

/**
 * Result of a cycle detection check.
 * Either the proposed edge is safe, or a cycle was detected
 * with a description of the cycle path.
 */
export type CycleCheckResult =
  | { hasCycle: false }
  | { hasCycle: true; cyclePath: string[] };
```

### Cycle Detection Algorithm

Use DFS with three coloring states (white/gray/black) to detect back edges:

```typescript
// packages/domain/src/dag/cycle-detection.ts
// DFS-based cycle detection for the task dependency DAG.
// Validates that adding a proposed edge does not create a cycle.
// Uses three-color DFS: white (unvisited), gray (in-progress), black (finished).
import type { AdjacencyList, DagEdge, CycleCheckResult } from "./types";

/**
 * Check if adding a proposed edge would create a cycle in the DAG.
 *
 * Algorithm: Temporarily add the proposed edge to the adjacency list,
 * then run DFS from the proposed edge's `from` node. If DFS encounters
 * the `from` node again (via a back edge), a cycle exists.
 *
 * Optimization: Instead of running full DFS on the entire graph,
 * only check if there is a path from `to` to `from` in the current
 * graph (before adding the proposed edge). If such a path exists,
 * adding `from -> to` would create a cycle.
 *
 * @param adjacencyList - The current DAG edges as an adjacency list
 * @param proposedEdge - The new edge to validate
 * @returns CycleCheckResult indicating whether a cycle would be created
 *
 * Time complexity: O(V + E) where V is the number of nodes and E is edges.
 * Space complexity: O(V) for the visited/recursion stack sets.
 */
export function detectCycle(
  adjacencyList: AdjacencyList,
  proposedEdge: DagEdge
): CycleCheckResult {
  // Self-loop check: a task cannot depend on itself.
  if (proposedEdge.from === proposedEdge.to) {
    return {
      hasCycle: true,
      cyclePath: [proposedEdge.from, proposedEdge.to],
    };
  }

  // Check if there is already a path from `to` to `from`.
  // If so, adding `from -> to` would close the cycle.
  // Use DFS starting from proposedEdge.to, looking for proposedEdge.from.
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(current: string, target: string): boolean {
    if (current === target) {
      path.push(current);
      return true;
    }

    visited.add(current);
    path.push(current);

    const neighbors = adjacencyList.get(current) ?? new Set<string>();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, target)) {
          return true;
        }
      }
    }

    path.pop();
    return false;
  }

  // If there is a path from `to` to `from`, adding `from -> to` creates a cycle.
  const foundCycle = dfs(proposedEdge.to, proposedEdge.from);

  if (foundCycle) {
    // The cycle path is: from -> to -> ... -> from
    return {
      hasCycle: true,
      cyclePath: [proposedEdge.from, ...path],
    };
  }

  return { hasCycle: false };
}

/**
 * Build an adjacency list from a flat array of edges.
 * Utility function for converting database edge records
 * into the in-memory graph representation.
 */
export function buildAdjacencyList(edges: DagEdge[]): AdjacencyList {
  const adjacencyList: AdjacencyList = new Map();

  for (const edge of edges) {
    if (!adjacencyList.has(edge.from)) {
      adjacencyList.set(edge.from, new Set());
    }
    adjacencyList.get(edge.from)!.add(edge.to);
  }

  return adjacencyList;
}

/**
 * Validate that the entire graph has no cycles (full graph check).
 * Used for integrity verification, not for single-edge validation.
 * Handles disconnected components by checking all nodes.
 *
 * @param adjacencyList - The full DAG to validate
 * @returns CycleCheckResult indicating whether any cycle exists
 */
export function validateAcyclicity(
  adjacencyList: AdjacencyList
): CycleCheckResult {
  // Three-color DFS across all components.
  // White: not yet visited (default).
  // Gray: currently in the DFS recursion stack.
  // Black: fully processed (all descendants visited).
  const gray = new Set<string>();
  const black = new Set<string>();

  // Collect all nodes (both sources and targets).
  const allNodes = new Set<string>();
  for (const [node, deps] of adjacencyList) {
    allNodes.add(node);
    for (const dep of deps) {
      allNodes.add(dep);
    }
  }

  for (const node of allNodes) {
    if (!black.has(node)) {
      const cyclePath = dfsVisit(node, adjacencyList, gray, black);
      if (cyclePath) {
        return { hasCycle: true, cyclePath };
      }
    }
  }

  return { hasCycle: false };
}
```

### Disconnected Components

The algorithm must handle disconnected components — not all tasks in a project are necessarily connected through dependencies. A task with no dependencies and no dependents is a single-node component that is trivially acyclic.

## Acceptance Criteria

- [ ] `detectCycle()` correctly identifies when a proposed edge would create a cycle
- [ ] `detectCycle()` returns `{ hasCycle: false }` when the proposed edge is safe
- [ ] `detectCycle()` returns the cycle path in the error result (list of task IDs forming the cycle)
- [ ] Self-loops (a task depending on itself) are detected and rejected
- [ ] Disconnected components are handled correctly (no false positives)
- [ ] `buildAdjacencyList()` correctly converts a flat edge array to an adjacency list
- [ ] `validateAcyclicity()` checks the entire graph for cycles (not just a single edge)
- [ ] All functions are pure — no side effects, no database calls, no mutations of input data
- [ ] Time complexity is O(V + E) for cycle detection
- [ ] All functions are properly typed with no `any` types
- [ ] All types are exported from `packages/domain/src/dag/types.ts`

## Technical Notes

- The "optimized" single-edge check (checking for a path from `to` to `from`) is more efficient than adding the edge and running full DFS. It avoids mutating the adjacency list.
- The adjacency list uses `Map<string, Set<string>>` for O(1) node lookup and O(1) edge existence checks.
- The `cyclePath` in the result should be human-readable — it represents the sequence of task IDs that form the cycle, making it useful for error messages.
- Consider using iterative DFS instead of recursive DFS to avoid stack overflow on very deep graphs. For most practical project sizes (hundreds of tasks), recursive DFS is fine.
- This module lives in `packages/domain/` and has zero dependencies on database, HTTP, or framework code. It only imports from the shared types package.

## References

- **Functional Requirements:** FR-DAG-001 (cycle detection), FR-DAG-002 (acyclicity guarantee)
- **Design Specification:** Section 5.1 (DAG Architecture), Section 5.1.1 (Cycle Detection Algorithm)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Medium — DFS cycle detection is a well-known algorithm, but the implementation must handle edge cases (self-loops, disconnected components, cycle path extraction) and produce clear error messages. The adjacency list data structure design and type definitions add complexity.
