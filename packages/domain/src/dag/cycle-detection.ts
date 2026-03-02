/**
 * @module @laila/domain/dag/cycle-detection
 *
 * DFS-based cycle detection for the task dependency DAG.
 * Validates that adding a proposed edge does not create a cycle.
 * Uses three-color DFS: white (unvisited), gray (in-progress), black (finished).
 *
 * All functions are pure -- no side effects, no database calls, no mutations
 * of input data.
 */

import type { AdjacencyList, CycleCheckResult, DagEdge } from './types';

/**
 * Check if adding a proposed edge would create a cycle in the DAG.
 *
 * Algorithm: Check if there is a path from `to` to `from` in the current
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
export const detectCycle = (
  adjacencyList: AdjacencyList,
  proposedEdge: DagEdge,
): CycleCheckResult => {
  // Self-loop check: a task cannot depend on itself.
  if (proposedEdge.from === proposedEdge.to) {
    return {
      hasCycle: true,
      cyclePath: [proposedEdge.from, proposedEdge.to],
    };
  }

  // Check if there is already a path from `to` to `from`.
  // If so, adding `from -> to` would close the cycle.
  const visited = new Set<string>();
  const path: string[] = [];

  const dfs = (current: string, target: string): boolean => {
    if (current === target) {
      path.push(current);
      return true;
    }

    visited.add(current);
    path.push(current);

    const neighbors = adjacencyList.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, target)) {
            return true;
          }
        }
      }
    }

    path.pop();
    return false;
  };

  const foundCycle = dfs(proposedEdge.to, proposedEdge.from);

  if (foundCycle) {
    // The cycle path is: from -> to -> ... -> from
    return {
      hasCycle: true,
      cyclePath: [proposedEdge.from, ...path],
    };
  }

  return { hasCycle: false };
};

/**
 * Build an adjacency list from a flat array of edges.
 * Utility function for converting database edge records
 * into the in-memory graph representation.
 *
 * @param edges - Flat array of directed edges
 * @returns AdjacencyList (Map of node ID to Set of neighbor IDs)
 */
export const buildAdjacencyList = (edges: readonly DagEdge[]): AdjacencyList => {
  const adjacencyList = new Map<string, Set<string>>();

  for (const edge of edges) {
    const existing = adjacencyList.get(edge.from);
    if (existing) {
      existing.add(edge.to);
    } else {
      adjacencyList.set(edge.from, new Set([edge.to]));
    }
  }

  return adjacencyList;
};

/**
 * DFS visit helper for three-color cycle detection.
 * Recursively visits nodes, tracking gray (in-progress) and black (finished) sets.
 * Returns the cycle path if a back edge is found, or undefined if no cycle.
 *
 * @param node - Current node to visit
 * @param adjacencyList - The graph adjacency list
 * @param gray - Set of nodes currently in the DFS recursion stack
 * @param black - Set of fully processed nodes
 * @returns Array of task IDs forming the cycle, or undefined if no cycle
 */
const dfsVisit = (
  node: string,
  adjacencyList: AdjacencyList,
  gray: Set<string>,
  black: Set<string>,
): string[] | undefined => {
  // Skip already-finished nodes.
  if (black.has(node)) {
    return undefined;
  }

  // Back edge detected: this node is already in the current recursion stack.
  if (gray.has(node)) {
    return [node];
  }

  // Mark as in-progress (gray).
  gray.add(node);

  const neighbors = adjacencyList.get(node);
  if (neighbors) {
    for (const neighbor of neighbors) {
      const cyclePath = dfsVisit(neighbor, adjacencyList, gray, black);
      if (cyclePath) {
        // The last element is always the cycle start (the gray node that
        // was re-encountered). Prepend the current node until the path is
        // "closed" — i.e., the first element equals the last (cycle start)
        // and the path has more than one element.
        const cycleStart = cyclePath[cyclePath.length - 1];
        const isClosed =
          cycleStart !== undefined && cyclePath.length > 1 && cyclePath[0] === cycleStart;
        if (!isClosed) {
          cyclePath.unshift(node);
        }
        return cyclePath;
      }
    }
  }

  // Mark as finished (black) and remove from gray.
  gray.delete(node);
  black.add(node);

  return undefined;
};

/**
 * Validate that the entire graph has no cycles (full graph check).
 * Used for integrity verification, not for single-edge validation.
 * Handles disconnected components by checking all nodes.
 *
 * @param adjacencyList - The full DAG to validate
 * @returns CycleCheckResult indicating whether any cycle exists
 *
 * Time complexity: O(V + E)
 * Space complexity: O(V)
 */
export const validateAcyclicity = (adjacencyList: AdjacencyList): CycleCheckResult => {
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
};
