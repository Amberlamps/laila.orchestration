/**
 * @module read-only-guard
 *
 * Guard function that checks if a story (or its tasks) can be modified.
 * Used by PATCH and DELETE handlers to enforce read-only constraints.
 *
 * Stories in "in_progress" or "completed" status are read-only because:
 * - In-progress: a worker is actively executing, modifications could
 *   invalidate the worker's understanding of the story
 * - Completed: work is done and costs recorded, modifications would
 *   break the audit trail
 *
 * This function is reusable for task endpoints as well -- tasks within
 * an in-progress story inherit the read-only constraint.
 */

import { ConflictError, DomainErrorCode } from '@laila/shared';

/** Work statuses that make a story read-only */
const READ_ONLY_STATUSES = ['in_progress', 'done'] as const;

/**
 * Throws ConflictError if the story is in a read-only state.
 *
 * A story is read-only when it is in_progress (assigned to a worker)
 * or done/completed (work is finished and costs recorded).
 *
 * @param storyStatus - The current work status of the story
 * @throws {ConflictError} With READ_ONLY_VIOLATION code when story is read-only
 */
export const assertStoryEditable = (storyStatus: string): void => {
  if (READ_ONLY_STATUSES.includes(storyStatus as (typeof READ_ONLY_STATUSES)[number])) {
    throw new ConflictError(
      DomainErrorCode.READ_ONLY_VIOLATION,
      `Cannot modify story in "${storyStatus}" status. The story is read-only while work is in progress or completed.`,
    );
  }
};
