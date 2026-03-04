/**
 * Database operations for the timeout-checker Lambda function.
 *
 * Provides query and mutation functions for detecting and reclaiming
 * timed-out story assignments. All database operations use Drizzle ORM
 * with the Neon serverless driver.
 */

import {
  createDrizzleClient,
  createStoryRepository,
  createTaskRepository,
  createEpicRepository,
  createProjectRepository,
  userStoriesTable,
  attemptHistoryTable,
  type DrizzleDb,
  type Database,
  type PoolDatabase,
} from '@laila/database';
import { eq, and, sql } from 'drizzle-orm';

import type { ReclaimedStorySummary } from './orchestration';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Create a pool-mode Drizzle client (required for transaction support). */
export const createPoolClient = (url: string): Database | PoolDatabase =>
  createDrizzleClient({ mode: 'pool', url });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Find all in-progress stories with their project timeout settings.
 *
 * Returns stories that have a non-null assigned worker and are
 * currently in the "in_progress" work status. Each record includes the
 * parent project's `workerInactivityTimeoutMinutes` for per-project
 * timeout evaluation.
 */
export const findInProgressStoriesWithTimeout = async (db: Database | PoolDatabase) => {
  const storyRepo = createStoryRepository(db);
  return storyRepo.findInProgressWithTimeout();
};

// ---------------------------------------------------------------------------
// Transactional reclamation
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a story row used within the reclamation transaction.
 * Typed explicitly to avoid `unknown` field types from the generic
 * SelectModel inferred by the base repository.
 */
interface StorySnapshot {
  id: string;
  workStatus: string;
  epicId: string;
  version: number;
}

/**
 * Reclaim a single timed-out story within a transaction.
 *
 * The transaction ensures atomicity:
 * 1. Re-read the story to check for race conditions
 * 2. Determine new status via DAG analysis (not_started or blocked)
 * 3. Capture task status snapshot
 * 4. Reset in-progress tasks (preserve completed tasks)
 * 5. Clear worker assignment and reset story status
 * 6. Update attempt history with timeout details
 * 7. Re-derive parent epic and project statuses
 *
 * @returns The reclaimed story summary, or null if the story was
 *          no longer in-progress (race condition — skip safely)
 */
export const reclaimTimedOutStory = async (
  db: Database | PoolDatabase,
  storyId: string,
  tenantId: string,
  storyTitle: string,
  assignedWorkerId: string,
  attempts: number,
  minutesSinceActivity: number,
  projectTimeoutMinutes: number,
): Promise<ReclaimedStorySummary | null> => {
  const taskRepo = createTaskRepository(db);

  return taskRepo.withTransaction(async (tx: DrizzleDb) => {
    // Create tx-scoped repositories so all reads and writes participate
    // in the same transaction, closing the race-condition window.
    const txAsDb = tx as unknown as Parameters<typeof createStoryRepository>[0];
    const txStoryRepo = createStoryRepository(txAsDb);
    const txTaskRepo = createTaskRepository(txAsDb);

    // Step 1: Re-read the story inside the transaction (race condition check)
    const currentStoryRaw = await txStoryRepo.findById(tenantId, storyId);

    if (!currentStoryRaw) {
      return null; // Story was deleted
    }

    const currentStory = currentStoryRaw as unknown as StorySnapshot;

    if (currentStory.workStatus !== 'in_progress') {
      return null; // Worker completed/failed it — skip
    }

    // Step 2: Determine new status via DAG analysis
    const hasIncompleteUpstream = await txStoryRepo.hasIncompleteUpstreamDependencies(
      tenantId,
      storyId,
    );
    const targetDbStatus = hasIncompleteUpstream ? 'blocked' : 'not_started';

    // Step 3: Capture task status snapshot BEFORE resetting tasks
    const taskSnapshot = await txTaskRepo.getTaskStatusSnapshot(tenantId, storyId, tx);

    // Step 4: Reset in-progress tasks (preserve completed tasks)
    await txTaskRepo.resetInProgressTasksByStory(tenantId, storyId, tx);

    // Step 5: Clear worker assignment and reset story status
    const now = new Date();

    const updateResult = await tx
      .update(userStoriesTable)
      .set({
        workStatus: targetDbStatus,
        assignedWorkerId: null,
        assignedAt: null,
        lastActivityAt: null,
        version: sql`${userStoriesTable.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(userStoriesTable.id, storyId),
          eq(userStoriesTable.tenantId, tenantId),
          eq(userStoriesTable.version, currentStory.version),
          eq(userStoriesTable.workStatus, 'in_progress'),
        ),
      )
      .returning();

    if (updateResult.length === 0) {
      // Optimistic lock conflict — another process modified the story
      return null;
    }

    // Step 6: Update the attempt history record with timeout details
    const timeoutContext = JSON.stringify({
      reason: 'timeout',
      timed_out_after_minutes: Math.round(minutesSinceActivity),
      timeout_limit_minutes: projectTimeoutMinutes,
      task_statuses_snapshot: taskSnapshot,
    });

    await tx
      .update(attemptHistoryTable)
      .set({
        completedAt: now,
        status: 'timed_out',
        reason: timeoutContext,
        durationMs: sql`EXTRACT(EPOCH FROM (${now}::timestamptz - ${attemptHistoryTable.startedAt})) * 1000`,
      })
      .where(
        and(
          eq(attemptHistoryTable.userStoryId, storyId),
          eq(attemptHistoryTable.tenantId, tenantId),
          eq(attemptHistoryTable.attemptNumber, attempts),
          eq(attemptHistoryTable.status, 'in_progress'),
        ),
      );

    // Step 7: Re-derive parent epic status
    const txEpicRepo = createEpicRepository(txAsDb);
    await txEpicRepo.computeDerivedStatus(tenantId, currentStory.epicId);

    // Step 8: Re-derive parent project status
    const txProjectRepo = createProjectRepository(txAsDb);
    const projectId = await txTaskRepo.getProjectIdForStory(tenantId, storyId);
    if (projectId) {
      const allEpics = await txEpicRepo.findAllByProject(tenantId, projectId);
      const allDone = allEpics.every((e) => e.workStatus === 'done');
      const anyActive = allEpics.some(
        (e) => e.workStatus === 'in_progress' || e.workStatus === 'done',
      );

      if (allDone) {
        await txProjectRepo.updateWorkStatus(tenantId, projectId, 'done');
      } else if (anyActive) {
        await txProjectRepo.updateWorkStatus(tenantId, projectId, 'in_progress');
      }
    }

    return {
      storyId,
      storyName: storyTitle,
      workerId: assignedWorkerId,
      newStatus: targetDbStatus,
      timedOutAfterMinutes: Math.round(minutesSinceActivity),
    } satisfies ReclaimedStorySummary;
  });
};
