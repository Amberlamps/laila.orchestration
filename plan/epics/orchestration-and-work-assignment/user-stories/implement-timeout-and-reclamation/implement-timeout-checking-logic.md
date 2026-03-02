# Implement Timeout Checking Logic

## Task Details

- **Title:** Implement Timeout Checking Logic
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Timeout & Reclamation](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** None

## Description

Create a function that checks all in-progress stories across all projects and reclaims any that have exceeded their project's timeout duration. When a story times out, the function clears the worker assignment, resets the story status to not_started or blocked (DAG-determined), resets in-progress tasks, and logs the previous attempt with reason "timeout". This function is designed to be called periodically (by a cron job, Lambda schedule, or similar).

**SAFETY-CRITICAL:** The timeout function must check the story's current status before reclaiming. If the worker completed the story between the timeout check and the reclamation attempt, the completion must not be overwritten.

### Timeout Checking Function

```typescript
// apps/web/src/lib/orchestration/timeout-checker.ts
// Checks all in-progress stories for timeout and reclaims stale ones.
// Designed to be called by a scheduled function (cron, Lambda, etc.).

import { storyRepository, projectRepository, taskRepository } from "@laila/database";
import { determineStoryStatus } from "./story-status-determination";
import { db } from "@laila/database";

/**
 * Check all in-progress stories across all projects for timeout.
 * A story has timed out if:
 *   now - story.last_activity_at > project.timeout_duration_minutes
 *
 * The `last_activity_at` field is updated whenever:
 *   - The story is assigned to a worker
 *   - A task within the story is started or completed
 *   - The worker sends a heartbeat (future enhancement)
 *
 * For each timed-out story:
 * 1. Verify the story is still in-progress (race condition check)
 * 2. Clear the worker assignment
 * 3. Reset story status to not_started or blocked (DAG-determined)
 * 4. Reset in-progress tasks to not_started
 * 5. Preserve completed tasks
 * 6. Create an attempt history record with reason "timeout"
 * 7. Log an audit event
 *
 * @returns Summary of reclaimed stories
 */
export async function checkAndReclaimTimedOutStories(): Promise<{
  checked: number;
  reclaimed: Array<{
    storyId: string;
    storyName: string;
    workerId: string;
    newStatus: string;
    timedOutAfterMinutes: number;
  }>;
}> {
  // Find all in-progress stories with their project's timeout duration
  const inProgressStories = await storyRepository.findInProgressWithTimeout();

  const now = new Date();
  const reclaimed: Array<{
    storyId: string;
    storyName: string;
    workerId: string;
    newStatus: string;
    timedOutAfterMinutes: number;
  }> = [];

  for (const story of inProgressStories) {
    const lastActivity = story.last_activity_at ?? story.started_at;
    const minutesSinceActivity =
      (now.getTime() - lastActivity.getTime()) / 1000 / 60;

    if (minutesSinceActivity > story.project_timeout_minutes) {
      // This story has timed out — reclaim it
      try {
        await db.transaction(async (tx) => {
          // Re-read the story inside the transaction to check for races
          const currentStory = await storyRepository.findById(story.id, tx);

          // RACE CONDITION CHECK: If the story is no longer in-progress,
          // the worker completed (or failed) it between our check and now.
          // Do NOT reclaim — the worker's action takes precedence.
          if (currentStory.status !== "in_progress") {
            return; // Skip — story was already handled
          }

          // Proceed with reclamation
          const newStatus = await determineStoryStatus(story.id, tx);

          // Clear assignment and reset status
          await storyRepository.update(
            story.id,
            {
              assigned_worker_id: null,
              status: newStatus,
              started_at: null,
              last_activity_at: null,
              version: currentStory.version + 1,
            },
            tx
          );

          // Reset in-progress tasks, preserve completed tasks
          await taskRepository.resetInProgressTasks(story.id, tx);

          // Create attempt history record
          await attemptHistoryRepository.create(
            {
              story_id: story.id,
              worker_id: story.assigned_worker_id,
              started_at: story.started_at,
              ended_at: now,
              reason: "timeout",
              error_message: `Story timed out after ${Math.round(minutesSinceActivity)} minutes (limit: ${story.project_timeout_minutes} minutes)`,
              task_statuses: await captureTaskStatusSnapshot(story.id, tx),
            },
            tx
          );

          reclaimed.push({
            storyId: story.id,
            storyName: story.name,
            workerId: story.assigned_worker_id,
            newStatus,
            timedOutAfterMinutes: Math.round(minutesSinceActivity),
          });
        });
      } catch (error) {
        // Log but do not throw — continue checking other stories
        console.error(`[Timeout] Failed to reclaim story ${story.id}:`, error);
      }
    }
  }

  return { checked: inProgressStories.length, reclaimed };
}
```

### Activity Tracking

```typescript
// The last_activity_at field on the stories table tracks the most recent
// worker activity. It is updated on:
// - Story assignment (set to assignment time)
// - Task start (set to start time)
// - Task completion (set to completion time)
// This provides a more accurate timeout signal than just the assignment time.
```

## Acceptance Criteria

- [ ] The function finds all in-progress stories across all projects
- [ ] The function computes timeout based on `last_activity_at` vs `project.timeout_duration_minutes`
- [ ] Timed-out stories have their worker assignment cleared
- [ ] Timed-out stories are reset to "not_started" or "blocked" (DAG-determined)
- [ ] In-progress tasks within timed-out stories are reset to "not_started"
- [ ] Completed tasks are preserved (not reset)
- [ ] An attempt history record is created with reason "timeout"
- [ ] The attempt history includes a task status snapshot
- [ ] The function re-reads the story within a transaction before reclaiming (race condition check)
- [ ] If the story is no longer in-progress at reclamation time, it is skipped (worker completed first)
- [ ] Errors during individual story reclamation do not stop processing of other stories
- [ ] The function returns a summary of checked and reclaimed stories
- [ ] The version field is incremented on reclamation
- [ ] No `any` types are used in the implementation

## Technical Notes

- The timeout function is designed to be called by an external scheduler (AWS EventBridge, cron, Lambda). It is NOT an API endpoint but a standalone function that can be imported and called from a scheduled handler.
- The race condition check (re-reading the story inside the transaction) is the first line of defense against the timeout/completion race. The optimistic locking version check is the second line of defense.
- The `last_activity_at` field provides a better timeout signal than `started_at` because it accounts for active workers that are making progress. A worker that completes 9 out of 10 tasks should not be timed out just because the overall story duration exceeds the timeout.
- Consider adding a `timeout_warning_at` threshold (e.g., 80% of timeout) for future notification features.
- The function processes stories sequentially within individual transactions. For projects with many in-progress stories, consider batching or parallel processing.

## References

- **Functional Requirements:** FR-ORCH-016 (timeout checking), FR-ORCH-017 (timeout reclamation)
- **Design Specification:** Section 9.7 (Timeout & Reclamation), Section 9.7.1 (Timeout Checking)
- **Database Schema:** stories.last_activity_at, project.timeout_duration_minutes
- **Infrastructure:** AWS EventBridge or Lambda schedule for periodic execution

## Estimated Complexity

Very High — The race condition handling, transactional reclamation with version checking, DAG-based status determination, and the need to handle errors gracefully without stopping other reclamations all contribute to very high complexity. This is safety-critical code.
