// Core DAG type definitions for task dependency graphs.
// These types are shared across all DAG modules (construction, sorting, cycle detection).

/**
 * A directed edge in the dependency graph.
 * `from` depends on `to` (i.e., `to` must be completed before `from`).
 */
export interface DagEdge {
  from: string;
  to: string;
}

/**
 * Adjacency list representation of a directed graph.
 * Each key is a node ID, and its value is the set of node IDs it depends on.
 * Example: Map { "task-3" => Set { "task-1", "task-2" } }
 * means task-3 depends on task-1 and task-2.
 */
export type AdjacencyList = Map<string, Set<string>>;

/**
 * Result of a cycle detection check.
 * If a cycle exists, includes the path of nodes forming the cycle.
 */
export type CycleCheckResult = { hasCycle: false } | { hasCycle: true; cyclePath: string[] };
