/**
 * Core orchestration logic for the timeout-checker Lambda function.
 *
 * Checks all in-progress stories across all projects for timeout and
 * reclaims stale ones. A story has timed out if:
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

import { writeTimeoutAuditEvent } from './audit';
import { findInProgressStoriesWithTimeout, reclaimTimedOutStory } from './db';

import type { Database, PoolDatabase } from '@laila/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal logger interface for structured logging.
 * Callers can pass a pino logger or any object conforming to this shape.
 * Falls back to a console-based implementation when no logger is provided.
 */
export interface TimeoutCheckerLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

/** Console-based fallback logger matching the TimeoutCheckerLogger interface. */
const consoleLogger: TimeoutCheckerLogger = {
  info: (obj, msg) => {
    console.log(msg ?? '', obj);
  },
  warn: (obj, msg) => {
    console.warn(msg ?? '', obj);
  },
  error: (obj, msg) => {
    console.error(msg ?? '', obj);
  },
};

/** Summary of a single reclaimed story. */
export interface ReclaimedStorySummary {
  storyId: string;
  storyName: string;
  workerId: string;
  newStatus: string;
  timedOutAfterMinutes: number;
}

/** Result returned by the timeout checker. */
export interface TimeoutCheckResult {
  /** Total number of in-progress stories checked. */
  checked: number;
  /** Details of each story that was reclaimed. */
  reclaimed: ReclaimedStorySummary[];
  /** Number of stories that failed to reclaim (errors logged). */
  errors: number;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Check all in-progress stories across all projects for timeout and
 * reclaim any that have exceeded their project's inactivity threshold.
 *
 * Processes stories sequentially within individual transactions. Each
 * reclamation is independent — a failure in one does not affect others.
 *
 * @param db - A Drizzle database client (pool mode required for transactions)
 * @param logger - Optional structured logger (defaults to console)
 * @returns Summary of checked, reclaimed, and errored stories
 */
export const checkAndReclaimTimedOutStories = async (
  db: Database | PoolDatabase,
  logger: TimeoutCheckerLogger = consoleLogger,
): Promise<TimeoutCheckResult> => {
  // Step 1: Find all in-progress stories with their project timeout settings
  const inProgressStories = await findInProgressStoriesWithTimeout(db);

  const now = new Date();
  const reclaimed: ReclaimedStorySummary[] = [];
  let errors = 0;

  // Step 2: Check each story for timeout
  for (const story of inProgressStories) {
    // Use lastActivityAt as the inactivity indicator. Falls back to
    // assignedAt if lastActivityAt is not yet populated.
    const lastActivity = story.lastActivityAt ?? story.assignedAt;
    const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / 1000 / 60;

    if (minutesSinceActivity <= story.projectTimeoutMinutes) {
      continue; // Not timed out yet
    }

    // This story has timed out — attempt reclamation
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
        // Audit event is written AFTER the transaction commits
        await writeTimeoutAuditEvent(
          story.id,
          story.tenantId,
          story.assignedWorkerId,
          result,
          story.projectTimeoutMinutes,
          story.attempts,
        );
        reclaimed.push(result);
      }
      // result is null if story was no longer in-progress (race condition)
    } catch (error: unknown) {
      // Log but do not throw — continue checking other stories
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ storyId: story.id, error: message }, 'Failed to reclaim timed-out story');
      errors += 1;
    }
  }

  return { checked: inProgressStories.length, reclaimed, errors };
};
