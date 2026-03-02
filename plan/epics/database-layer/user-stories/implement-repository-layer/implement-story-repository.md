# Implement Story Repository

## Task Details

- **Title:** Implement Story Repository
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Base Repository

## Description

Implement the user story repository providing CRUD operations for user stories within epics. User stories are the unit of work assignment — they are assigned to workers, track execution cost, and manage retry attempts. The repository must enforce special rules around in-progress stories and assignment lifecycle.

Key behaviors:
- Stories that are `in_progress` cannot have their core fields modified (read-only enforcement during execution)
- Assignment tracking: setting/clearing `assigned_worker_id` and `assigned_at`
- Attempt management: incrementing `attempts` counter and logging to attempt_history
- Cost recording: updating `actual_cost` upon completion

## Acceptance Criteria

- [ ] `packages/database/src/repositories/story-repository.ts` exists
- [ ] Extends or uses the base repository for standard CRUD with tenant scoping
- [ ] `create(tenantId, epicId, data)` creates a story with `work_status = 'pending'`, `attempts = 0`
- [ ] `update(tenantId, id, data, expectedVersion)` rejects updates to core fields (title, description, priority, acceptance criteria) when story is `in_progress` — throws `ValidationError`
- [ ] `findByEpic(tenantId, epicId, options)` returns paginated stories with optional status and priority filters
- [ ] `findReadyForAssignment(tenantId, projectId)` finds stories that are `ready` status, not assigned, and under max_attempts — ordered by priority (critical > high > medium > low)
- [ ] `assignToWorker(tenantId, storyId, workerId, expectedVersion)` atomically:
  - Sets `assigned_worker_id`, `assigned_at`, `work_status = 'in_progress'`
  - Increments `attempts` counter
  - Creates an `attempt_history` record with `status = 'in_progress'`
  - Uses optimistic locking to prevent double-assignment race conditions
- [ ] `completeAssignment(tenantId, storyId, status, cost, reason, expectedVersion)` atomically:
  - Sets `work_status` to the provided status (`done` or `failed`)
  - Sets `actual_cost`
  - Clears `assigned_worker_id` and `assigned_at`
  - Updates the corresponding `attempt_history` record with completion details
- [ ] `releaseAssignment(tenantId, storyId, reason, expectedVersion)` handles timeout/failure release:
  - Clears assignment fields
  - Sets status back to `ready` (if under max_attempts) or `failed` (if at max_attempts)
  - Updates attempt_history with timeout/failure reason
- [ ] `getPreviousAttempts(tenantId, storyId)` returns the attempt history for a story
- [ ] All methods enforce tenant scoping and optimistic locking
- [ ] The repository is exported from `packages/database/src/repositories/index.ts`

## Technical Notes

- Assignment must be atomic to prevent race conditions:
  ```typescript
  // packages/database/src/repositories/story-repository.ts
  // Story repository with assignment lifecycle management
  // Assignments are atomic transactions to prevent double-assignment race conditions

  async assignToWorker(
    tenantId: string,
    storyId: string,
    workerId: string,
    expectedVersion: number,
  ) {
    return await db.transaction(async (tx) => {
      const now = new Date();

      // Atomically update story with optimistic lock check
      const [updated] = await tx
        .update(userStories)
        .set({
          assignedWorkerId: workerId,
          assignedAt: now,
          workStatus: 'in_progress',
          attempts: sql`${userStories.attempts} + 1`,
          version: sql`${userStories.version} + 1`,
          updatedAt: now,
        })
        .where(and(
          eq(userStories.id, storyId),
          eq(userStories.tenantId, tenantId),
          eq(userStories.version, expectedVersion),
          // Extra safety: only assign if currently ready and unassigned
          eq(userStories.workStatus, 'ready'),
          isNull(userStories.assignedWorkerId),
        ))
        .returning();

      if (!updated) {
        throw new ConflictError('UserStory', storyId, expectedVersion);
      }

      // Log the attempt in history
      await tx.insert(attemptHistory).values({
        tenantId,
        userStoryId: storyId,
        workerId,
        attemptNumber: updated.attempts,
        startedAt: now,
        status: 'in_progress',
      });

      return updated;
    });
  }
  ```
- The `findReadyForAssignment` query is one of the most performance-critical queries in the system — it's called on every work assignment request. Ensure the composite index `(tenant_id, work_status)` supports this efficiently
- Priority ordering: use a CASE expression or a priority-to-integer mapping for sorting:
  ```sql
  ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
  ```
- Read-only enforcement during in_progress: the update method should check the current status before allowing field modifications
- Consider adding a `findByWorker(tenantId, workerId)` method for workers to see their current and past assignments

## References

- **Functional Requirements:** Work assignment, retry management, cost tracking
- **Design Specification:** Assignment lifecycle, optimistic locking for race prevention
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Large — The most complex repository due to the assignment lifecycle (assign, complete, release), atomic transactions with optimistic locking, attempt history management, and read-only enforcement during execution.
