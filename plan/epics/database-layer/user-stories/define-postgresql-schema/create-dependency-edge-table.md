# Create Dependency Edge Table

## Task Details

- **Title:** Create Dependency Edge Table
- **Status:** Not Started
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables

## Description

Define the `task_dependency_edges` table that represents the Directed Acyclic Graph (DAG) of task dependencies. Each row is an edge from a dependent task to the task it depends on (prerequisite). This table is central to the orchestration system — it determines which tasks are blocked and which are ready for assignment.

The DAG structure ensures that:
- A task is only available for assignment when ALL of its prerequisite tasks are completed
- Circular dependencies are prevented (enforced at the application layer, not database)
- Dependency resolution queries are efficient via proper indexing

## Acceptance Criteria

- [ ] `packages/database/src/schema/dependency-edges.ts` defines the `task_dependency_edges` table
- [ ] Table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `dependent_task_id` (UUID FK to tasks, not null), `prerequisite_task_id` (UUID FK to tasks, not null), `created_at` (timestamp)
- [ ] Composite unique constraint on `(dependent_task_id, prerequisite_task_id)` prevents duplicate edges
- [ ] Check constraint (or application-level validation) ensures `dependent_task_id != prerequisite_task_id` (no self-loops)
- [ ] Index on `dependent_task_id` for efficiently finding all prerequisites of a task
- [ ] Index on `prerequisite_task_id` for efficiently finding all tasks that depend on a given task (downstream dependents)
- [ ] Index on `tenant_id` for tenant-scoped queries
- [ ] Foreign keys use cascade delete: if a task is deleted, its dependency edges are removed
- [ ] Table export is available for use in repository queries
- [ ] Code comments explain the DAG semantics: `dependent_task_id` DEPENDS ON `prerequisite_task_id` (prerequisite must complete first)

## Technical Notes

- Dependency edge table definition:
  ```typescript
  // packages/database/src/schema/dependency-edges.ts
  // Task dependency edges — represents the DAG (Directed Acyclic Graph)
  // Each row means: dependent_task_id DEPENDS ON prerequisite_task_id
  // A task is "ready" when ALL rows where it is the dependent_task_id
  // have their prerequisite_task_id in "done" status
  import { pgTable, uuid, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
  import { usersTable } from './auth';
  import { tasksTable } from './tasks';

  export const taskDependencyEdgesTable = pgTable('task_dependency_edges', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => usersTable.id),
    // The task that has a dependency (cannot start until prerequisite completes)
    dependentTaskId: uuid('dependent_task_id').notNull().references(() => tasksTable.id, {
      onDelete: 'cascade',
    }),
    // The task that must complete first (the prerequisite)
    prerequisiteTaskId: uuid('prerequisite_task_id').notNull().references(() => tasksTable.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    // Prevent duplicate edges between the same pair of tasks
    uniqueEdge: uniqueIndex('dep_edges_unique_idx')
      .on(table.dependentTaskId, table.prerequisiteTaskId),
    // Find all prerequisites for a given task (what blocks it)
    dependentIdx: index('dep_edges_dependent_idx').on(table.dependentTaskId),
    // Find all downstream tasks that depend on a given task (what it unblocks)
    prerequisiteIdx: index('dep_edges_prerequisite_idx').on(table.prerequisiteTaskId),
    tenantIdx: index('dep_edges_tenant_idx').on(table.tenantId),
  }));
  ```
- Key queries enabled by the indexes:
  1. "What are the prerequisites for task X?" → `WHERE dependent_task_id = X` (uses `dependentIdx`)
  2. "What tasks does task X unblock?" → `WHERE prerequisite_task_id = X` (uses `prerequisiteIdx`)
  3. "Is task X ready?" → Check if ALL prerequisites of X have `work_status = 'done'`
- Cycle detection is NOT enforced at the database level — it is handled by the domain layer's DAG validation module (packages/domain/src/dag/)
- The `tenant_id` is included for tenant isolation even though it can be derived from the task's tenant_id — this denormalization simplifies tenant-scoped dependency queries
- Consider adding a composite index `(tenant_id, dependent_task_id)` if tenant-scoped prerequisite queries are common

## References

- **Functional Requirements:** Task dependency management, DAG structure
- **Design Specification:** Directed Acyclic Graph for task ordering
- **Project Setup:** packages/database schema module

## Estimated Complexity

Small — Single table with straightforward columns. The complexity lies in the indexing strategy and understanding the DAG semantics, but the schema definition itself is simple.
