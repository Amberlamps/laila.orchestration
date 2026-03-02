// Computes cascading status changes when a task completes.
// Pure function: takes current state, returns list of status commands.
// The API layer executes the commands against the database.
import { deriveEpicStatus } from './epic-status-derivation';
import { deriveStoryStatus } from './story-status-derivation';

import type { EpicStoryInfo } from './epic-status-derivation';
import type { TaskStatus, UserStoryStatus, EpicStatus } from './transition-definitions';
import type { AdjacencyList } from '../dag/types';

/**
 * Minimal task state needed for cascading re-evaluation.
 */
export interface TaskState {
  id: string;
  status: TaskStatus;
  userStoryId: string;
}

/**
 * Minimal user story state needed for cascading re-evaluation.
 */
export interface UserStoryState {
  id: string;
  status: UserStoryStatus;
  epicId: string;
  taskIds: string[];
}

/**
 * Minimal epic state needed for cascading re-evaluation.
 */
export interface EpicState {
  id: string;
  status: EpicStatus;
  userStoryIds: string[];
}

/**
 * A status change command produced by the cascade computation.
 * The API layer executes these commands against the database.
 */
export type StatusChangeCommand =
  | { entity: 'task'; id: string; from: TaskStatus; to: TaskStatus; reason: string }
  | { entity: 'user-story'; id: string; from: UserStoryStatus; to: UserStoryStatus; reason: string }
  | { entity: 'epic'; id: string; from: EpicStatus; to: EpicStatus; reason: string };

/**
 * Compute all cascading status changes triggered by a task completing.
 *
 * Algorithm:
 * 1. Find all direct dependents of the completed task.
 * 2. For each dependent: check if all its dependencies are now complete.
 *    If yes, emit a blocked->not-started transition command.
 * 3. Collect all affected user stories (stories containing changed tasks).
 * 4. Re-evaluate each affected story's status.
 * 5. Collect all affected epics (epics containing changed stories).
 * 6. Re-evaluate each affected epic's status.
 *
 * @param completedTaskId - The task that just completed
 * @param adjacencyList - The task-level DAG (task -> set of dependencies)
 * @param reverseDeps - Reverse DAG (task -> set of dependents)
 * @param tasks - Current state of all tasks in the project
 * @param stories - Current state of all user stories in the project
 * @param epics - Current state of all epics in the project
 * @returns List of status change commands to execute
 */
export const computeCascadingChanges = (
  completedTaskId: string,
  adjacencyList: AdjacencyList,
  reverseDeps: AdjacencyList,
  tasks: Map<string, TaskState>,
  stories: Map<string, UserStoryState>,
  epics: Map<string, EpicState>,
): StatusChangeCommand[] => {
  const commands: StatusChangeCommand[] = [];
  const affectedStoryIds = new Set<string>();

  // Step 1: Find tasks that depend on the completed task.
  const dependents = reverseDeps.get(completedTaskId) ?? new Set<string>();

  // Step 2: Check each dependent -- are all its deps now complete?
  for (const dependentId of dependents) {
    const dependentTask = tasks.get(dependentId);
    if (!dependentTask || dependentTask.status !== 'blocked') continue;

    const deps = adjacencyList.get(dependentId) ?? new Set<string>();
    const allDepsComplete = Array.from(deps).every((depId) => {
      const depTask = tasks.get(depId);
      return depTask?.status === 'complete';
    });

    if (!allDepsComplete) continue;

    commands.push({
      entity: 'task',
      id: dependentId,
      from: 'blocked',
      to: 'not-started',
      reason: `All dependencies of task "${dependentId}" are now complete`,
    });

    // Track the story for re-evaluation.
    affectedStoryIds.add(dependentTask.userStoryId);
  }

  // Also track the story of the completed task itself.
  const completedTask = tasks.get(completedTaskId);
  if (completedTask) {
    affectedStoryIds.add(completedTask.userStoryId);
  }

  // Steps 3-4: Re-evaluate affected stories.
  // Build projected task states by applying the task-level commands we just computed.
  // This ensures story derivation sees the "would-be" state after task unblocking.
  const projectedTasks = new Map<string, TaskState>();
  for (const [id, task] of tasks) {
    projectedTasks.set(id, { ...task });
  }
  for (const cmd of commands) {
    if (cmd.entity === 'task') {
      const task = projectedTasks.get(cmd.id);
      if (task) {
        projectedTasks.set(cmd.id, { ...task, status: cmd.to });
      }
    }
  }

  const affectedEpicIds = new Set<string>();
  const storyStatusChanges = new Map<string, UserStoryStatus>();

  for (const storyId of affectedStoryIds) {
    const story = stories.get(storyId);
    if (!story) continue;

    // Build the task list for this story using projected states.
    const storyTasks = story.taskIds
      .map((taskId) => projectedTasks.get(taskId))
      .filter((t): t is TaskState => t !== undefined);

    const derivation = deriveStoryStatus(
      storyId,
      story.status,
      storyTasks,
      adjacencyList,
      projectedTasks,
    );

    if (derivation.derivedStatus !== story.status) {
      commands.push({
        entity: 'user-story',
        id: storyId,
        from: story.status,
        to: derivation.derivedStatus,
        reason: derivation.reason,
      });
      storyStatusChanges.set(storyId, derivation.derivedStatus);
    }

    affectedEpicIds.add(story.epicId);
  }

  // Steps 5-6: Re-evaluate affected epics.
  // Use projected story statuses (from commands above) where available.
  for (const epicId of affectedEpicIds) {
    const epic = epics.get(epicId);
    if (!epic) continue;

    const epicStories: EpicStoryInfo[] = epic.userStoryIds
      .map((sid) => {
        const story = stories.get(sid);
        if (!story) return undefined;
        const projectedStatus = storyStatusChanges.get(sid) ?? story.status;
        return { id: sid, status: projectedStatus };
      })
      .filter((s): s is EpicStoryInfo => s !== undefined);

    const derivation = deriveEpicStatus(epicStories);

    if (derivation.derivedStatus !== epic.status) {
      commands.push({
        entity: 'epic',
        id: epicId,
        from: epic.status,
        to: derivation.derivedStatus,
        reason: derivation.reason,
      });
    }
  }

  return commands;
};

/**
 * Build the reverse dependency map from the forward adjacency list.
 * If A depends on B (forward: A -> Set(B)),
 * then B has a dependent A (reverse: B -> Set(A)).
 *
 * @param adjacencyList - The forward dependency DAG
 * @returns The reverse dependency DAG
 */
export const buildReverseDeps = (adjacencyList: AdjacencyList): AdjacencyList => {
  const reverseDeps: AdjacencyList = new Map();

  for (const [node, deps] of adjacencyList) {
    for (const dep of deps) {
      const existing = reverseDeps.get(dep);
      if (existing) {
        existing.add(node);
      } else {
        reverseDeps.set(dep, new Set([node]));
      }
    }
  }

  return reverseDeps;
};
