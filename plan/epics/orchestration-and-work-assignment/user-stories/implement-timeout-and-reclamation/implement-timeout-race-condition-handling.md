# Implement Timeout Race Condition Handling

## Task Details

- **Title:** Implement Timeout Race Condition Handling
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Timeout & Reclamation](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Timeout Checking Logic

## Description

Handle the most dangerous race condition in the orchestration system: what happens when a worker submits a completion (task or story) at the exact moment the timeout checker fires and attempts to reclaim the story. The system must guarantee that a valid worker completion is never overwritten by a timeout reclamation.

**SAFETY-CRITICAL:** This is the highest-risk race condition in the system. An incorrect implementation can lead to lost work (completion overwritten by reclamation) or phantom assignments (reclamation happens but completion also succeeds).

### Race Condition Scenarios

```
Scenario 1: Worker completes BEFORE timeout checks
Timeline: Worker completes -> Timeout checks -> Story already completed -> Skip
Result: CORRECT. Worker completion is preserved.

Scenario 2: Timeout reclaims BEFORE worker completes
Timeline: Timeout reclaims -> Worker tries to complete -> Story no longer assigned -> Error
Result: CORRECT. Worker receives "no longer assigned" error.

Scenario 3: Worker and timeout overlap (THE DANGEROUS CASE)
Timeline: Both read story as "in_progress" simultaneously
         Worker attempts UPDATE with version check
         Timeout attempts UPDATE with version check
         Only one can succeed (version check prevents both)
Result: CORRECT if implemented with optimistic locking.
```

### Defense Mechanisms

```typescript
// apps/web/src/lib/orchestration/race-condition-guards.ts
// Guards against the timeout/completion race condition.
// Uses multiple layers of defense for safety-critical correctness.

/**
 * Defense Layer 1: Status Check
 * Both the completion endpoint and timeout checker re-read the story
 * within a transaction before modifying it. If the story is no longer
 * in the expected state, the operation is aborted.
 */

/**
 * Defense Layer 2: Optimistic Locking (Version Check)
 * Both the completion UPDATE and timeout UPDATE include
 * WHERE version = <expected>. If the version has changed
 * (because the other operation succeeded first), the UPDATE
 * affects 0 rows and the operation fails gracefully.
 */

/**
 * Defense Layer 3: Worker Assignment Check
 * The completion endpoint verifies that the requesting worker
 * is still the assigned worker. If the timeout already cleared
 * the assignment, the completion attempt fails with
 * WORKER_NOT_ASSIGNED error.
 */

/**
 * Guard for worker completion attempts after potential reclamation.
 * This is called in the task complete and story complete endpoints.
 *
 * @param storyId - The story the worker is trying to complete
 * @param workerId - The worker attempting the completion
 * @param tx - Database transaction
 * @throws AuthorizationError if the worker is no longer assigned
 */
export async function guardWorkerStillAssigned(
  storyId: string,
  workerId: string,
  tx: DatabaseTransaction
): Promise<StoryRecord> {
  const story = await storyRepository.findById(storyId, tx);

  // Check 1: Story must still be in-progress
  if (story.status !== "in_progress") {
    throw new ConflictError(
      DomainErrorCode.INVALID_STATUS_TRANSITION,
      `Story is no longer in-progress (current status: ${story.status}). ` +
        "The story may have been reclaimed due to timeout.",
      { storyId, currentStatus: story.status }
    );
  }

  // Check 2: Worker must still be the assignee
  if (story.assigned_worker_id !== workerId) {
    throw new AuthorizationError(
      DomainErrorCode.WORKER_NOT_ASSIGNED,
      "You are no longer assigned to this story. " +
        "The story may have been reclaimed due to timeout or manual unassignment.",
      { storyId, currentAssignee: story.assigned_worker_id }
    );
  }

  return story;
}
```

### Worker-Side Error Handling

```typescript
// The worker client should handle these specific error codes:
//
// WORKER_NOT_ASSIGNED (403):
//   The worker was unassigned (timeout or manual). The worker should:
//   1. Stop working on the current story
//   2. Request a new assignment via POST /api/v1/orchestration/assign
//
// OPTIMISTIC_LOCK_CONFLICT (409):
//   Another operation modified the story concurrently. The worker should:
//   1. Retry the completion request (the version may have changed
//      due to a non-conflicting update)
//
// INVALID_STATUS_TRANSITION (409):
//   The story is no longer in a state where the operation is valid. The worker should:
//   1. Stop working on the current story
//   2. Request a new assignment
```

## Acceptance Criteria

- [ ] The `guardWorkerStillAssigned` function checks both story status and worker assignment
- [ ] If the story is no longer in-progress, a descriptive error is returned
- [ ] If the worker is no longer the assignee, a `WORKER_NOT_ASSIGNED` error is returned
- [ ] The guard is called within a transaction to ensure a consistent read
- [ ] Timeout reclamation re-reads the story within a transaction before modifying
- [ ] Timeout reclamation skips stories that are no longer in-progress
- [ ] Optimistic locking (version check) prevents both timeout and completion from succeeding simultaneously
- [ ] The losing operation (whichever comes second) fails gracefully with a descriptive error
- [ ] Worker completion after timeout reclamation returns "no longer assigned" error
- [ ] Timeout reclamation after worker completion skips the story (already handled)
- [ ] Error messages are clear enough for workers to understand the situation and take corrective action
- [ ] The error response includes the current story status for debugging
- [ ] No `any` types are used in the implementation
- [ ] All three defense layers are implemented and documented

## Technical Notes

- **Three layers of defense:** The implementation uses three independent mechanisms that all prevent the same race condition. Any single mechanism is sufficient, but all three are implemented for defense-in-depth. This is appropriate for safety-critical code.
  1. **Status check:** Re-read within transaction; abort if status changed
  2. **Version check:** Optimistic locking; UPDATE fails if version changed
  3. **Assignment check:** Verify worker is still assigned; abort if not
- **PostgreSQL transaction isolation:** READ COMMITTED isolation is sufficient because the version check in the WHERE clause provides the necessary serialization. SERIALIZABLE would be overkill and could cause unnecessary rollbacks.
- **Worker client guidance:** The error codes and messages are designed to give workers clear instructions on what to do when they encounter a race condition. The error payload includes the current story status so the worker can log it for debugging.
- **Idempotency consideration:** If the worker retries a task completion that already succeeded (due to a network timeout on the response), the endpoint should detect that the task is already complete and return success (idempotent). This is different from the race condition — it is a simple duplicate detection.

## References

- **Functional Requirements:** FR-ORCH-020 (race condition handling), FR-ORCH-021 (defense-in-depth)
- **Design Specification:** Section 9.9 (Race Condition Handling), Section 9.9.1 (Defense Layers)
- **Domain Logic:** Optimistic locking pattern from `@laila/domain`
- **Database:** PostgreSQL transaction isolation levels

## Estimated Complexity

Very High — This is the most safety-critical code in the entire system. The race condition analysis, three-layer defense implementation, and the need to handle every possible interleaving of operations correctly make this extremely complex. Formal reasoning about the correctness invariants is recommended.
