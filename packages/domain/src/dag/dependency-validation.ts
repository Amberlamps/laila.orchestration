// Validates proposed dependency changes against structural and semantic rules.
// All functions are pure — no database calls, no side effects.
import { detectCycle } from './cycle-detection';

import type { AdjacencyList, DagEdge } from './types';

/**
 * Complete result of dependency validation.
 * Contains the overall validity and a list of all validation errors.
 */
export interface DependencyValidationResult {
  valid: boolean;
  errors: DependencyValidationError[];
}

/**
 * Individual validation error with a machine-readable code
 * and a human-readable message.
 */
export interface DependencyValidationError {
  code:
    | 'TASK_NOT_FOUND'
    | 'CROSS_PROJECT'
    | 'SELF_DEPENDENCY'
    | 'DUPLICATE_EDGE'
    | 'CYCLE_DETECTED'
    | 'ACTIVE_WORK_CONFLICT';
  message: string;
  // Additional context for the error (e.g., task IDs, cycle path).
  details?: Record<string, unknown>;
}

/**
 * The task metadata needed for dependency validation.
 * This is a minimal subset of the full task record — only the
 * fields relevant to structural validation.
 */
export interface TaskValidationInfo {
  id: string;
  projectId: string;
  status: 'not-started' | 'in-progress' | 'complete' | 'blocked';
  userStoryId: string;
}

/**
 * Validate a proposed new dependency edge against all rules.
 * Runs all validators and collects all errors (does not short-circuit).
 *
 * @param adjacencyList - The current DAG edges
 * @param proposedEdge - The new edge to validate (from depends on to)
 * @param tasks - Map of task ID to task metadata for all tasks in the project
 * @returns Validation result with all errors (if any)
 */
export function validateDependency(
  adjacencyList: AdjacencyList,
  proposedEdge: DagEdge,
  tasks: Map<string, TaskValidationInfo>,
): DependencyValidationResult {
  const errors: DependencyValidationError[] = [];

  // Rule 1: Both tasks must exist.
  const fromTask = tasks.get(proposedEdge.from);
  const toTask = tasks.get(proposedEdge.to);

  if (!fromTask) {
    errors.push({
      code: 'TASK_NOT_FOUND',
      message: `Source task "${proposedEdge.from}" does not exist`,
      details: { taskId: proposedEdge.from },
    });
  }
  if (!toTask) {
    errors.push({
      code: 'TASK_NOT_FOUND',
      message: `Target task "${proposedEdge.to}" does not exist`,
      details: { taskId: proposedEdge.to },
    });
  }

  // Rule 2: Same-project constraint (requires both tasks to exist).
  if (fromTask && toTask && fromTask.projectId !== toTask.projectId) {
    errors.push({
      code: 'CROSS_PROJECT',
      message: 'Dependencies cannot cross project boundaries',
      details: {
        fromProject: fromTask.projectId,
        toProject: toTask.projectId,
      },
    });
  }

  // Rule 3: No self-dependencies.
  if (proposedEdge.from === proposedEdge.to) {
    errors.push({
      code: 'SELF_DEPENDENCY',
      message: 'A task cannot depend on itself',
      details: { taskId: proposedEdge.from },
    });
  }

  // Rule 4: No duplicate edges.
  const existingDeps = adjacencyList.get(proposedEdge.from);
  if (existingDeps?.has(proposedEdge.to)) {
    errors.push({
      code: 'DUPLICATE_EDGE',
      message: 'This dependency already exists',
      details: {
        from: proposedEdge.from,
        to: proposedEdge.to,
      },
    });
  }

  // Rule 5: Cycle detection (delegates to cycle-detection module).
  if (proposedEdge.from !== proposedEdge.to) {
    const cycleResult = detectCycle(adjacencyList, proposedEdge);
    if (cycleResult.hasCycle) {
      errors.push({
        code: 'CYCLE_DETECTED',
        message: `Adding this dependency would create a cycle: ${cycleResult.cyclePath.join(' -> ')}`,
        details: { cyclePath: cycleResult.cyclePath },
      });
    }
  }

  // Rule 6: Active work safety (requires fromTask to exist).
  // If the source task (the one gaining a dependency) is already
  // in-progress or complete, adding a new dependency is dangerous.
  if (fromTask?.status === 'in-progress') {
    errors.push({
      code: 'ACTIVE_WORK_CONFLICT',
      message: 'Cannot add dependency to a task that is currently in progress',
      details: { taskId: fromTask.id, status: fromTask.status },
    });
  }
  if (fromTask?.status === 'complete') {
    errors.push({
      code: 'ACTIVE_WORK_CONFLICT',
      message: 'Cannot add dependency to a completed task',
      details: { taskId: fromTask.id, status: fromTask.status },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate removal of a dependency edge.
 * Removing dependencies is generally safe, but should be
 * validated against active work state.
 *
 * @param proposedRemoval - The edge to remove
 * @param tasks - Map of task ID to task metadata
 * @returns Validation result
 */
export function validateDependencyRemoval(
  proposedRemoval: DagEdge,
  tasks: Map<string, TaskValidationInfo>,
): DependencyValidationResult {
  const errors: DependencyValidationError[] = [];

  const fromTask = tasks.get(proposedRemoval.from);
  if (!fromTask) {
    errors.push({
      code: 'TASK_NOT_FOUND',
      message: `Task "${proposedRemoval.from}" does not exist`,
      details: { taskId: proposedRemoval.from },
    });
  }

  const toTask = tasks.get(proposedRemoval.to);
  if (!toTask) {
    errors.push({
      code: 'TASK_NOT_FOUND',
      message: `Task "${proposedRemoval.to}" does not exist`,
      details: { taskId: proposedRemoval.to },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
