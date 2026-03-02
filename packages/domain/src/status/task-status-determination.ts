// Determine a task's status from the DAG state and completed tasks set.
// Pure function: no database calls, no side effects.
import type { TaskStatus } from './transition-definitions';
import type { AdjacencyList } from '../dag/types';

/**
 * The current state of a task for status determination purposes.
 */
export interface TaskCurrentState {
  id: string;
  status: TaskStatus;
}

/**
 * Result of a task status determination.
 * Either the status should change, or it should remain the same.
 */
export type TaskStatusDetermination =
  | { shouldChange: false; currentStatus: TaskStatus }
  | { shouldChange: true; currentStatus: TaskStatus; newStatus: TaskStatus; reason: string };

/**
 * Determine what a task's status should be based on its dependencies.
 *
 * Logic:
 * - If the task has no dependencies: it is "not-started" (ready to work).
 * - If all dependencies are in the completed set: it is "not-started".
 * - If any dependency is NOT in the completed set: it is "blocked".
 * - If the task is already "in-progress" or "complete", do not change it
 *   (these states are only changed by explicit actions, not by dependency changes).
 *
 * @param taskId - The task to evaluate
 * @param currentStatus - The task's current status
 * @param adjacencyList - The task-level DAG
 * @param completedTaskIds - Set of task IDs that are currently complete
 * @returns Whether the task's status should change
 */
export const determineTaskStatus = (
  taskId: string,
  currentStatus: TaskStatus,
  adjacencyList: AdjacencyList,
  completedTaskIds: Set<string>,
): TaskStatusDetermination => {
  // Tasks that are in-progress or complete are not affected by
  // dependency changes. Their status is controlled by explicit
  // actions (start work, complete work).
  if (currentStatus === 'in-progress' || currentStatus === 'complete') {
    return { shouldChange: false, currentStatus };
  }

  // Get this task's dependencies from the DAG.
  const dependencies = adjacencyList.get(taskId) ?? new Set<string>();

  // If the task has no dependencies, it should be not-started.
  if (dependencies.size === 0) {
    if (currentStatus === 'not-started') {
      return { shouldChange: false, currentStatus };
    }
    return {
      shouldChange: true,
      currentStatus,
      newStatus: 'not-started',
      reason: 'Task has no dependencies',
    };
  }

  // Check if ALL dependencies are complete.
  const allDepsComplete = Array.from(dependencies).every((depId) => completedTaskIds.has(depId));

  if (allDepsComplete) {
    // All deps satisfied -- task should be not-started (ready).
    if (currentStatus === 'not-started') {
      return { shouldChange: false, currentStatus };
    }
    return {
      shouldChange: true,
      currentStatus,
      newStatus: 'not-started',
      reason: 'All dependencies are now complete',
    };
  }

  // Some deps are still incomplete -- task should be blocked.
  if (currentStatus === 'blocked') {
    return { shouldChange: false, currentStatus };
  }
  return {
    shouldChange: true,
    currentStatus,
    newStatus: 'blocked',
    reason: 'Some dependencies are still incomplete',
  };
};

/**
 * Determine the initial status for a newly created task based on
 * its dependencies at creation time.
 *
 * @param taskId - The new task's ID
 * @param adjacencyList - The current DAG (may include edges for this task)
 * @param completedTaskIds - Set of currently completed task IDs
 * @returns The initial status for the task
 */
export const determineInitialTaskStatus = (
  taskId: string,
  adjacencyList: AdjacencyList,
  completedTaskIds: Set<string>,
): TaskStatus => {
  const dependencies = adjacencyList.get(taskId) ?? new Set<string>();

  if (dependencies.size === 0) {
    return 'not-started';
  }

  const allDepsComplete = Array.from(dependencies).every((depId) => completedTaskIds.has(depId));

  return allDepsComplete ? 'not-started' : 'blocked';
};

/**
 * Batch-evaluate multiple tasks and return all that need status changes.
 * Used after bulk dependency graph modifications.
 *
 * @param taskIds - Tasks to evaluate
 * @param currentStatuses - Map of task ID to current status
 * @param adjacencyList - The task-level DAG
 * @param completedTaskIds - Set of completed task IDs
 * @returns Array of tasks that need status changes
 */
export const batchDetermineTaskStatuses = (
  taskIds: string[],
  currentStatuses: Map<string, TaskStatus>,
  adjacencyList: AdjacencyList,
  completedTaskIds: Set<string>,
): TaskStatusDetermination[] => {
  return taskIds
    .map((taskId) => {
      const currentStatus = currentStatuses.get(taskId);
      if (!currentStatus) return null;
      return determineTaskStatus(taskId, currentStatus, adjacencyList, completedTaskIds);
    })
    .filter((result): result is TaskStatusDetermination => result !== null && result.shouldChange);
};
