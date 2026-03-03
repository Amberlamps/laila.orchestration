/**
 * @module atomic-assignment
 *
 * Atomic story assignment using optimistic locking.
 *
 * This module performs the write operations for story assignment:
 * 1. UPDATE the story with version check + status guard + null-worker guard
 * 2. INSERT an attempt_history record
 * 3. Conditionally UPDATE the project lifecycle to 'in-progress'
 *
 * The caller is responsible for opening a database transaction and passing
 * the `tx` handle. This allows the assignment writes to participate in the
 * same transaction as the eligibility reads and response-building reads,
 * ensuring end-to-end consistency.
 *
 * The optimistic lock uses a version integer column on the stories table.
 * Every mutation to the story increments the version. The assignment
 * UPDATE's WHERE clause includes the version, so concurrent writes are
 * serialized: the first writer wins, subsequent writers see that the
 * version has changed and fail gracefully with a retry-safe conflict.
 */

import {
  userStoriesTable,
  attemptHistoryTable,
  projectsTable,
  type DrizzleDb,
} from '@laila/database';
import { ConflictError, DomainErrorCode } from '@laila/shared';
import { eq, and, isNull, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The result of a successful atomic assignment.
 *
 * Contains the assigned story fields that the caller needs to build
 * the API response, plus the updated version for subsequent operations.
 */
export interface AtomicAssignmentResult {
  /** The assigned story's ID */
  storyId: string;
  /** The worker that was assigned */
  workerId: string;
  /** The new version after assignment (originalVersion + 1) */
  newVersion: number;
  /** Whether the project was transitioned to 'in-progress' */
  projectTransitioned: boolean;
}

// ---------------------------------------------------------------------------
// Core assignment function
// ---------------------------------------------------------------------------

/**
 * Assigns a story to a worker using optimistic locking.
 *
 * The caller must provide an active transaction handle (`tx`). All
 * operations execute within that transaction so they can be grouped
 * with the eligibility reads and response-building reads in one
 * atomic unit.
 *
 * Operations performed:
 * 1. UPDATE the story with version check + status guard + null-worker guard
 * 2. INSERT an attempt_history record
 * 3. Conditionally UPDATE the project's lifecycleStatus to 'in-progress'
 *    if it is currently 'ready' (first-assignment transition)
 *
 * If the story UPDATE affects 0 rows, it means either:
 * - Another worker won the race (version mismatch)
 * - The story status changed since eligibility evaluation
 * - The story was already assigned
 * In all cases, a retry-safe ConflictError is thrown.
 *
 * @param tx              - An active Drizzle transaction handle
 * @param tenantId        - Tenant UUID for data isolation
 * @param storyId         - The story to assign
 * @param workerId        - The worker to assign to
 * @param expectedVersion - The version read during eligibility evaluation
 * @param projectId       - The project containing this story (for lifecycle update)
 * @returns The assignment result with new version and project transition flag
 * @throws ConflictError with OPTIMISTIC_LOCK_CONFLICT if assignment fails
 */
export async function atomicAssignStory(
  tx: DrizzleDb,
  tenantId: string,
  storyId: string,
  workerId: string,
  expectedVersion: number,
  projectId: string,
): Promise<AtomicAssignmentResult> {
  const now = new Date();

  // -------------------------------------------------------------------
  // Step 1: Atomically update story with optimistic lock + state guards
  // -------------------------------------------------------------------
  // The WHERE clause ensures:
  // - version matches (no concurrent modification)
  // - workStatus = 'ready' (story is in an assignable state)
  // - assignedWorkerId IS NULL (not already assigned)
  // This is the core concurrency-safety mechanism.
  const updateResult = await tx
    .update(userStoriesTable)
    .set({
      assignedWorkerId: workerId,
      assignedAt: now,
      lastActivityAt: now,
      workStatus: 'in_progress',
      attempts: sql`${userStoriesTable.attempts} + 1`,
      version: sql`${userStoriesTable.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(userStoriesTable.id, storyId),
        eq(userStoriesTable.tenantId, tenantId),
        eq(userStoriesTable.version, expectedVersion),
        eq(userStoriesTable.workStatus, 'ready'),
        isNull(userStoriesTable.assignedWorkerId),
      ),
    )
    .returning();

  const updatedStory = updateResult[0];

  if (!updatedStory) {
    // The UPDATE affected 0 rows. This means either:
    // 1. Another worker assigned the story (version mismatch)
    // 2. The story status changed (no longer 'ready')
    // 3. The story was already assigned (assignedWorkerId not null)
    // In all cases, throw a retry-safe conflict error.
    throw new ConflictError(
      DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
      'Story was assigned to another worker or is no longer available. ' +
        'Please retry to get a new assignment.',
      { storyId, expectedVersion },
    );
  }

  // -------------------------------------------------------------------
  // Step 2: Record the assignment attempt in history
  // -------------------------------------------------------------------
  await tx.insert(attemptHistoryTable).values({
    tenantId,
    userStoryId: storyId,
    workerId,
    attemptNumber: updatedStory.attempts,
    startedAt: now,
    status: 'in_progress',
  });

  // -------------------------------------------------------------------
  // Step 3: Transition project to 'in-progress' if currently 'ready'
  // -------------------------------------------------------------------
  // When the first story in a project is assigned, the project should
  // move from 'ready' to 'in-progress'. We use a conditional UPDATE
  // that only affects the project if its current status is 'ready'.
  // If the project is already 'in-progress', this is a no-op.
  let projectTransitioned = false;

  const projectUpdateResult = await tx
    .update(projectsTable)
    .set({
      lifecycleStatus: 'in-progress',
      updatedAt: now,
      version: sql`${projectsTable.version} + 1`,
    })
    .where(
      and(
        eq(projectsTable.id, projectId),
        eq(projectsTable.tenantId, tenantId),
        eq(projectsTable.lifecycleStatus, 'ready'),
        isNull(projectsTable.deletedAt),
      ),
    )
    .returning();

  if (projectUpdateResult.length > 0) {
    projectTransitioned = true;
  }

  return {
    storyId: updatedStory.id,
    workerId,
    newVersion: updatedStory.version,
    projectTransitioned,
  };
}
