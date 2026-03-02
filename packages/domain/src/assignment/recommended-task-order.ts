// Computes the recommended task execution order within a user story.
// Uses topological sort of the intra-story task dependency subgraph.
// Pure function: no database calls, no side effects.
import { topologicalSortForStory } from '../dag/topological-sort';

import type { AdjacencyList } from '../dag/types';
import type { TaskStatus } from '../status/transition-definitions';

/**
 * Task information needed for order computation.
 */
export interface TaskOrderInfo {
  id: string;
  status: TaskStatus;
}

/**
 * Recommended task execution order for an assigned story.
 */
export interface RecommendedTaskOrder {
  /** Tasks in recommended execution order (dependency-respecting) */
  orderedTasks: string[];
  /** Tasks that are immediately ready to start (no incomplete intra-story deps) */
  readyNow: string[];
  /** Tasks that are blocked by other tasks within this story */
  blocked: string[];
  /** Tasks that are already complete (for reference) */
  completed: string[];
  /** Tasks that are currently in progress */
  inProgress: string[];
}

/**
 * Compute the recommended task execution order for a user story.
 *
 * Algorithm:
 * 1. Filter the full DAG to only intra-story task dependencies.
 * 2. Run topological sort on the intra-story subgraph.
 * 3. Classify tasks by their current status and dependency state:
 *    - readyNow: not-started AND all intra-story deps complete
 *    - blocked: not-started/blocked AND some intra-story dep incomplete
 *    - completed: already complete
 *    - inProgress: currently being worked on
 *
 * The execution agent should work on tasks from readyNow first,
 * then re-query for the next ready tasks as they complete.
 *
 * @param storyTaskIds - All task IDs belonging to the story
 * @param taskStatuses - Current status of each task
 * @param adjacencyList - The full project-wide task DAG
 * @returns Recommended order with readiness classification
 */
export const computeRecommendedTaskOrder = (
  storyTaskIds: string[],
  taskStatuses: Map<string, TaskOrderInfo>,
  adjacencyList: AdjacencyList,
): RecommendedTaskOrder => {
  // Step 1: Run topological sort for intra-story tasks.
  const sortResult = topologicalSortForStory(adjacencyList, storyTaskIds);

  // If topological sort fails (cycle), fall back to original order.
  // This should never happen if the DAG is validated, but handle gracefully.
  const orderedTasks = sortResult.success ? sortResult.sorted : [...storyTaskIds];

  // Step 2: Classify tasks by readiness.
  const readyNow: string[] = [];
  const blocked: string[] = [];
  const completed: string[] = [];
  const inProgress: string[] = [];

  // Get the set of tasks within this story for intra-story dep filtering.
  const storyTaskSet = new Set(storyTaskIds);

  for (const taskId of orderedTasks) {
    const taskInfo = taskStatuses.get(taskId);
    if (!taskInfo) continue;

    switch (taskInfo.status) {
      case 'complete':
        completed.push(taskId);
        break;

      case 'in-progress':
        inProgress.push(taskId);
        break;

      case 'not-started': {
        // Check if all intra-story dependencies are complete.
        const deps = adjacencyList.get(taskId) ?? new Set<string>();
        const intraStoryDeps = Array.from(deps).filter((depId) => storyTaskSet.has(depId));
        const allIntraDepsComplete = intraStoryDeps.every((depId) => {
          const depInfo = taskStatuses.get(depId);
          return depInfo?.status === 'complete';
        });

        if (allIntraDepsComplete) {
          readyNow.push(taskId);
        } else {
          blocked.push(taskId);
        }
        break;
      }

      case 'blocked':
        blocked.push(taskId);
        break;
    }
  }

  return {
    orderedTasks,
    readyNow,
    blocked,
    completed,
    inProgress,
  };
};

/**
 * Get the next task(s) to work on in a story.
 * Convenience function that returns only the ready tasks
 * in recommended order.
 *
 * @param storyTaskIds - All task IDs in the story
 * @param taskStatuses - Current status of each task
 * @param adjacencyList - The full project-wide task DAG
 * @returns Ordered list of tasks that are ready to start
 */
export const getNextReadyTasks = (
  storyTaskIds: string[],
  taskStatuses: Map<string, TaskOrderInfo>,
  adjacencyList: AdjacencyList,
): string[] => {
  const order = computeRecommendedTaskOrder(storyTaskIds, taskStatuses, adjacencyList);
  return order.readyNow;
};
