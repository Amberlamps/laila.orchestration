// Derive user story status from child tasks and cross-story dependencies.
// Pure function: no database calls, no side effects.
import type { TaskStatus, UserStoryStatus } from './transition-definitions';
import type { AdjacencyList } from '../dag/types';

/**
 * Task information needed for story status derivation.
 */
export interface StoryTaskInfo {
  id: string;
  status: TaskStatus;
  userStoryId: string;
}

/**
 * Cross-story dependency information.
 * A cross-story dependency exists when a task in this story
 * depends on a task in a different story.
 */
export interface CrossStoryDependency {
  /** The task in this story that has the dependency */
  localTaskId: string;
  /** The task in the other story that must complete first */
  externalTaskId: string;
  /** The other story's ID */
  externalStoryId: string;
  /** Whether the external task is complete */
  isExternalTaskComplete: boolean;
}

/**
 * Result of story status derivation with explanation.
 */
export interface StoryStatusDerivation {
  derivedStatus: UserStoryStatus;
  reason: string;
  /** Cross-story dependencies that are blocking this story (if blocked) */
  blockingDependencies: CrossStoryDependency[];
}

/**
 * Derive a user story's status from its tasks and cross-story dependencies.
 *
 * Priority of derivation (evaluated in order):
 * 1. If currentStatus is "draft" or "failed", return as-is (explicit states)
 * 2. If all tasks are complete -> "complete"
 * 3. If any cross-story dependency is incomplete -> "blocked"
 * 4. If any task is in-progress -> "in-progress"
 * 5. Otherwise -> "not-started"
 *
 * @param storyId - The user story to evaluate
 * @param currentStatus - The story's current explicit status
 * @param storyTasks - All tasks belonging to this story
 * @param adjacencyList - The full task-level DAG
 * @param allTasks - All tasks in the project (for cross-story dep evaluation)
 * @returns Derived status with explanation
 */
export const deriveStoryStatus = (
  storyId: string,
  currentStatus: UserStoryStatus,
  storyTasks: StoryTaskInfo[],
  adjacencyList: AdjacencyList,
  allTasks: Map<string, StoryTaskInfo>,
): StoryStatusDerivation => {
  // Draft and failed are explicit states set by humans.
  // They are not overridden by derivation.
  if (currentStatus === 'draft') {
    return {
      derivedStatus: 'draft',
      reason: 'Story is still in draft state',
      blockingDependencies: [],
    };
  }

  if (currentStatus === 'failed') {
    return {
      derivedStatus: 'failed',
      reason: 'Story has been explicitly marked as failed',
      blockingDependencies: [],
    };
  }

  // Check if the story has any tasks at all.
  if (storyTasks.length === 0) {
    return {
      derivedStatus: currentStatus,
      reason: 'Story has no tasks — status cannot be derived',
      blockingDependencies: [],
    };
  }

  // Check: are ALL tasks complete?
  const allTasksComplete = storyTasks.every((task) => task.status === 'complete');
  if (allTasksComplete) {
    return {
      derivedStatus: 'complete',
      reason: 'All tasks in the story are complete',
      blockingDependencies: [],
    };
  }

  // Check: are there incomplete cross-story dependencies?
  const crossStoryDeps = findCrossStoryDependencies(storyId, storyTasks, adjacencyList, allTasks);
  const blockingDeps = crossStoryDeps.filter((dep) => !dep.isExternalTaskComplete);

  if (blockingDeps.length > 0) {
    return {
      derivedStatus: 'blocked',
      reason: `Blocked by ${String(blockingDeps.length)} incomplete cross-story dependenc${blockingDeps.length === 1 ? 'y' : 'ies'}`,
      blockingDependencies: blockingDeps,
    };
  }

  // Check: is any task in-progress?
  const anyTaskInProgress = storyTasks.some((task) => task.status === 'in-progress');
  if (anyTaskInProgress) {
    return {
      derivedStatus: 'in-progress',
      reason: 'At least one task is currently in progress',
      blockingDependencies: [],
    };
  }

  // Default: all cross-story deps satisfied, no task in progress.
  return {
    derivedStatus: 'not-started',
    reason: 'All cross-story dependencies are satisfied, awaiting assignment',
    blockingDependencies: [],
  };
};

/**
 * Find all cross-story dependencies for tasks in a given story.
 * A cross-story dependency exists when a task in this story
 * depends on a task that belongs to a different story.
 *
 * @param storyId - The story to check
 * @param storyTasks - Tasks belonging to this story
 * @param adjacencyList - The full task-level DAG
 * @param allTasks - All tasks in the project
 * @returns List of cross-story dependencies with completion status
 */
export const findCrossStoryDependencies = (
  storyId: string,
  storyTasks: StoryTaskInfo[],
  adjacencyList: AdjacencyList,
  allTasks: Map<string, StoryTaskInfo>,
): CrossStoryDependency[] => {
  const crossDeps: CrossStoryDependency[] = [];

  for (const task of storyTasks) {
    const taskDeps = adjacencyList.get(task.id) ?? new Set<string>();

    for (const depTaskId of taskDeps) {
      const depTask = allTasks.get(depTaskId);
      if (!depTask) continue;

      // Only include cross-story dependencies (different story).
      if (depTask.userStoryId === storyId) continue;

      crossDeps.push({
        localTaskId: task.id,
        externalTaskId: depTaskId,
        externalStoryId: depTask.userStoryId,
        isExternalTaskComplete: depTask.status === 'complete',
      });
    }
  }

  return crossDeps;
};
