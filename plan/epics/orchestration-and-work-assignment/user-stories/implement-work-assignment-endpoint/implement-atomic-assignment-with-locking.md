# Implement Atomic Assignment with Locking

## Task Details

- **Title:** Implement Atomic Assignment with Locking
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Endpoint](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Assignment API Route

## Description

Implement the atomic assignment mechanism using optimistic locking (version field) on the story table. When two workers race for the same story, exactly one succeeds and the other receives a retry-safe conflict response. This is the core concurrency-safety mechanism for the orchestration system.

**SAFETY-CRITICAL:** This implementation must guarantee that a story is never assigned to two workers simultaneously. The optimistic locking pattern is the primary defense against double-assignment.

### Optimistic Locking Implementation

```typescript
// apps/web/src/lib/orchestration/atomic-assignment.ts
// Atomic story assignment using optimistic locking.
// The version field on the story table prevents concurrent assignments.

import { eq, and } from "drizzle-orm";
import { stories } from "@laila/database";
import { ConflictError, DomainErrorCode } from "@laila/shared";

/**
 * Atomically assign a story to a worker using optimistic locking.
 *
 * Algorithm:
 * 1. Read the story's current version
 * 2. Verify the story is still in an assignable state (not-started, status check)
 * 3. Attempt UPDATE with WHERE version = currentVersion
 * 4. If the UPDATE affects 0 rows, another worker won the race — return conflict
 * 5. If the UPDATE affects 1 row, assignment succeeded
 *
 * The optimistic lock uses a version integer column on the stories table.
 * Every mutation to the story increments the version. The assignment
 * UPDATE's WHERE clause includes the version, so concurrent writes
 * are serialized — the first writer wins, subsequent writers see
 * that the version has changed and fail gracefully.
 *
 * @param storyId - The story to assign
 * @param workerId - The worker to assign to
 * @param currentVersion - The version read during eligibility evaluation
 * @returns The updated story record
 * @throws ConflictError with OPTIMISTIC_LOCK_CONFLICT if another worker was assigned first
 */
export async function atomicAssignStory(
  storyId: string,
  workerId: string,
  currentVersion: number,
  tx: DatabaseTransaction
): Promise<StoryRecord> {
  const now = new Date();

  // Attempt the assignment with optimistic lock check.
  // The WHERE clause ensures that the story has not been modified
  // since we read it during eligibility evaluation.
  const result = await tx
    .update(stories)
    .set({
      assigned_worker_id: workerId,
      status: "in_progress",
      started_at: now,
      version: currentVersion + 1,
      updated_at: now,
    })
    .where(
      and(
        eq(stories.id, storyId),
        eq(stories.version, currentVersion),
        // Double-check: only assign if still in an assignable state.
        // This prevents assigning a story that was completed or failed
        // between the eligibility check and the assignment.
        eq(stories.status, "not_started")
      )
    )
    .returning();

  if (result.length === 0) {
    // The UPDATE affected 0 rows — either:
    // 1. Another worker assigned the story (version mismatch)
    // 2. The story status changed (e.g., it was completed or failed)
    // In either case, return a retry-safe conflict error.
    throw new ConflictError(
      DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
      "Story was assigned to another worker. Please retry to get a new assignment.",
      { storyId, expectedVersion: currentVersion }
    );
  }

  return result[0];
}
```

### Version Column

```typescript
// In the Drizzle schema for the stories table:
// The version column is incremented on every mutation.
// It serves as the optimistic lock discriminator.

// packages/database/src/schema/stories.ts
export const stories = pgTable("stories", {
  // ... other columns ...
  version: integer("version").notNull().default(0),
  // The version starts at 0 and increments on every UPDATE.
  // The assignment UPDATE includes WHERE version = <expected>
  // to prevent concurrent modifications.
});
```

### Transaction Scope

```typescript
// The assignment must run within a database transaction:
// 1. Read story + check eligibility (within transaction for consistent snapshot)
// 2. Atomic UPDATE with version check
// 3. Set project status to in_progress (if first assignment)
// 4. Log audit event
// All within a single transaction to ensure atomicity.

await db.transaction(async (tx) => {
  // 1. Evaluate eligibility (reads within transaction)
  const eligibleStories = await findEligibleStories(projectId, workerId, tx);

  // 2. Select best story
  const selected = selectBestStory(eligibleStories);

  // 3. Atomic assignment with optimistic lock
  const assigned = await atomicAssignStory(
    selected.id,
    workerId,
    selected.version,
    tx
  );

  // 4. Update project status if needed
  await ensureProjectInProgress(projectId, tx);

  // 5. Build response
  return buildAssignedResponse(assigned, tx);
});
```

## Acceptance Criteria

- [ ] Optimistic locking uses a `version` integer column on the stories table
- [ ] The assignment UPDATE includes `WHERE version = currentVersion` to prevent concurrent writes
- [ ] The assignment UPDATE also checks `status = 'not_started'` as a safety net
- [ ] If the UPDATE affects 0 rows, a `ConflictError` with `OPTIMISTIC_LOCK_CONFLICT` is thrown
- [ ] The conflict error is retry-safe — the worker can immediately call assign again
- [ ] The version field is incremented on every successful mutation (not just assignments)
- [ ] The entire assignment flow runs within a single database transaction
- [ ] The project status is updated to `in_progress` on the first story assignment
- [ ] Two workers racing for the same story: exactly one succeeds, the other gets a conflict
- [ ] The conflict response includes the story ID for debugging
- [ ] No `any` types are used in the implementation
- [ ] The implementation does not use pessimistic locks (SELECT FOR UPDATE) — optimistic locking only

## Technical Notes

- **Why optimistic locking over pessimistic locking:** Optimistic locking with a version column is preferred because (1) it does not hold database locks during the eligibility evaluation, which could be slow, (2) it works correctly across connection pool boundaries in serverless environments (Neon), and (3) it allows multiple readers without blocking. The cost is a retry on conflict, which is acceptable given the low probability of collision.
- **Transaction isolation level:** The default PostgreSQL isolation level (READ COMMITTED) is sufficient for optimistic locking. The version check in the WHERE clause prevents lost updates regardless of isolation level. SERIALIZABLE isolation is not needed and would add overhead.
- **Retry strategy:** When a worker receives a conflict, it should retry the entire assign call (not just the UPDATE). The retry may select a different story if the conflicted story is no longer available.
- **Version incrementing:** The version field must be incremented on ALL story mutations (not just assignments) — including status changes, resets, and unassignments. This ensures that any concurrent modification is detected, not just concurrent assignments.
- **Drizzle `.returning()`** is used to get the updated row in a single round-trip, avoiding a separate SELECT after the UPDATE.

## References

- **Functional Requirements:** FR-ORCH-004 (atomic assignment), FR-ORCH-005 (conflict handling)
- **Design Specification:** Section 9.2 (Optimistic Locking), Section 9.2.1 (Concurrency Safety)
- **Domain Logic:** `optimisticLockVersion` pattern from `@laila/domain`
- **Database:** Drizzle ORM transaction API, `.returning()` clause

## Estimated Complexity

Very High — Optimistic locking implementation must be provably correct. The combination of version checking, status verification, transactional atomicity, and the retry-safe contract requires careful implementation and thorough testing.
