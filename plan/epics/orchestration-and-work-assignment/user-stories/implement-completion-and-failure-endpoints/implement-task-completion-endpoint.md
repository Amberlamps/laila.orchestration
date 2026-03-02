# Implement Task Completion Endpoint

## Task Details

- **Title:** Implement Task Completion Endpoint
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Completion & Failure Endpoints](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement the task completion endpoint that workers call when they finish executing a task. This endpoint validates that the worker is assigned to the parent story, marks the task as complete, triggers cascading status re-evaluation for downstream tasks, and checks whether all tasks in the story are now complete (auto-complete detection).

**SAFETY-CRITICAL:** The cascading re-evaluation must correctly determine which downstream tasks become unblocked. Incorrect cascading can lead to premature task starts or permanent blocking.

### Route Definition

```typescript
// pages/api/v1/tasks/[id]/complete.ts
// Task completion endpoint. Called by workers after finishing a task.
// Uses worker API key authentication.

/**
 * POST /api/v1/tasks/:id/complete
 *
 * Auth: Worker API key (must be assigned to parent story)
 *
 * Body: {} (no additional data required for task completion)
 *
 * Pre-conditions:
 *   - Task must be in in-progress status
 *   - Requesting worker must be assigned to the parent story
 *   - Parent story must be in in-progress status
 *
 * Post-conditions:
 *   - Task status changes to complete
 *   - Task completed_at timestamp is set
 *   - Downstream tasks that depend on this task are re-evaluated:
 *     - If ALL of a downstream task's dependencies are now complete,
 *       the downstream task transitions from "blocked" to "not-started"
 *   - If ALL tasks in the parent story are now complete:
 *     - The story is flagged as "all_tasks_complete" (but NOT auto-completed;
 *       the worker must explicitly call story complete with cost data)
 *   - Parent epic and project work statuses are re-derived
 *   - Audit event is logged
 *
 * Response: 200
 * {
 *   data: {
 *     task: { id, name, status: "complete", completed_at },
 *     cascading_updates: {
 *       unblocked_tasks: [{ id, name, new_status: "not_started" }],
 *       all_tasks_complete: boolean,
 *     }
 *   }
 * }
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if task is not in-progress
 *   - 403 WORKER_NOT_ASSIGNED if worker is not assigned to parent story
 *   - 404 TASK_NOT_FOUND if task does not exist
 */
```

### Cascading Logic

```typescript
// apps/web/src/lib/orchestration/task-completion.ts
// Handles the cascading logic after a task is marked complete.

import {
  cascadeTaskCompletion,
  deriveStoryStatus,
  deriveEpicStatus,
} from "@laila/domain";
import {
  taskRepository,
  storyRepository,
  epicRepository,
  dependencyEdgeRepository,
} from "@laila/database";

/**
 * Process task completion with cascading side effects.
 *
 * Steps:
 * 1. Mark the task as complete (status, completed_at)
 * 2. Find downstream tasks (tasks that depend on this one)
 * 3. For each downstream task:
 *    a. Load ALL of its dependencies
 *    b. Check if ALL dependencies are now complete
 *    c. If yes, transition from "blocked" to "not_started"
 * 4. Check if all tasks in the parent story are complete
 * 5. Re-derive parent story work status
 * 6. Re-derive parent epic work status
 * 7. Re-derive parent project work status
 *
 * All steps run within the same database transaction.
 *
 * @returns Object with unblocked tasks and all_tasks_complete flag
 */
export async function processTaskCompletion(
  taskId: string,
  tx: DatabaseTransaction
): Promise<{
  unblockedTasks: Array<{ id: string; name: string }>;
  allTasksComplete: boolean;
}> {
  // Step 1: Mark task complete
  const task = await taskRepository.updateStatus(taskId, "complete", tx);
  await taskRepository.setCompletedAt(taskId, new Date(), tx);

  // Step 2: Find downstream dependents
  const dependentEdges = await dependencyEdgeRepository.findDependents(
    taskId,
    tx
  );

  // Step 3: Evaluate each downstream task
  const unblockedTasks: Array<{ id: string; name: string }> = [];
  for (const depTaskId of dependentEdges) {
    const allDeps = await dependencyEdgeRepository.findDependencies(
      depTaskId,
      tx
    );
    const depTasks = await taskRepository.findByIds(
      allDeps.map((e) => e.to),
      tx
    );
    const allComplete = depTasks.every((t) => t.status === "complete");

    if (allComplete) {
      const unblocked = await taskRepository.updateStatus(
        depTaskId,
        "not_started",
        tx
      );
      unblockedTasks.push({ id: unblocked.id, name: unblocked.name });
    }
  }

  // Step 4: Check story completion
  const storyTasks = await taskRepository.findByStoryId(task.story_id, tx);
  const allTasksComplete = storyTasks.every((t) => t.status === "complete");

  // Steps 5-7: Re-derive parent statuses
  await rederiveParentStatuses(task.story_id, tx);

  return { unblockedTasks, allTasksComplete };
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/tasks/:id/complete` marks a task as complete with a timestamp
- [ ] The endpoint validates that the worker is assigned to the parent story
- [ ] The endpoint validates that the task is in in-progress status
- [ ] Downstream tasks with all dependencies now complete transition from "blocked" to "not_started"
- [ ] Downstream tasks with remaining incomplete dependencies stay "blocked"
- [ ] The response includes a list of unblocked tasks (id and name)
- [ ] The response includes an `all_tasks_complete` flag
- [ ] The story is NOT auto-completed (worker must explicitly call story complete)
- [ ] Parent story, epic, and project work statuses are re-derived
- [ ] All cascading operations run within a single transaction
- [ ] An audit event is logged for the task completion
- [ ] Cross-story downstream tasks are also evaluated (dependencies span stories)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The "all tasks complete" flag in the response is a hint to the worker that it should now call the story completion endpoint with cost data. The system does NOT auto-complete the story because the worker needs to provide cost information (`cost_usd`, `cost_tokens`) that only it knows.
- The cascading re-evaluation must handle cross-story dependencies. A task in Story A may depend on a task in Story B. When the Story B task completes, the Story A task should be re-evaluated. This requires loading dependents across story boundaries.
- For v1, the cascading is synchronous within the transaction. For large projects with deep dependency chains, consider migrating to SQS-based async processing. The API contract (response shape) does not need to change.
- The re-derivation of parent statuses (story, epic, project) uses the domain logic functions that compute status from child statuses. This ensures consistency with the rest of the system.

## References

- **Functional Requirements:** FR-ORCH-007 (task completion), FR-ORCH-008 (cascading re-evaluation)
- **Design Specification:** Section 9.3 (Task Completion), Section 9.3.1 (Cascading Logic)
- **Domain Logic:** `cascadeTaskCompletion()`, `deriveStoryStatus()` from `@laila/domain`
- **Database:** Drizzle ORM transaction API

## Estimated Complexity

Very High — The cascading re-evaluation with cross-story dependencies, multi-level status propagation, and transactional atomicity make this one of the most complex endpoints. The safety-critical nature demands exhaustive correctness verification.
