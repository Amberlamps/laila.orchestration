/**
 * @module cascading-reevaluation
 *
 * Cascading status re-evaluation utility for task completion.
 *
 * When a task completes, this module triggers a synchronous cascade:
 * 1. Find all downstream tasks that depend on the completed task
 * 2. For each dependent: check if ALL its dependencies are now complete
 * 3. If so, transition the dependent from 'blocked' to 'pending'
 * 4. Re-derive the parent story's work status
 * 5. Re-derive the parent epic's work status
 * 6. Re-derive the parent project's work status
 *
 * All operations run within the caller's database transaction to
 * maintain atomicity with the task status update. In v1 this is a
 * synchronous cascade; the architecture supports migration to
 * SQS-based async processing in v2 without changing the API contract.
 */

import {
  createTaskRepository,
  createStoryRepository,
  createEpicRepository,
  createProjectRepository,
} from '@laila/database';

import type { DrizzleDb } from '@laila/database';
import type { WorkStatus } from '@laila/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A task that was unblocked by the cascading re-evaluation.
 * Contains the task's id, name (title), and new status for the API response.
 */
export interface UnblockedTask {
  /** The unblocked task's UUID. */
  id: string;
  /** The unblocked task's human-readable name (title). */
  name: string;
  /** The new status the task transitioned to (always 'pending' in the DB). */
  newStatus: string;
}

/**
 * Summary of the cascading changes applied after a task completes.
 * Returned to the caller for logging and response enrichment.
 */
export interface CascadeResult {
  /** Tasks that were unblocked (transitioned from blocked to pending), with id, name, and new status. */
  unblockedTasks: UnblockedTask[];
  /** Whether all tasks in the parent story are now done. */
  allTasksComplete: boolean;
  /** The parent story's new work status after re-derivation. */
  storyStatus: string;
  /** The parent epic's new work status after re-derivation. */
  epicStatus: string;
  /** The parent project's new work status after re-derivation. */
  projectStatus: string;
}

// ---------------------------------------------------------------------------
// Cascade logic
// ---------------------------------------------------------------------------

/**
 * Triggers cascading status re-evaluation after a task completes.
 *
 * Runs within the caller's transaction handle so that the task status
 * update and all cascading changes are atomic — either all commit or
 * all roll back.
 *
 * Algorithm:
 * 1. Find all direct dependents of the completed task.
 * 2. For each dependent that is currently 'blocked', check if ALL its
 *    upstream dependencies are now 'done'. If so, transition it to 'pending'.
 * 3. Look up the parent story, its epic, and project.
 * 4. Re-derive the parent story's work status from its child tasks.
 * 5. Re-derive the parent epic's work status from its child stories.
 * 6. Re-derive the parent project's work status from its child epics.
 *
 * @param tenantId        - The tenant UUID for data isolation
 * @param completedTaskId - The task that just completed
 * @param tx              - Database transaction handle for atomicity
 * @returns Summary of cascading changes applied
 */
export const triggerCascadingReevaluation = async (
  tenantId: string,
  completedTaskId: string,
  tx: DrizzleDb,
): Promise<CascadeResult> => {
  // Create repositories scoped to the transaction handle.
  // The tx has the same query builder API as Database/PoolDatabase,
  // so the cast is safe at runtime.
  const txAsDb = tx as unknown as Parameters<typeof createTaskRepository>[0];
  const taskRepo = createTaskRepository(txAsDb);
  const storyRepo = createStoryRepository(txAsDb);
  const epicRepo = createEpicRepository(txAsDb);
  const projectRepo = createProjectRepository(txAsDb);

  // -------------------------------------------------------------------------
  // Step 1-3: Unblock dependent tasks
  // -------------------------------------------------------------------------

  const dependentTasks = await taskRepo.getDependents(tenantId, completedTaskId);
  const unblockedTasks: UnblockedTask[] = [];

  for (const dependent of dependentTasks) {
    // Only consider tasks that are currently blocked
    if (dependent.workStatus !== 'blocked') {
      continue;
    }

    // Check if ALL of this dependent's prerequisites are now done
    const dependencies = await taskRepo.getDependencies(tenantId, dependent.id);
    const allDepsComplete = dependencies.every((dep) => dep.workStatus === 'done');

    if (allDepsComplete) {
      await taskRepo.bulkUpdateStatus(tenantId, [dependent.id], 'pending');
      unblockedTasks.push({ id: dependent.id, name: dependent.title, newStatus: 'pending' });
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Check if all tasks in the parent story are complete and
  //         re-derive story work status.
  //
  // IMPORTANT: The story is NOT auto-completed to 'done' even when all
  // tasks are done. The worker must explicitly call the story completion
  // endpoint with cost data. We only signal `allTasksComplete` as a hint.
  // -------------------------------------------------------------------------

  const parentStory = await taskRepo.getParentStory(tenantId, completedTaskId);
  let storyStatus = parentStory?.workStatus ?? 'pending';
  let allTasksComplete = false;

  if (parentStory) {
    // Fetch all tasks in the story (use high limit to get all)
    const storyTasks = await taskRepo.findByStory(tenantId, parentStory.id, {
      pagination: { page: 1, limit: 1000, sortBy: 'createdAt', sortOrder: 'asc' },
    });

    allTasksComplete = storyTasks.data.every((t) => t.workStatus === 'done');

    // Re-derive story status but never auto-complete to 'done'.
    // The story stays 'in_progress' even when all tasks are done;
    // the worker must explicitly complete the story with cost data.
    const derivedStoryStatus = deriveStoryWorkStatus(
      storyTasks.data.map((t) => t.workStatus),
      parentStory.workStatus,
    );

    if (derivedStoryStatus !== parentStory.workStatus) {
      await storyRepo.update(
        tenantId,
        parentStory.id,
        { workStatus: derivedStoryStatus },
        parentStory.version,
      );
      storyStatus = derivedStoryStatus;
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Re-derive parent epic work status
  // -------------------------------------------------------------------------

  let epicStatus = 'pending';

  if (parentStory) {
    epicStatus = await epicRepo.computeDerivedStatus(tenantId, parentStory.epicId);
  }

  // -------------------------------------------------------------------------
  // Step 6: Re-derive parent project work status
  // -------------------------------------------------------------------------

  let projectStatus = 'pending';

  if (parentStory) {
    const projectId = await taskRepo.getProjectIdForTask(tenantId, completedTaskId);

    if (projectId) {
      const derivedProjectStatus = deriveProjectWorkStatus(
        await epicRepo.findAllByProject(tenantId, projectId),
      );

      if (derivedProjectStatus) {
        await projectRepo.updateWorkStatus(tenantId, projectId, derivedProjectStatus as WorkStatus);
        projectStatus = derivedProjectStatus;
      }
    }
  }

  return {
    unblockedTasks,
    allTasksComplete,
    storyStatus,
    epicStatus,
    projectStatus,
  };
};

// ---------------------------------------------------------------------------
// Story work status derivation
// ---------------------------------------------------------------------------

/**
 * Derives the story work status from its child task statuses.
 *
 * IMPORTANT: The story is NEVER auto-completed to 'done' by task
 * completion. The worker must explicitly call the story completion
 * endpoint with cost data (cost_usd, cost_tokens). This function
 * only handles transitions that do not require explicit worker action.
 *
 * Derivation rules (evaluated in priority order):
 * 1. If the story is not 'in_progress' -> keep current status
 * 2. If the story is 'in_progress' -> keep 'in_progress'
 *    (even when all tasks are done; the worker must explicitly complete)
 *
 * Note: Draft/pending/blocked transitions are handled by other flows
 * (assignment, dependency resolution).
 *
 * @param _taskStatuses  - Array of work_status values for all tasks in the story (unused; kept for signature compatibility)
 * @param currentStatus  - The story's current work_status
 * @returns The derived work status (never 'done' from this function)
 */
const deriveStoryWorkStatus = (_taskStatuses: string[], currentStatus: string): string => {
  // Story status is never auto-derived to 'done' during task completion.
  // The worker must explicitly complete the story with cost data.
  return currentStatus;
};

// ---------------------------------------------------------------------------
// Project work status derivation
// ---------------------------------------------------------------------------

/**
 * Derives a project's work status by examining all its epics' current
 * work statuses (which have already been re-derived by computeDerivedStatus).
 *
 * Rules:
 * 1. All epics done -> 'done'
 * 2. Any epic in_progress or done (mixed) -> 'in_progress'
 * 3. Otherwise -> null (no change needed)
 *
 * @param epics - All epics in the project with their current work statuses
 * @returns The derived work status for the project, or null if no change
 */
const deriveProjectWorkStatus = (epics: ReadonlyArray<{ workStatus: string }>): string | null => {
  if (epics.length === 0) {
    return null;
  }

  const allDone = epics.every((e) => e.workStatus === 'done');
  if (allDone) {
    return 'done';
  }

  const anyActive = epics.some((e) => e.workStatus === 'in_progress' || e.workStatus === 'done');
  if (anyActive) {
    return 'in_progress';
  }

  return null;
};
