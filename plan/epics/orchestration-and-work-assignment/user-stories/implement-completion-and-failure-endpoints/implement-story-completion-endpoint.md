# Implement Story Completion Endpoint

## Task Details

- **Title:** Implement Story Completion Endpoint
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Completion & Failure Endpoints](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Task Completion Endpoint

## Description

Implement the story completion endpoint that workers call after all tasks in a story are complete. The worker submits cost data (`cost_usd` and `cost_tokens`) which is recorded for tracking. The endpoint updates the story status, records the completion timestamp, and triggers status propagation to the parent epic and project.

### Route Definition

```typescript
// pages/api/v1/stories/[id]/complete.ts
// Story completion endpoint. Called by workers after all tasks are done.
// Records cost data and propagates status to parent entities.

/**
 * POST /api/v1/stories/:id/complete
 *
 * Auth: Worker API key (must be assigned to this story)
 *
 * Body: {
 *   cost_usd: number (non-negative, up to 2 decimal places),
 *   cost_tokens: number (non-negative integer)
 * }
 *
 * Pre-conditions:
 *   - Story must be in in-progress status
 *   - Requesting worker must be assigned to this story
 *   - All tasks in the story must be in "complete" status
 *
 * Post-conditions:
 *   - Story status changes to "completed"
 *   - Story completed_at timestamp is set
 *   - Cost data (cost_usd, cost_tokens) is recorded
 *   - Worker assignment is cleared (worker is now free for new assignments)
 *   - Parent epic work status is re-derived
 *   - Parent project work status is re-derived
 *   - If all stories in the epic are complete, epic work status becomes "completed"
 *   - If all epics in the project are complete, project status becomes "completed"
 *   - Audit event is logged with cost data
 *
 * Response: 200
 * {
 *   data: {
 *     story: {
 *       id, name, status: "completed", completed_at,
 *       cost_usd, cost_tokens,
 *       duration_seconds: number (time from started_at to completed_at)
 *     },
 *     project_status: string (current project status after propagation),
 *     epic_status: string (current epic status after propagation)
 *   }
 * }
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if story is not in-progress
 *   - 403 WORKER_NOT_ASSIGNED if worker is not assigned to this story
 *   - 400 VALIDATION_FAILED if not all tasks are complete
 *   - 400 COST_VALIDATION_FAILED if cost values are negative or malformed
 */
```

### Request Schema

```typescript
// packages/shared/src/schemas/orchestration.ts
// Zod schema for story completion request.

import { z } from 'zod';

export const storyCompleteSchema = z.object({
  cost_usd: z
    .number()
    .min(0, 'Cost must be non-negative')
    .multipleOf(0.01, 'Cost must have at most 2 decimal places'),
  cost_tokens: z
    .number()
    .int('Token count must be an integer')
    .min(0, 'Token count must be non-negative'),
});
```

### Status Propagation

```typescript
// apps/web/src/lib/orchestration/status-propagation.ts
// After story completion, propagate status to parent epic and project.

/**
 * Check if the parent epic is now complete (all stories completed).
 * If so, update epic work status to "completed".
 * Then check if the parent project is now complete (all epics completed).
 * If so, update project status to "completed".
 *
 * This propagation happens synchronously within the completion transaction.
 */
export async function propagateCompletionStatus(
  storyId: string,
  tx: DatabaseTransaction,
): Promise<{ epicStatus: string; projectStatus: string }> {
  const story = await storyRepository.findById(storyId, tx);

  // Check epic completion
  const epicStories = await storyRepository.findByEpicId(story.epic_id, tx);
  const epicComplete = epicStories.every((s) => s.status === 'completed');
  if (epicComplete) {
    await epicRepository.updateWorkStatus(story.epic_id, 'completed', tx);
  }
  const epic = await epicRepository.findById(story.epic_id, tx);

  // Check project completion
  const projectEpics = await epicRepository.findByProjectId(epic.project_id, tx);
  const projectComplete = projectEpics.every((e) => e.work_status === 'completed');
  if (projectComplete) {
    await projectRepository.updateStatus(epic.project_id, 'completed', tx);
  }
  const project = await projectRepository.findById(epic.project_id, tx);

  return {
    epicStatus: epicComplete ? 'completed' : epic.work_status,
    projectStatus: projectComplete ? 'completed' : project.status,
  };
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/stories/:id/complete` marks a story as completed with a timestamp
- [ ] The endpoint validates that the worker is assigned to this story
- [ ] The endpoint validates that all tasks in the story are in "complete" status
- [ ] The endpoint validates that `cost_usd` is non-negative with at most 2 decimal places
- [ ] The endpoint validates that `cost_tokens` is a non-negative integer
- [ ] Cost data is recorded on the story record
- [ ] The worker assignment is cleared (worker is free for new assignments)
- [ ] The response includes a computed `duration_seconds` (completed_at - started_at)
- [ ] Parent epic work status is re-derived (may become "completed")
- [ ] Parent project status is re-derived (may become "completed")
- [ ] The response includes the current epic and project statuses after propagation
- [ ] An audit event is logged with completion details and cost data
- [ ] All operations run within a single transaction
- [ ] No `any` types are used in the implementation

## Technical Notes

- The "all tasks complete" pre-condition is a safety check. Even though the worker is expected to call story complete only after all tasks are done, the endpoint must verify this to prevent premature completion.
- Clearing the worker assignment after completion is important — it frees the worker to request new assignments via the assign endpoint. If the assignment is not cleared, the worker will be "stuck" and the re-assignment behavior in the assign endpoint will return the completed story instead of a new one.
- The `duration_seconds` is computed as `completed_at - started_at` in seconds. This is useful for tracking worker efficiency and estimating future story durations.
- Cost data is stored as-is on the story record. Consider adding a project-level cost aggregation query in the project detail endpoint for budget tracking.
- The version field must be incremented on completion to maintain optimistic locking correctness.

## References

- **Functional Requirements:** FR-ORCH-009 (story completion), FR-ORCH-010 (cost recording), FR-ORCH-011 (status propagation)
- **Design Specification:** Section 9.4 (Story Completion), Section 9.4.1 (Cost Recording)
- **Domain Logic:** `deriveEpicStatus()`, `deriveProjectStatus()` from `@laila/domain`
- **Shared Schemas:** `storyCompleteSchema` from `@laila/shared`

## Estimated Complexity

High — The combination of validation, cost recording, assignment clearing, multi-level status propagation, and audit logging within a single transaction makes this a complex endpoint.
