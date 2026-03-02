# Implement Epic Repository

## Task Details

- **Title:** Implement Epic Repository
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Base Repository

## Description

Implement the epic repository providing CRUD operations for epics within projects. Epics have a work status that is derived (computed) from the aggregate status of their child user stories. The repository must support status computation, lifecycle transitions, and ordering within a project.

## Acceptance Criteria

- [ ] `packages/database/src/repositories/epic-repository.ts` exists
- [ ] Extends or uses the base repository for standard CRUD with tenant scoping
- [ ] `create(tenantId, projectId, data)` creates an epic with `work_status = 'pending'` and auto-assigned `sort_order`
- [ ] `findByProject(tenantId, projectId, options)` returns paginated epics for a project, ordered by `sort_order`
- [ ] `update(tenantId, id, data, expectedVersion)` updates epic fields with optimistic locking
- [ ] `reorder(tenantId, epicIds)` updates sort_order for multiple epics in a single transaction
- [ ] `computeDerivedStatus(tenantId, epicId)` calculates the work status from child story statuses:
  - All stories pending -> epic is `pending`
  - Any story in_progress -> epic is `in_progress`
  - All stories done -> epic is `done`
  - All remaining stories blocked -> epic is `blocked`
  - Mix of done and pending/ready -> epic is `in_progress`
- [ ] `softDelete(tenantId, id)` cascades to child user stories and their tasks
- [ ] `findWithStoryCounts(tenantId, epicId)` returns an epic with aggregated story counts by status
- [ ] All methods enforce tenant scoping and optimistic locking
- [ ] The repository is exported from `packages/database/src/repositories/index.ts`

## Technical Notes

- Derived status computation query:

  ```typescript
  // packages/database/src/repositories/epic-repository.ts
  // Epic repository with derived work status computation
  // An epic's work_status is computed from the aggregate status of its child user stories

  async computeDerivedStatus(tenantId: string, epicId: string): Promise<string> {
    // Query aggregate story statuses for this epic
    const statusCounts = await db
      .select({
        status: userStories.workStatus,
        count: sql<number>`count(*)`,
      })
      .from(userStories)
      .where(and(
        eq(userStories.epicId, epicId),
        eq(userStories.tenantId, tenantId),
        isNull(userStories.deletedAt),
      ))
      .groupBy(userStories.workStatus);

    // Derive epic status from story status distribution
    // Logic: all done -> done, any in_progress -> in_progress, etc.
    return deriveEpicStatus(statusCounts);
  }
  ```

- The `reorder` method should use a transaction to update all sort_order values atomically:
  ```typescript
  await db.transaction(async (tx) => {
    for (let i = 0; i < epicIds.length; i++) {
      await tx
        .update(epics)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(epics.id, epicIds[i]), eq(epics.tenantId, tenantId)));
    }
  });
  ```
- Auto-assigning `sort_order` on create: use `MAX(sort_order) + 1` for the project, or append to the end
- The derived status computation should be called whenever a child story's status changes (orchestrated by the API layer or a trigger)
- Consider adding a `recalculateAllStatuses(tenantId, projectId)` method for batch reconciliation (used by the dag-reconciler Lambda)

## References

- **Functional Requirements:** Epic management, derived status computation, ordering
- **Design Specification:** Epic-to-story relationship, status derivation rules
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Medium — Standard CRUD with additional derived status computation logic and bulk reordering. The status derivation algorithm requires careful handling of all status combinations.
