/**
 * @module race-condition-guards
 *
 * Guards against the timeout/completion race condition.
 * Uses multiple layers of defense for safety-critical correctness.
 *
 * When a worker submits a completion (task or story) at the exact moment
 * the timeout checker fires and attempts to reclaim the story, the system
 * must guarantee that a valid worker completion is never overwritten by a
 * timeout reclamation.
 *
 * ## Defense Layers
 *
 * **Defense Layer 1: Status Check**
 * Both the completion endpoint and timeout checker re-read the story
 * within a transaction before modifying it. If the story is no longer
 * in the expected state, the operation is aborted.
 * (Implemented in timeout-checker.ts and completion endpoints)
 *
 * **Defense Layer 2: Optimistic Locking (Version Check)**
 * Both the completion UPDATE and timeout UPDATE include
 * `WHERE version = <expected>`. If the version has changed
 * (because the other operation succeeded first), the UPDATE
 * affects 0 rows and the operation fails gracefully.
 * (Implemented in timeout-checker.ts and completion endpoints)
 *
 * **Defense Layer 3: Worker Assignment Check**
 * The completion endpoint verifies that the requesting worker
 * is still the assigned worker. If the timeout already cleared
 * the assignment, the completion attempt fails with a
 * WORKER_NOT_ASSIGNED error.
 * (Implemented in this module)
 *
 * ## Worker-Side Error Handling
 *
 * The worker client should handle these specific error codes:
 *
 * - WORKER_NOT_ASSIGNED (403):
 *   The worker was unassigned (timeout or manual). The worker should:
 *   1. Stop working on the current story
 *   2. Request a new assignment via POST /api/v1/orchestration/assign
 *
 * - OPTIMISTIC_LOCK_CONFLICT (409):
 *   Another operation modified the story concurrently. The worker should:
 *   1. Retry the completion request (the version may have changed
 *      due to a non-conflicting update)
 *
 * - INVALID_STATUS_TRANSITION (409):
 *   The story is no longer in a state where the operation is valid. The worker should:
 *   1. Stop working on the current story
 *   2. Request a new assignment
 */

import { createStoryRepository, type DrizzleDb, type UserStory } from '@laila/database';
import { ConflictError, AuthorizationError, DomainErrorCode } from '@laila/shared';

/**
 * Guard for worker completion attempts after potential timeout reclamation.
 *
 * Called within an existing transaction in the task-complete and
 * story-complete endpoints to verify the worker is still entitled to
 * perform the operation. The transactional read ensures the check is
 * consistent with any concurrent modifications.
 *
 * Performs two checks (in this order):
 * 1. **Assignment check** -- the requesting worker must still be the
 *    assigned worker. Checked first because timeout/unassignment clears
 *    the assignment AND changes the status; WORKER_NOT_ASSIGNED gives
 *    the worker a clear, actionable signal.
 * 2. **Status check** -- the story must still be in `in_progress` status.
 *    Only reached if the worker IS still assigned but the status changed
 *    (unusual edge case).
 *
 * @param storyId  - The story the worker is trying to complete work on
 * @param workerId - The worker attempting the completion
 * @param tenantId - The tenant UUID for data isolation
 * @param tx       - Database transaction handle for a consistent read
 * @returns The story record if all checks pass
 * @throws {AuthorizationError} with WORKER_NOT_ASSIGNED if worker is no longer assigned
 * @throws {ConflictError} with INVALID_STATUS_TRANSITION if story is not in_progress
 */
export const guardWorkerStillAssigned = async (
  storyId: string,
  workerId: string,
  tenantId: string,
  tx: DrizzleDb,
): Promise<UserStory> => {
  // Create a story repository scoped to the transaction so the read
  // participates in the same transactional snapshot.
  const txAsDb = tx as unknown as Parameters<typeof createStoryRepository>[0];
  const txStoryRepo = createStoryRepository(txAsDb);

  const story = await txStoryRepo.findById(tenantId, storyId);

  if (!story) {
    throw new ConflictError(
      DomainErrorCode.INVALID_STATUS_TRANSITION,
      `Story ${storyId} no longer exists or was deleted. ` +
        'The story may have been removed while you were working on it.',
      { storyId, currentStatus: 'deleted' },
    );
  }

  // Check 1: Worker must still be the assignee.
  // This check is evaluated FIRST because when a timeout or manual
  // unassignment reclaims a story, it both clears the worker assignment
  // AND changes the status. Returning WORKER_NOT_ASSIGNED gives the
  // worker a clear, actionable signal: stop working and request a new
  // assignment. The current story status is included in the error
  // details for debugging.
  if (story.assignedWorkerId !== workerId) {
    throw new AuthorizationError(
      DomainErrorCode.WORKER_NOT_ASSIGNED,
      'You are no longer assigned to this story. ' +
        'The story may have been reclaimed due to timeout or manual unassignment. ' +
        `Current story status: ${String(story.workStatus)}.`,
      { storyId, currentStatus: String(story.workStatus), currentAssignee: story.assignedWorkerId },
    );
  }

  // Check 2: Story must still be in-progress.
  // If the worker IS still assigned but the status has changed (unusual
  // edge case — e.g., administrative status override), the completion
  // attempt is no longer valid.
  if (story.workStatus !== 'in_progress') {
    throw new ConflictError(
      DomainErrorCode.INVALID_STATUS_TRANSITION,
      `Story is no longer in-progress (current status: ${String(story.workStatus)}). ` +
        'The completion attempt cannot proceed.',
      { storyId, currentStatus: String(story.workStatus) },
    );
  }

  return story;
};
