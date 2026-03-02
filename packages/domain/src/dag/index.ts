/**
 * @module @laila/domain/dag
 *
 * DAG construction, topological sort, cycle detection, and dependency resolution.
 *
 * This module provides graph algorithms for task dependency resolution.
 * It operates on well-defined graph data structures to determine execution
 * order, detect circular dependencies, and resolve which tasks are ready
 * for assignment based on their dependency state.
 *
 * All functions are pure with no side effects -- graph operations are
 * stateless transformations over immutable data structures.
 */

export type { DagEdge, AdjacencyList, CycleCheckResult } from './types';
export { buildAdjacencyList, detectCycle, validateAcyclicity } from './cycle-detection';
export {
  topologicalSort,
  topologicalSortForStory,
  type TopologicalSortResult,
} from './topological-sort';
export {
  validateDependency,
  validateDependencyRemoval,
  type DependencyValidationResult,
  type DependencyValidationError,
  type TaskValidationInfo,
} from './dependency-validation';
export type { TaskGrouping, DerivedDependencyGraph } from './derived-dependencies';
export {
  deriveStoryDependencies,
  deriveEpicDependencies,
  deriveAllDependencies,
} from './derived-dependencies';
