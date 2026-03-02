# Implement Project Repository

## Task Details

- **Title:** Implement Project Repository
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Base Repository

## Description

Implement the project repository that provides CRUD operations for projects, extending the base repository with project-specific business logic. This includes lifecycle status transition validation, cascade soft-delete to child epics, and filtering by status.

The project repository is the entry point for the work hierarchy — creating, updating, and deleting projects affects all downstream entities (epics, stories, tasks).

## Acceptance Criteria

- [ ] `packages/database/src/repositories/project-repository.ts` exists
- [ ] Extends or uses the base repository for standard CRUD with tenant scoping
- [ ] `create(tenantId, data)` creates a project with `lifecycle_status = 'draft'` and `work_status = 'pending'`
- [ ] `update(tenantId, id, data, expectedVersion)` validates lifecycle status transitions:
  - Allowed: draft -> planning, planning -> ready, ready -> active, active -> completed, any -> archived
  - Rejected: backward transitions (e.g., completed -> active), skip transitions (e.g., draft -> active)
  - Throws a `ValidationError` with a descriptive message for invalid transitions
- [ ] `findByTenant(tenantId, options)` returns paginated projects filtered by optional `lifecycleStatus` and `workStatus` parameters
- [ ] `softDelete(tenantId, id)` cascades soft-delete to all child epics (and transitively to stories and tasks)
- [ ] `findWithEpicCounts(tenantId, id)` returns a project with aggregated epic counts by status
- [ ] `updateWorkStatus(tenantId, id, newStatus)` updates the derived work status (called when child epic statuses change)
- [ ] All methods enforce tenant scoping — no cross-tenant data access is possible
- [ ] All mutations use optimistic locking
- [ ] The repository is exported from `packages/database/src/repositories/index.ts`

## Technical Notes

- Status transition validation:

  ```typescript
  // packages/database/src/repositories/project-repository.ts
  // Project repository with lifecycle status transition validation
  // Projects follow a linear lifecycle: draft -> planning -> ready -> active -> completed -> archived

  // Valid lifecycle transitions — define as a map for O(1) lookup
  const VALID_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
    draft: ['planning', 'archived'],
    planning: ['ready', 'archived'],
    ready: ['active', 'archived'],
    active: ['completed', 'archived'],
    completed: ['archived'],
    archived: [], // Terminal state — no further transitions
  };

  function validateLifecycleTransition(current: string, next: string): void {
    const allowed = VALID_LIFECYCLE_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
      throw new ValidationError(
        `Invalid lifecycle transition: '${current}' -> '${next}'. ` +
          `Allowed transitions from '${current}': [${allowed?.join(', ') ?? 'none'}]`,
      );
    }
  }
  ```

- Cascade soft-delete should be implemented as a transaction:
  ```typescript
  // Cascade soft-delete: mark project and all children as deleted
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(projects).set({ deletedAt: now }).where(/* ... */);
    await tx.update(epics).set({ deletedAt: now }).where(eq(epics.projectId, projectId));
    await tx.update(userStories).set({ deletedAt: now }).where(/* stories in affected epics */);
    await tx.update(tasks).set({ deletedAt: now }).where(/* tasks in affected stories */);
  });
  ```
- The `findWithEpicCounts` method uses a SQL aggregation query to efficiently count epics by status without loading all epic records
- Consider adding a `restore(tenantId, id)` method that reverses a soft-delete (sets `deleted_at` back to null) for undo functionality

## References

- **Functional Requirements:** Project CRUD, lifecycle management, cascade operations
- **Design Specification:** Project lifecycle state machine, tenant-scoped queries
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Medium — CRUD operations are standard but lifecycle validation, cascade soft-delete transactions, and aggregated count queries add meaningful complexity.
