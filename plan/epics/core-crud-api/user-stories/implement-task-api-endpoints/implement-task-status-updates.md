# Implement Task Status Updates

## Task Details

- **Title:** Implement Task Status Updates
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Task API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Task CRUD Routes

## Description

Implement the start and complete status update endpoints for tasks. These endpoints transition a task through its lifecycle (not-started to in-progress, in-progress to complete) and trigger cascading status re-evaluation for downstream tasks, the parent story, parent epic, and parent project.

### Status Update Endpoints

```typescript
// pages/api/v1/tasks/[id]/start.ts
// Transitions a task from not-started to in-progress.
// Only callable by the worker assigned to the parent story.

/**
 * POST /api/v1/tasks/:id/start
 *
 * Auth: Worker API key (must be assigned to the parent story)
 *
 * Pre-conditions:
 *   - Task must be in not-started status
 *   - Parent story must be in in-progress status
 *   - Requesting worker must be the one assigned to the parent story
 *   - All upstream dependency tasks must be complete
 *
 * Post-conditions:
 *   - Task status changes to in-progress
 *   - Task started_at timestamp is set
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if task is not in not-started
 *   - 403 WORKER_NOT_ASSIGNED if worker is not assigned to parent story
 *   - 409 INVALID_DEPENDENCY if upstream dependencies are not complete
 */
```

```typescript
// pages/api/v1/tasks/[id]/complete.ts
// Transitions a task from in-progress to complete.
// Triggers cascading status re-evaluation.

/**
 * POST /api/v1/tasks/:id/complete
 *
 * Auth: Worker API key (must be assigned to the parent story)
 *
 * Pre-conditions:
 *   - Task must be in in-progress status
 *   - Requesting worker must be assigned to the parent story
 *
 * Post-conditions:
 *   - Task status changes to complete
 *   - Task completed_at timestamp is set
 *   - Cascading re-evaluation is triggered:
 *     1. Downstream tasks that depend on this task are re-evaluated
 *        (may transition from blocked to not-started)
 *     2. If all tasks in the parent story are complete,
 *        the story may auto-complete (handled by Epic 7)
 *     3. Parent epic and project work statuses are re-derived
 *
 * Errors:
 *   - 409 INVALID_STATUS_TRANSITION if task is not in-progress
 *   - 403 WORKER_NOT_ASSIGNED if worker is not assigned to parent story
 */
```

### Cascading Re-evaluation

```typescript
// apps/web/src/lib/api/cascading-reevaluation.ts
// Triggers cascading status re-evaluation after a task status change.
// Uses the domain logic engine's cascading functions.

import { cascadeTaskCompletion, deriveStoryStatus, deriveEpicStatus } from '@laila/domain';
import { taskRepository, storyRepository, dependencyEdgeRepository } from '@laila/database';

/**
 * After a task completes, re-evaluate downstream statuses:
 *
 * 1. Find all tasks that depend on the completed task
 * 2. For each dependent task, check if all its dependencies are now complete
 * 3. If so, transition the dependent task from "blocked" to "not-started"
 * 4. Re-derive the parent story's work status
 * 5. Re-derive the parent epic's work status
 * 6. Re-derive the parent project's work status
 *
 * This is a synchronous cascade for v1. In future versions,
 * consider using SQS for async processing of large cascades.
 *
 * @param completedTaskId - The task that just completed
 * @param tx - Database transaction handle for atomicity
 */
export async function triggerCascadingReevaluation(
  completedTaskId: string,
  tx: DatabaseTransaction,
): Promise<void> {
  // Step 1: Find dependent tasks
  const dependentTaskIds = await dependencyEdgeRepository.findDependents(completedTaskId, tx);

  // Step 2-3: Check and unblock dependent tasks
  for (const dependentId of dependentTaskIds) {
    const allDeps = await dependencyEdgeRepository.findDependencies(dependentId, tx);
    const depTasks = await taskRepository.findByIds(
      allDeps.map((e) => e.to),
      tx,
    );
    const allComplete = depTasks.every((t) => t.status === 'complete');

    if (allComplete) {
      await taskRepository.updateStatus(dependentId, 'not_started', tx);
    }
  }

  // Step 4-6: Re-derive parent statuses (story, epic, project)
  // ... query parent entities and update derived statuses
}
```

## Acceptance Criteria

- [ ] `POST /api/v1/tasks/:id/start` transitions not-started task to in-progress
- [ ] Start validates that the requesting worker is assigned to the parent story
- [ ] Start validates that all upstream dependency tasks are complete
- [ ] Start returns 409 if upstream dependencies are not complete (with list of blocking tasks)
- [ ] Start sets the `started_at` timestamp on the task
- [ ] `POST /api/v1/tasks/:id/complete` transitions in-progress task to complete
- [ ] Complete validates that the requesting worker is assigned to the parent story
- [ ] Complete sets the `completed_at` timestamp on the task
- [ ] Complete triggers cascading re-evaluation of downstream tasks
- [ ] Downstream blocked tasks transition to not-started when all their dependencies are complete
- [ ] Parent story, epic, and project work statuses are re-derived after task completion
- [ ] Cascading re-evaluation runs within the same transaction as the task status update
- [ ] Both endpoints require worker authentication via API key
- [ ] Both endpoints return 403 with `WORKER_NOT_ASSIGNED` if the worker is not the assignee
- [ ] No `any` types are used in the implementation

## Technical Notes

- The cascading re-evaluation is synchronous in v1. For large projects with deep dependency chains, this could become a performance concern. The architecture should be designed to allow migration to SQS-based async processing in v2 without changing the API contract.
- The "all dependencies complete" check for unblocking must query the current state of ALL dependencies for a task, not just check if the one that just completed was the last one. Use the repository to load all dependency tasks and check their statuses.
- The task start endpoint enforces finish-to-start semantics: a task can only start when all its upstream dependencies are complete. This is the runtime enforcement of the DAG constraint. The compile-time enforcement is the cycle detection.
- Consider adding a `GET /api/v1/tasks/:id/dependencies` convenience endpoint that returns the status of all upstream dependencies for a task, so workers can check what's blocking them.

## References

- **Functional Requirements:** FR-TASK-004 (task start), FR-TASK-005 (task complete), FR-TASK-006 (cascading re-evaluation)
- **Design Specification:** Section 7.4.3 (Task Status Updates), Section 5.2 (Cascading Status Re-evaluation)
- **Domain Logic:** `cascadeTaskCompletion()`, `deriveStoryStatus()`, `deriveEpicStatus()` from `@laila/domain`

## Estimated Complexity

High — The cascading re-evaluation is the most complex part of the task API. It requires multi-level status propagation within a transaction, correct handling of the DAG at runtime, and coordination with the parent story/epic/project status derivation.
