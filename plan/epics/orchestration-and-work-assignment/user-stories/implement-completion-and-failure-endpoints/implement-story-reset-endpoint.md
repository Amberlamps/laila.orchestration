# Implement Story Reset Endpoint

## Task Details

- **Title:** Implement Story Reset Endpoint
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Completion & Failure Endpoints](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Story Failure Endpoint

## Description

Implement the story reset endpoint that allows human operators to reset a failed story back into the assignment pool. The reset determines whether the story should go to "not_started" or "blocked" based on the current DAG state, clears the worker assignment, resets task statuses, and logs the previous attempt.

### Route Definition

```typescript
// pages/api/v1/stories/[id]/reset.ts
// Story reset endpoint. Human auth only — workers cannot reset stories.
// Resets a failed story back to the assignment pool.

/**
 * POST /api/v1/stories/:id/reset
 *
 * Auth: Human session auth ONLY (worker auth rejected with 403)
 *
 * Body: {
 *   reset_tasks: boolean (default: true — reset all non-complete tasks to not-started/blocked)
 * }
 *
 * Pre-conditions:
 *   - Story must be in "failed" status
 *   - Only human auth is accepted
 *
 * Post-conditions:
 *   - Story status changes to "not_started" or "blocked" (DAG-determined):
 *     - If all upstream task dependencies (from other stories) are complete: "not_started"
 *     - If any upstream task dependency is incomplete: "blocked"
 *   - Worker assignment is cleared
 *   - If reset_tasks is true:
 *     - All in-progress tasks are reset to "not_started"
 *     - All blocked tasks are re-evaluated (may become not_started if deps complete)
 *     - Completed tasks remain completed (work is preserved)
 *   - The previous attempt is logged in attempt history (if not already logged during failure)
 *   - Parent epic and project work statuses are re-derived
 *   - Audit event is logged
 *
 * Response: 200
 * {
 *   data: {
 *     story: {
 *       id, name, status: "not_started" | "blocked",
 *       previous_attempts: number,
 *     },
 *     task_resets: {
 *       reset_count: number,
 *       preserved_count: number (completed tasks not reset),
 *     }
 *   }
 * }
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if story is not in "failed" status
 *   - 403 INSUFFICIENT_PERMISSIONS if worker auth is used
 */
```

### DAG-Based Status Determination

```typescript
// apps/web/src/lib/orchestration/story-status-determination.ts
// Determines the correct status for a story based on the DAG.

import { dependencyEdgeRepository, taskRepository } from '@laila/database';

/**
 * Determine whether a story should be "not_started" or "blocked"
 * based on the current state of its upstream dependencies.
 *
 * A story is "blocked" if ANY of its tasks have dependencies
 * (in other stories) that are not yet complete.
 *
 * A story is "not_started" if ALL cross-story dependencies are complete,
 * meaning the story's internal task ordering is the only constraint.
 *
 * @param storyId - The story to evaluate
 * @param tx - Database transaction
 * @returns The determined status: "not_started" or "blocked"
 */
export async function determineStoryStatus(
  storyId: string,
  tx: DatabaseTransaction,
): Promise<'not_started' | 'blocked'> {
  // Get all tasks in this story
  const storyTasks = await taskRepository.findByStoryId(storyId, tx);
  const storyTaskIds = new Set(storyTasks.map((t) => t.id));

  // Get all dependency edges for tasks in this story
  const edges = await dependencyEdgeRepository.findByTaskIds([...storyTaskIds], tx);

  // Find cross-story dependencies (deps that point to tasks NOT in this story)
  const crossStoryDepIds = edges
    .filter((e) => storyTaskIds.has(e.from) && !storyTaskIds.has(e.to))
    .map((e) => e.to);

  if (crossStoryDepIds.length === 0) {
    return 'not_started'; // No cross-story deps, story is ready
  }

  // Check if all cross-story dependency tasks are complete
  const depTasks = await taskRepository.findByIds(crossStoryDepIds, tx);
  const allComplete = depTasks.every((t) => t.status === 'complete');

  return allComplete ? 'not_started' : 'blocked';
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/stories/:id/reset` resets a failed story
- [ ] The endpoint is human-auth only (worker auth returns 403 with `INSUFFICIENT_PERMISSIONS`)
- [ ] The story status is determined by DAG analysis: "not_started" or "blocked"
- [ ] If all cross-story dependencies are complete, story becomes "not_started"
- [ ] If any cross-story dependency is incomplete, story becomes "blocked"
- [ ] The worker assignment is cleared
- [ ] In-progress tasks are reset to "not_started" (when `reset_tasks` is true)
- [ ] Completed tasks are preserved (not reset)
- [ ] Blocked tasks are re-evaluated based on the current DAG state
- [ ] The response includes the count of reset tasks and preserved (completed) tasks
- [ ] The response includes the total number of previous attempts
- [ ] Parent epic and project work statuses are re-derived
- [ ] An audit event is logged
- [ ] Version field is incremented (for optimistic locking consistency)
- [ ] No `any` types are used in the implementation

## Technical Notes

- **Preserving completed tasks** is a deliberate design choice. When a story fails partway through, some tasks may have been successfully completed. Resetting those completed tasks would waste the work already done. The next worker assigned to the story will skip the completed tasks and start from where the previous worker left off.
- The `reset_tasks` flag (default: true) gives the operator control. Setting it to false resets only the story status but leaves all task statuses unchanged. This is useful when the operator wants to manually review and adjust tasks before resetting.
- The DAG-based status determination must consider only cross-story dependencies. Intra-story dependencies (between tasks within the same story) are handled at task execution time, not at story assignment time.
- This endpoint works in conjunction with the failure endpoint: fail first, then reset when ready to retry. The attempt history preserves the full context of each attempt.

## References

- **Functional Requirements:** FR-ORCH-014 (story reset), FR-ORCH-015 (DAG-based status determination)
- **Design Specification:** Section 9.6 (Story Reset)
- **Domain Logic:** `determineStoryStatus()` from `@laila/domain`
- **Database Schema:** stories table, attempt_history table in `@laila/database`

## Estimated Complexity

High — The DAG-based status determination, selective task resetting (preserving completed tasks), and coordination with the attempt history system all add significant complexity.
