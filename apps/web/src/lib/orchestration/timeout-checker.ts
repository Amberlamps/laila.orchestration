/**
 * @module timeout-checker
 *
 * Checks all in-progress stories across all projects for timeout and
 * reclaims stale ones. Designed to be called by a scheduled function
 * (cron, Lambda, EventBridge, etc.).
 *
 * A story has timed out if:
 *   now - story.lastActivityAt > project.workerInactivityTimeoutMinutes
 *
 * For each timed-out story, within a transaction:
 * 1. Re-read the story to verify it is still in-progress (race condition check)
 * 2. Determine the new status via DAG analysis (not_started or blocked)
 * 3. Clear worker assignment and reset status
 * 4. Reset in-progress tasks to not_started (preserve completed tasks)
 * 5. Create/update the attempt history record with reason "timeout"
 * 6. Log an audit event
 *
 * Errors during individual story reclamation are logged but do not stop
 * processing of other stories.
 */

import {
  createStoryRepository,
  createTaskRepository,
  createEpicRepository,
  createProjectRepository,
  userStoriesTable,
  attemptHistoryTable,
  writeAuditEvent,
  type DrizzleDb,
  type Database,
  type PoolDatabase,
} from '@laila/database';
import { eq, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary of a single reclaimed story */
export interface ReclaimedStorySummary {
  storyId: string;
  storyName: string;
  workerId: string;
  newStatus: string;
  timedOutAfterMinutes: number;
}

/** Result returned by the timeout checker */
export interface TimeoutCheckResult {
  /** Total number of in-progress stories checked */
  checked: number;
  /** Details of each story that was reclaimed */
  reclaimed: ReclaimedStorySummary[];
  /** Number of stories that failed to reclaim (errors logged) */
  errors: number;
}

// ---------------------------------------------------------------------------
// Timeout checker
// ---------------------------------------------------------------------------

/**
 * Checks all in-progress stories across all projects for timeout and
 * reclaims any that have exceeded their project's inactivity threshold.
 *
 * The function is designed to be called periodically by an external
 * scheduler. It processes stories sequentially within individual
 * transactions. Each reclamation is independent -- a failure in one
 * does not affect others.
 *
 * @param db - A Drizzle database client (pool mode required for transactions)
 * @returns Summary of checked, reclaimed, and errored stories
 */
export const checkAndReclaimTimedOutStories = async (
  db: Database | PoolDatabase,
): Promise<TimeoutCheckResult> => {
  const storyRepo = createStoryRepository(db);

  // Step 1: Find all in-progress stories with their project timeout settings
  const inProgressStories = await storyRepo.findInProgressWithTimeout();

  const now = new Date();
  const reclaimed: ReclaimedStorySummary[] = [];
  let errors = 0;

  // Step 2: Check each story for timeout
  for (const story of inProgressStories) {
    // Use lastActivityAt as the inactivity indicator. It is updated on:
    // - Story assignment (set to assignment time)
    // - Task start or completion (set to the event time)
    // Falls back to assignedAt if lastActivityAt is not yet populated.
    const lastActivity = story.lastActivityAt ?? story.assignedAt;
    const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / 1000 / 60;

    if (minutesSinceActivity <= story.projectTimeoutMinutes) {
      continue; // Not timed out yet
    }

    // This story has timed out -- attempt reclamation
    try {
      const result = await reclaimTimedOutStory(
        db,
        story.id,
        story.tenantId,
        story.title,
        story.assignedWorkerId,
        story.attempts,
        minutesSinceActivity,
        story.projectTimeoutMinutes,
      );

      if (result) {
        reclaimed.push(result);
      }
      // result is null if story was no longer in-progress (race condition)
    } catch (error: unknown) {
      // Log but do not throw -- continue checking other stories
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Timeout] Failed to reclaim story ${story.id}: ${message}`);
      errors += 1;
    }
  }

  return { checked: inProgressStories.length, reclaimed, errors };
};

// ---------------------------------------------------------------------------
// Individual story reclamation (transactional)
// ---------------------------------------------------------------------------

/**
 * Reclaims a single timed-out story within a transaction.
 *
 * The transaction ensures atomicity of the reclamation:
 * - Re-reads the story to check for race conditions
 * - Clears worker assignment and resets status
 * - Resets in-progress tasks
 * - Updates attempt history
 *
 * @returns The reclaimed story summary, or null if the story was
 *          no longer in-progress (race condition -- skip safely)
 */
const reclaimTimedOutStory = async (
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

  const result = await taskRepo.withTransaction(async (tx: DrizzleDb) => {
    // Create tx-scoped repositories so all reads and writes participate
    // in the same transaction, closing the race-condition window.
    const txAsDb = tx as unknown as Parameters<typeof createStoryRepository>[0];
    const txStoryRepo = createStoryRepository(txAsDb);
    const txTaskRepo = createTaskRepository(txAsDb);

    // Step 1: Re-read the story inside the transaction (race condition check)
    // If the worker completed or failed the story between our check and now,
    // the story will no longer be in_progress. Do NOT reclaim in that case.
    const currentStoryRaw = await txStoryRepo.findById(tenantId, storyId);

    if (!currentStoryRaw) {
      return null; // Story was deleted
    }

    const currentStory = currentStoryRaw as unknown as StorySnapshot;

    if (currentStory.workStatus !== 'in_progress') {
      return null; // Worker completed/failed it -- skip
    }

    // Step 2: Determine new status via DAG analysis
    const hasIncompleteUpstream = await txStoryRepo.hasIncompleteUpstreamDependencies(
      tenantId,
      storyId,
    );
    const targetDbStatus = hasIncompleteUpstream ? 'blocked' : 'ready';

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
      // Optimistic lock conflict -- another process modified the story
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

  // Log audit event AFTER the transaction commits (same pattern as complete/fail)
  if (result) {
    await writeAuditEvent({
      entityType: 'user_story',
      entityId: storyId,
      action: 'timed_out',
      actorType: 'system',
      actorId: 'timeout-checker',
      tenantId,
      changes: {
        before: { workStatus: 'in_progress', assignedWorkerId },
        after: { workStatus: result.newStatus, assignedWorkerId: null },
      },
      metadata: {
        timed_out_after_minutes: result.timedOutAfterMinutes,
        timeout_limit_minutes: projectTimeoutMinutes,
        previous_worker_id: assignedWorkerId,
        attempt_number: attempts,
      },
    });
  }

  return result;
};
