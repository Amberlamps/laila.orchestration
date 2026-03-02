# Implement Persona Repository

## Task Details

- **Title:** Implement Persona Repository
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Base Repository

## Description

Implement the persona repository providing CRUD operations for persona management. Personas are relatively simple entities, but their deletion requires a safety check: a persona cannot be deleted if any active (non-completed) tasks reference it.

## Acceptance Criteria

- [ ] `packages/database/src/repositories/persona-repository.ts` exists
- [ ] Extends or uses the base repository for standard CRUD with tenant scoping
- [ ] `create(tenantId, data)` creates a persona with title uniqueness check per tenant
- [ ] `update(tenantId, id, data)` updates persona fields (title, description)
- [ ] `findByTenant(tenantId, options)` returns paginated personas for a tenant
- [ ] `findById(tenantId, id)` returns a single persona or null
- [ ] `delete(tenantId, id)` performs physical deletion with a safety check:
  - Queries for active tasks (non-done, non-failed, non-skipped) referencing this persona
  - If active tasks exist, throws `ValidationError` with a descriptive message listing the count of referencing tasks
  - If no active tasks, performs the physical delete
- [ ] `findWithTaskCounts(tenantId, id)` returns a persona with counts of tasks referencing it (by status)
- [ ] Uniqueness validation on `(tenant_id, title)` is enforced — returns a clear error on duplicate
- [ ] All methods enforce tenant scoping
- [ ] The repository is exported from `packages/database/src/repositories/index.ts`

## Technical Notes

- Deletion guard implementation:
  ```typescript
  // packages/database/src/repositories/persona-repository.ts
  // Persona repository with deletion guard for active task references
  // Personas cannot be deleted while active tasks reference them

  async delete(tenantId: string, personaId: string): Promise<void> {
    // Check for active tasks referencing this persona
    const activeTaskCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasksTable)
      .where(and(
        eq(tasksTable.tenantId, tenantId),
        eq(tasksTable.personaId, personaId),
        isNull(tasksTable.deletedAt),
        // Active means not in a terminal state
        notInArray(tasksTable.workStatus, ['done', 'failed', 'skipped']),
      ));

    const count = activeTaskCount[0]?.count ?? 0;
    if (count > 0) {
      throw new ValidationError(
        `Cannot delete persona: ${count} active task(s) reference it. ` +
        `Complete or reassign the tasks before deleting this persona.`
      );
    }

    // Safe to delete — no active references
    await db
      .delete(personasTable)
      .where(and(
        eq(personasTable.id, personaId),
        eq(personasTable.tenantId, tenantId),
      ));
  }
  ```
- Title uniqueness is enforced by the database unique index, but the repository should catch the unique constraint violation and throw a user-friendly `ValidationError` instead of exposing the raw database error
- Personas use physical deletion (not soft-delete) since they are reference data, not transactional entities. Once safe to delete, they are permanently removed.
- The `findWithTaskCounts` method can use a SQL aggregation to count tasks by status:
  ```typescript
  const result = await db
    .select({
      persona: personasTable,
      activeCount: sql<number>`count(*) filter (where ${tasksTable.workStatus} not in ('done', 'failed', 'skipped'))`,
      totalCount: sql<number>`count(*)`,
    })
    .from(personasTable)
    .leftJoin(tasksTable, and(
      eq(tasksTable.personaId, personasTable.id),
      isNull(tasksTable.deletedAt),
    ))
    .where(and(eq(personasTable.id, id), eq(personasTable.tenantId, tenantId)))
    .groupBy(personasTable.id);
  ```

## References

- **Functional Requirements:** Persona CRUD, deletion safety guard
- **Design Specification:** Persona entity model, referential integrity
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Small — Straightforward CRUD with a deletion guard query. Simpler than other repositories since personas don't have optimistic locking or soft-delete.
