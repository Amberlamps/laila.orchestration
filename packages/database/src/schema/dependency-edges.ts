/**
 * Task Dependency Edges — Directed Acyclic Graph (DAG) representation.
 *
 * Each row in this table represents a single directed edge in the DAG:
 *
 *   dependent_task_id  ──DEPENDS ON──▶  prerequisite_task_id
 *
 * Semantics:
 * - The `dependent_task_id` task CANNOT start until `prerequisite_task_id` completes.
 * - A task is "ready" for assignment when ALL rows where it appears as
 *   `dependent_task_id` have their corresponding `prerequisite_task_id` in "done" status.
 * - If a task has NO rows as `dependent_task_id`, it has no prerequisites and is
 *   immediately ready for assignment.
 *
 * Key queries enabled by the indexes:
 * 1. "What are the prerequisites for task X?"
 *    → WHERE dependent_task_id = X  (uses dep_edges_dependent_idx)
 * 2. "What tasks does task X unblock when it completes?"
 *    → WHERE prerequisite_task_id = X  (uses dep_edges_prerequisite_idx)
 * 3. "Is task X ready?"
 *    → Check if ALL prerequisites of X have work_status = 'done'
 *
 * Cycle detection is NOT enforced at the database level — it is handled by the
 * domain layer's DAG validation module to keep schema simple and portable.
 *
 * The `tenant_id` column is intentionally denormalized (it could be derived from
 * either task's tenant_id) to simplify tenant-scoped dependency queries without
 * requiring a join back to the tasks table.
 */

import { sql } from 'drizzle-orm';
import { pgTable, uuid, timestamp, uniqueIndex, index, check } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { tasksTable } from './tasks';

export const taskDependencyEdgesTable = pgTable(
  'task_dependency_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Tenant scope — references users.id (each user is their own tenant). */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),

    /**
     * The task that has a dependency (cannot start until prerequisite completes).
     * Cascade delete: removing a task automatically removes all its dependency edges.
     */
    dependentTaskId: uuid('dependent_task_id')
      .notNull()
      .references(() => tasksTable.id, { onDelete: 'cascade' }),

    /**
     * The task that must complete first (the prerequisite).
     * Cascade delete: removing a task automatically removes edges where it was a prerequisite.
     */
    prerequisiteTaskId: uuid('prerequisite_task_id')
      .notNull()
      .references(() => tasksTable.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Prevent duplicate edges between the same pair of tasks
    uniqueIndex('dep_edges_unique_idx').on(table.dependentTaskId, table.prerequisiteTaskId),

    // Find all prerequisites for a given task (what blocks it)
    index('dep_edges_dependent_idx').on(table.dependentTaskId),

    // Find all downstream tasks that depend on a given task (what it unblocks)
    index('dep_edges_prerequisite_idx').on(table.prerequisiteTaskId),

    // Tenant-scoped queries for data isolation
    index('dep_edges_tenant_idx').on(table.tenantId),

    // Prevent self-loops: a task cannot depend on itself
    check('dep_edges_no_self_loop', sql`${table.dependentTaskId} != ${table.prerequisiteTaskId}`),
  ],
);
