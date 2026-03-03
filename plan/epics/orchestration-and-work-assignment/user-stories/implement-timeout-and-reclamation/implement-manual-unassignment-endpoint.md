# Implement Manual Unassignment Endpoint

## Task Details

- **Title:** Implement Manual Unassignment Endpoint
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Timeout & Reclamation](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement the manual unassignment endpoint that allows human operators to remove a worker from a story. This is used when an operator determines that a worker is not making progress, is producing incorrect results, or needs to be replaced. The endpoint requires explicit confirmation to prevent accidental unassignment.

### Route Definition

```typescript
// pages/api/v1/stories/[id]/unassign.ts
// Manual unassignment endpoint. Human auth only.
// Requires explicit confirmation to prevent accidents.

/**
 * POST /api/v1/stories/:id/unassign
 *
 * Auth: Human session auth ONLY (worker auth rejected)
 *
 * Body: {
 *   confirmation: true (required — explicit confirmation),
 *   reason?: string (optional — reason for unassignment)
 * }
 *
 * Pre-conditions:
 *   - Story must be in in-progress status (has an assigned worker)
 *   - Only human auth is accepted
 *   - confirmation must be explicitly set to true
 *
 * Post-conditions:
 *   - Worker assignment is cleared
 *   - Story status changes to "not_started" or "blocked" (DAG-determined)
 *   - All in-progress tasks within the story are reset to "not_started"
 *   - Completed tasks are preserved
 *   - An attempt history record is created with reason "manual_unassignment"
 *   - Version field is incremented
 *   - Parent epic and project work statuses are re-derived
 *   - Audit event is logged with operator info and optional reason
 *
 * Response: 200
 * {
 *   data: {
 *     story: {
 *       id, name, status: "not_started" | "blocked",
 *       previous_worker_id: string,
 *       previous_attempts: number,
 *     },
 *     task_resets: {
 *       reset_count: number,
 *       preserved_count: number,
 *     }
 *   }
 * }
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if story is not in-progress
 *   - 400 VALIDATION_FAILED if confirmation is not true
 *   - 403 INSUFFICIENT_PERMISSIONS if worker auth is used
 */
```

### Request Schema

```typescript
// packages/shared/src/schemas/orchestration.ts

export const unassignRequestSchema = z.object({
  confirmation: z.literal(true, {
    errorMap: () => ({
      message: 'Confirmation must be explicitly set to true to unassign a worker',
    }),
  }),
  reason: z.string().max(2000).optional(),
});
```

### Unassignment Logic

```typescript
// apps/web/src/lib/orchestration/manual-unassignment.ts
// Handles the manual unassignment process.

/**
 * Unassign a worker from a story and reset the story for re-assignment.
 *
 * This function is similar to timeout reclamation but with key differences:
 * - It is triggered by a human operator, not an automated check
 * - It requires explicit confirmation
 * - It captures an optional reason from the operator
 * - It uses the same attempt history and task reset logic as timeout
 *
 * @param storyId - The story to unassign
 * @param operatorUserId - The ID of the human operator performing the action
 * @param reason - Optional reason for the unassignment
 */
export async function processManualUnassignment(
  storyId: string,
  operatorUserId: string,
  reason?: string,
): Promise<UnassignmentResult> {
  return await db.transaction(async (tx) => {
    const story = await storyRepository.findById(storyId, tx);

    if (story.status !== 'in_progress') {
      throw new ConflictError(
        DomainErrorCode.INVALID_STATUS_TRANSITION,
        'Can only unassign workers from in-progress stories',
      );
    }

    const previousWorkerId = story.assigned_worker_id;

    // Determine new status from DAG
    const newStatus = await determineStoryStatus(storyId, tx);

    // Clear assignment and reset status
    await storyRepository.update(
      storyId,
      {
        assigned_worker_id: null,
        status: newStatus,
        started_at: null,
        last_activity_at: null,
        version: story.version + 1,
      },
      tx,
    );

    // Reset in-progress tasks, preserve completed tasks
    const taskResets = await taskRepository.resetInProgressTasks(storyId, tx);

    // Create attempt history record
    await attemptHistoryRepository.create(
      {
        story_id: storyId,
        worker_id: previousWorkerId,
        started_at: story.started_at,
        ended_at: new Date(),
        reason: 'manual_unassignment',
        error_message: reason ?? 'Manually unassigned by operator',
        task_statuses: await captureTaskStatusSnapshot(storyId, tx),
      },
      tx,
    );

    // Re-derive parent statuses
    await rederiveParentStatuses(storyId, tx);

    // Log audit event
    await auditLogger.log({
      action: 'story.unassigned',
      entity_type: 'story',
      entity_id: storyId,
      actor_id: operatorUserId,
      actor_type: 'user',
      details: {
        previous_worker_id: previousWorkerId,
        new_status: newStatus,
        reason: reason ?? 'No reason provided',
      },
    });

    return {
      story: {
        id: storyId,
        name: story.name,
        status: newStatus,
        previous_worker_id: previousWorkerId,
      },
      taskResets,
    };
  });
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/stories/:id/unassign` unassigns a worker from an in-progress story
- [ ] The endpoint requires `confirmation: true` in the request body
- [ ] The endpoint returns 400 if confirmation is not provided or is false
- [ ] The endpoint is human-auth only (worker auth returns 403)
- [ ] The story status is determined by DAG analysis: "not_started" or "blocked"
- [ ] The worker assignment is cleared
- [ ] All in-progress tasks within the story are reset to "not_started"
- [ ] Completed tasks are preserved (not reset)
- [ ] An attempt history record is created with reason "manual_unassignment"
- [ ] The optional `reason` field is captured in the attempt history
- [ ] The response includes the previous worker ID for reference
- [ ] The response includes the count of reset and preserved tasks
- [ ] Parent epic and project work statuses are re-derived
- [ ] An audit event is logged with operator info
- [ ] The version field is incremented
- [ ] No `any` types are used in the implementation

## Technical Notes

- The `z.literal(true)` validation for the confirmation field ensures that the client must explicitly send `{ confirmation: true }`. This is a deliberate friction pattern — it prevents accidental unassignment from clients that might send default or empty payloads.
- The manual unassignment shares most of its logic with the timeout reclamation. Consider extracting a shared `reclaimStory(storyId, reason, tx)` function that both the timeout checker and the unassignment endpoint call.
- The optional `reason` field allows the operator to document why they unassigned the worker. This is captured in both the attempt history and the audit log, providing a full trail for post-mortem analysis.
- Unlike failure (which preserves the assignment for debugging), unassignment clears the assignment immediately because the operator has already reviewed the situation and decided to remove the worker.

## References

- **Functional Requirements:** FR-ORCH-018 (manual unassignment), FR-ORCH-019 (confirmation requirement)
- **Design Specification:** Section 9.8 (Manual Unassignment)
- **Domain Logic:** `determineStoryStatus()` from `@laila/domain`
- **Database Schema:** stories table, attempt_history table, audit_events table

## Estimated Complexity

Medium — The logic is similar to timeout reclamation but simpler because there is no race condition concern (the human explicitly triggers the action). The confirmation pattern and shared reclamation logic reduce implementation effort.
