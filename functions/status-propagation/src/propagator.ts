/**
 * Status propagation logic for the status-propagation Lambda function.
 *
 * Propagates status changes from tasks upward to stories and epics.
 * Story status is derived from the aggregated statuses of its child tasks.
 * Epic status is derived from the aggregated statuses of its child stories.
 *
 * Aggregation rules follow the DAG status model defined in the design spec.
 */

import {
  findStoryById,
  findStoryForTask,
  findTasksByStoryId,
  findEpicById,
  findStoriesByEpicId,
  updateStoryStatus,
  updateEpicStatus,
  withTransaction,
} from './db';

import type { StatusPropagationLogger } from './logger';
import type { PropagationResult, TaskRow, StoryRow } from './types';
import type { Database, PoolDatabase } from '@laila/database';
import type { WorkStatus } from '@laila/shared';

// ---------------------------------------------------------------------------
// Status aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Derive a story's status from the aggregated statuses of its child tasks.
 *
 * Aggregation rules:
 * - All tasks "done"                           -> "done"
 * - Any task "in_progress" or "review"         -> "in_progress"
 * - All tasks "blocked"                        -> "blocked"
 * - Mix of "not_started"/"pending"/"blocked"   -> "not_started"
 * - Any task "failed"                          -> "failed" (takes precedence over in_progress)
 *
 * Note: story status is only auto-updated if no worker is currently assigned.
 * A story with an assigned worker retains its current status regardless of
 * task states, because the worker is actively managing those transitions.
 */
export const deriveStoryStatus = (tasks: TaskRow[]): WorkStatus => {
  if (tasks.length === 0) {
    return 'pending';
  }

  const statuses = tasks.map((t) => t.workStatus);

  // Check terminal/active states first
  const allDone = statuses.every((s) => s === 'done');
  if (allDone) {
    return 'done';
  }

  const anyFailed = statuses.some((s) => s === 'failed');
  if (anyFailed) {
    return 'failed';
  }

  const anyActive = statuses.some((s) => s === 'in_progress' || s === 'review');
  if (anyActive) {
    return 'in_progress';
  }

  const allBlocked = statuses.every((s) => s === 'blocked');
  if (allBlocked) {
    return 'blocked';
  }

  // Mix of pending, blocked, done (partial completion)
  const anyDone = statuses.some((s) => s === 'done');
  const anyPending = statuses.some((s) => s === 'pending');
  if (anyDone && anyPending) {
    return 'in_progress';
  }

  return 'pending';
};

/**
 * Derive an epic's status from the aggregated statuses of its child stories.
 *
 * Aggregation rules (in priority order):
 * - All stories "done"                                      -> "done"
 * - All stories "pending"/"not_started" (nothing started)   -> "pending"
 * - All stories "blocked"                                   -> "blocked"
 * - Any active story (in_progress/pending/review)           -> "in_progress"
 *   (active takes precedence over failed -- work is still ongoing)
 * - Any story "failed" (with no active work)                -> "failed"
 * - Mixed states (e.g., done + blocked)                     -> "in_progress"
 */
export const deriveEpicStatus = (stories: StoryRow[]): WorkStatus => {
  if (stories.length === 0) {
    return 'pending';
  }

  const statuses = stories.map((s) => s.workStatus);

  const allDone = statuses.every((s) => s === 'done');
  if (allDone) {
    return 'done';
  }

  const allPending = statuses.every((s) => s === 'pending' || s === 'not_started');
  if (allPending) {
    return 'pending';
  }

  const allBlocked = statuses.every((s) => s === 'blocked');
  if (allBlocked) {
    return 'blocked';
  }

  // Active work takes precedence over failed -- the epic is still in progress
  // when any story is actively being worked on, even if others have failed
  const anyActive = statuses.some((s) => s === 'in_progress' || s === 'pending' || s === 'review');
  if (anyActive) {
    return 'in_progress';
  }

  // Only report failed when no active work is happening
  const anyFailed = statuses.some((s) => s === 'failed');
  if (anyFailed) {
    return 'failed';
  }

  // Mixed states (e.g., done + blocked) indicate partial progress
  return 'in_progress';
};

// ---------------------------------------------------------------------------
// Story propagation
// ---------------------------------------------------------------------------

/**
 * Re-evaluate a story's status based on its child task statuses.
 *
 * Finds the parent story for the given task, queries all sibling tasks,
 * derives the aggregated status, and updates the story if the status
 * should change.
 *
 * Skips auto-update if a worker is currently assigned to the story,
 * because the worker is actively managing task transitions.
 *
 * @returns The propagation result if the story status changed, or null
 */
export const propagateToStory = async (
  db: Database | PoolDatabase,
  taskId: string,
  projectId: string,
  tenantId: string,
  log: StatusPropagationLogger,
): Promise<PropagationResult | null> => {
  // Find the parent story (tenant+project scoped)
  const story = await findStoryForTask(db, taskId, tenantId, projectId);

  if (!story) {
    log.debug({ taskId }, 'No parent story found for task -- skipping story propagation');
    return null;
  }

  // Skip if a worker is actively assigned
  if (story.assignedWorkerId) {
    log.debug(
      { storyId: story.id, assignedWorkerId: story.assignedWorkerId },
      'Story has an assigned worker -- skipping auto-status update',
    );
    return null;
  }

  // Query all tasks for this story (tenant+project scoped)
  const tasks = await findTasksByStoryId(db, story.id, tenantId, projectId);

  if (tasks.length === 0) {
    log.debug({ storyId: story.id }, 'Story has no tasks -- skipping propagation');
    return null;
  }

  // Derive the aggregated status
  const derivedStatus = deriveStoryStatus(tasks);

  // Only update if the status is actually changing
  if (derivedStatus === story.workStatus) {
    log.debug(
      { storyId: story.id, currentStatus: story.workStatus },
      'Story status unchanged after aggregation -- no update needed',
    );
    return null;
  }

  log.info(
    {
      storyId: story.id,
      storyTitle: story.title,
      previousStatus: story.workStatus,
      newStatus: derivedStatus,
    },
    'Propagating status change to story',
  );

  // Update within a transaction
  const updated = await withTransaction(db, async (tx) => {
    return updateStoryStatus(tx, story.id, story.tenantId, derivedStatus);
  });

  if (!updated) {
    log.debug(
      { storyId: story.id },
      'Story status update skipped -- concurrent modification detected',
    );
    return null;
  }

  return {
    entityId: story.id,
    entityType: 'story',
    entityName: story.title,
    previousStatus: story.workStatus as WorkStatus,
    newStatus: derivedStatus,
    tenantId: story.tenantId,
    projectId,
  };
};

// ---------------------------------------------------------------------------
// Epic propagation
// ---------------------------------------------------------------------------

/**
 * Re-evaluate an epic's status based on its child story statuses.
 *
 * Finds the epic for the given story, queries all sibling stories,
 * derives the aggregated status, and updates the epic if the status
 * should change.
 *
 * @returns The propagation result if the epic status changed, or null
 */
export const propagateToEpic = async (
  db: Database | PoolDatabase,
  storyId: string,
  projectId: string,
  tenantId: string,
  log: StatusPropagationLogger,
): Promise<PropagationResult | null> => {
  // Find the parent story to get the epicId (tenant+project scoped)
  const story = await findStoryById(db, storyId, tenantId, projectId);

  if (!story) {
    log.debug({ storyId }, 'Story not found -- skipping epic propagation');
    return null;
  }

  // Find the epic (tenant+project scoped)
  const epic = await findEpicById(db, story.epicId, tenantId, projectId);

  if (!epic) {
    log.debug(
      { storyId, epicId: story.epicId },
      'No parent epic found -- skipping epic propagation',
    );
    return null;
  }

  // Query all stories for this epic (tenant+project scoped)
  const stories = await findStoriesByEpicId(db, epic.id, tenantId, projectId);

  if (stories.length === 0) {
    log.debug({ epicId: epic.id }, 'Epic has no stories -- skipping propagation');
    return null;
  }

  // Derive the aggregated status
  const derivedStatus = deriveEpicStatus(stories);

  // Only update if the status is actually changing
  if (derivedStatus === epic.workStatus) {
    log.debug(
      { epicId: epic.id, currentStatus: epic.workStatus },
      'Epic status unchanged after aggregation -- no update needed',
    );
    return null;
  }

  log.info(
    {
      epicId: epic.id,
      epicName: epic.name,
      previousStatus: epic.workStatus,
      newStatus: derivedStatus,
    },
    'Propagating status change to epic',
  );

  // Update within a transaction
  const updated = await withTransaction(db, async (tx) => {
    return updateEpicStatus(tx, epic.id, epic.tenantId, derivedStatus);
  });

  if (!updated) {
    log.debug(
      { epicId: epic.id },
      'Epic status update skipped -- concurrent modification detected',
    );
    return null;
  }

  return {
    entityId: epic.id,
    entityType: 'epic',
    entityName: epic.name,
    previousStatus: epic.workStatus as WorkStatus,
    newStatus: derivedStatus,
    tenantId: epic.tenantId,
    projectId,
  };
};
