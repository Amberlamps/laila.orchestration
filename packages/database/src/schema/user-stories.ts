/**
 * User Stories table -- second level of the work hierarchy (project > epic > story > task).
 *
 * User stories are the unit of work assignment: workers receive an entire story
 * (with all its tasks), not individual tasks. This table tracks the full
 * assignment lifecycle:
 *
 *   pending        -- story created, waiting for a worker
 *   assigned       -- assigned_worker_id set, worker picked it up
 *   in_progress    -- worker is actively executing the story's tasks
 *   completed      -- all tasks finished successfully
 *   failed         -- execution failed; may be retried if attempts < max_attempts
 *
 * The `attempts` counter tracks how many times the story has been picked up,
 * enabling retry limiting via `max_attempts`. When a worker is removed, its
 * `assigned_worker_id` is set to NULL (SET NULL) so the story can be reassigned;
 * the full attempt history lives in a separate table.
 *
 * Cost fields (`cost_estimate`, `actual_cost`) use numeric(10,4) for decimal
 * precision suitable for monetary/token-cost tracking.
 *
 * Supports optimistic locking (version), soft-delete (deleted_at),
 * and tenant isolation (tenant_id).
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';

import { attemptHistoryTable } from './attempt-history';
import { usersTable } from './auth';
import { epicsTable } from './epics';
import { tasksTable } from './tasks';
import { workersTable } from './workers';

// ---------------------------------------------------------------------------
// User Stories
// ---------------------------------------------------------------------------

export const userStoriesTable = pgTable(
  'user_stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    epicId: uuid('epic_id')
      .notNull()
      .references(() => epicsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    priority: text('priority').notNull().default('medium'),
    workStatus: text('work_status').notNull().default('pending'),
    costEstimate: numeric('cost_estimate', { precision: 10, scale: 4 }),
    actualCost: numeric('actual_cost', { precision: 10, scale: 4 }),

    // Assignment lifecycle fields
    // When a worker picks up this story, assigned_worker_id is set and
    // assigned_at records the timestamp. On worker deletion the FK is
    // set to NULL so the story can be re-assigned.
    assignedWorkerId: uuid('assigned_worker_id').references(() => workersTable.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),

    // Retry management: attempts increments each time a worker picks up
    // the story; once attempts >= max_attempts the story is not retried.
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),

    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('user_stories_tenant_id_idx').on(table.tenantId),
    index('user_stories_epic_id_idx').on(table.epicId),
    index('user_stories_assigned_worker_id_idx').on(table.assignedWorkerId),
    index('user_stories_tenant_status_idx').on(table.tenantId, table.workStatus),
    index('user_stories_epic_priority_idx').on(table.epicId, table.priority),
  ],
);

// ---------------------------------------------------------------------------
// User Stories relations
// ---------------------------------------------------------------------------

export const userStoriesRelations = relations(userStoriesTable, ({ one, many }) => ({
  epic: one(epicsTable, {
    fields: [userStoriesTable.epicId],
    references: [epicsTable.id],
  }),
  tasks: many(tasksTable),
  attempts: many(attemptHistoryTable),
}));
