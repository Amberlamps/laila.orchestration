# Implement Story Failure Endpoint

## Task Details

- **Title:** Implement Story Failure Endpoint
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Completion & Failure Endpoints](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement the story failure endpoint that is called when a worker encounters an unrecoverable error during story execution, or when a human operator decides to mark a story as failed. The endpoint records the failure reason, logs an audit event, and preserves the DAG state (downstream blocked tasks remain blocked).

### Route Definition

```typescript
// pages/api/v1/stories/[id]/fail.ts
// Story failure endpoint. Called by workers or human operators.
// Accepts both worker API key and human session auth.

/**
 * POST /api/v1/stories/:id/fail
 *
 * Auth: Worker API key (assigned to this story) OR human session auth
 *
 * Body: {
 *   error_message: string (required, describes what went wrong),
 *   error_details?: Record<string, unknown> (optional structured error data),
 *   partial_cost_usd?: number (optional, cost incurred before failure),
 *   partial_cost_tokens?: number (optional, tokens consumed before failure)
 * }
 *
 * Pre-conditions:
 *   - Story must be in in-progress status
 *   - If worker auth: worker must be assigned to this story
 *   - If human auth: user must have access to the project
 *
 * Post-conditions:
 *   - Story status changes to "failed"
 *   - Story failed_at timestamp is set
 *   - Error message and details are recorded on the story
 *   - Partial cost data is recorded (if provided)
 *   - Worker assignment is preserved (not cleared — for debugging visibility)
 *   - Downstream tasks that depend on tasks in this story remain "blocked"
 *   - Parent epic and project work statuses are re-derived
 *   - Audit event is logged with failure details
 *   - An attempt history record is created capturing the failed attempt
 *
 * Response: 200
 * {
 *   data: {
 *     story: {
 *       id, name, status: "failed", failed_at,
 *       error_message, assigned_worker_id
 *     }
 *   }
 * }
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if story is not in-progress
 *   - 403 WORKER_NOT_ASSIGNED if worker auth and not assigned to this story
 *   - 400 VALIDATION_FAILED if error_message is missing or empty
 */
```

### Request Schema

```typescript
// packages/shared/src/schemas/orchestration.ts

export const storyFailSchema = z.object({
  error_message: z.string().min(1).max(10000),
  error_details: z.record(z.unknown()).optional(),
  partial_cost_usd: z.number().min(0).multipleOf(0.01).optional(),
  partial_cost_tokens: z.number().int().min(0).optional(),
});
```

### Attempt History Record

```typescript
// The attempt history captures the full context of the failed attempt
// for debugging and analysis. It is never modified after creation.

interface AttemptHistoryRecord {
  id: string;
  story_id: string;
  worker_id: string;
  started_at: Date;
  ended_at: Date;
  reason: "failed" | "timeout" | "manual_unassignment";
  error_message: string | null;
  cost_usd: number | null;
  cost_tokens: number | null;
  task_statuses: Record<string, string>; // snapshot of task statuses at failure time
  created_at: Date;
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/stories/:id/fail` marks a story as failed with a timestamp
- [ ] The endpoint requires an `error_message` in the request body
- [ ] The endpoint accepts both worker API key and human session auth
- [ ] Worker auth validates that the worker is assigned to the story
- [ ] Partial cost data is recorded when provided
- [ ] Worker assignment is NOT cleared on failure (preserved for debugging)
- [ ] Downstream blocked tasks remain blocked (no cascading status changes)
- [ ] Parent epic and project work statuses are re-derived
- [ ] An attempt history record is created with full context (worker, timing, error, costs, task snapshot)
- [ ] The task statuses snapshot captures the state of all tasks at failure time
- [ ] An audit event is logged with failure details
- [ ] No `any` types are used in the implementation

## Technical Notes

- **Worker assignment is preserved on failure** — unlike completion and unassignment where the worker is cleared, failure preserves the assignment for debugging visibility. The human operator can see which worker failed and the error details before deciding to reset the story.
- The attempt history record captures a snapshot of task statuses at the moment of failure. This is invaluable for debugging — it shows which tasks the worker completed before failing, and which were still pending.
- Downstream blocking is maintained because the failed story's tasks are not complete. Tasks in other stories that depend on tasks in the failed story will remain blocked until the story is reset and the tasks are completed.
- The `error_details` field allows structured error data (e.g., stack traces, API error responses, tool outputs) to be recorded alongside the human-readable error message.
- Human auth for failure is important for cases where the human operator wants to manually fail a story (e.g., the worker is producing incorrect results, or the story requirements need to be changed).

## References

- **Functional Requirements:** FR-ORCH-012 (story failure), FR-ORCH-013 (attempt history)
- **Design Specification:** Section 9.5 (Story Failure), Section 9.5.1 (Attempt History)
- **Database Schema:** attempt_history table in `@laila/database`

## Estimated Complexity

Medium — The endpoint itself is straightforward, but the attempt history creation with task status snapshot and the dual-auth (worker OR human) pattern add complexity.
