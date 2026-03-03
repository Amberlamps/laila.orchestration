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
 * Summary of the cascading changes applied after a task completes.
 * Returned to the caller for logging and response enrichment.
 */
export interface CascadeResult {
  /** Task IDs that were unblocked (transitioned from blocked to pending). */
  unblockedTaskIds: string[];
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
  const unblockedTaskIds: string[] = [];

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
      unblockedTaskIds.push(dependent.id);
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Re-derive parent story work status
  // -------------------------------------------------------------------------

  const parentStory = await taskRepo.getParentStory(tenantId, completedTaskId);
  let storyStatus = parentStory?.workStatus ?? 'pending';

  if (parentStory) {
    // Fetch all tasks in the story (use high limit to get all)
    const storyTasks = await taskRepo.findByStory(tenantId, parentStory.id, {
      pagination: { page: 1, limit: 1000, sortBy: 'createdAt', sortOrder: 'asc' },
    });

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
    unblockedTaskIds,
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
 * Derivation rules (evaluated in priority order):
 * 1. If the story is 'in_progress' and all tasks are 'done' -> 'done'
 * 2. If the story is 'in_progress' and tasks are still being worked -> keep 'in_progress'
 * 3. Otherwise -> keep current status
 *
 * Note: We only auto-derive from 'in_progress' stories since that's the
 * state the story is in while tasks are being worked on. Draft/pending/blocked
 * transitions are handled by other flows (assignment, dependency resolution).
 *
 * @param taskStatuses   - Array of work_status values for all tasks in the story
 * @param currentStatus  - The story's current work_status
 * @returns The derived work status
 */
const deriveStoryWorkStatus = (taskStatuses: string[], currentStatus: string): string => {
  // Only auto-derive when the story is in progress
  if (currentStatus !== 'in_progress') {
    return currentStatus;
  }

  // No tasks means we cannot derive
  if (taskStatuses.length === 0) {
    return currentStatus;
  }

  // If all tasks are done, the story is done
  const allDone = taskStatuses.every((s) => s === 'done');
  if (allDone) {
    return 'done';
  }

  // Story stays in_progress while tasks are being worked on
  return 'in_progress';
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
