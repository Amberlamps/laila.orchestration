/**
 * Attempt history table -- records every worker assignment attempt for user stories.
 *
 * Lifecycle:
 *   1. Row created at assignment time (started_at set, status = 'in_progress')
 *   2. Row updated at completion (completed_at set, status changes to
 *      'completed', 'failed', or 'timed_out')
 *
 * This provides a complete audit trail of work execution and enables:
 *   - Debugging failed assignments (what went wrong, which worker tried)
 *   - Cost accounting (tracking per-attempt and total execution costs)
 *   - Retry intelligence (avoiding reassignment to a worker that already failed)
 *   - Audit trail (complete record of who worked on what and when)
 *
 * Records are append-only: created on assignment, updated once on completion.
 * This table does NOT use soft-delete or optimistic locking.
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { userStoriesTable } from './user-stories';
import { workersTable } from './workers';

// ---------------------------------------------------------------------------
// Attempt History
// ---------------------------------------------------------------------------

export const attemptHistoryTable = pgTable(
  'attempt_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),

    userStoryId: uuid('user_story_id')
      .notNull()
      .references(() => userStoriesTable.id, { onDelete: 'cascade' }),

    // Worker that executed this attempt -- set null if worker is later deleted,
    // preserving the attempt history even after a worker is decommissioned
    workerId: uuid('worker_id').references(() => workersTable.id, {
      onDelete: 'set null',
    }),

    // Sequential attempt number for this user story (1, 2, 3...)
    // Derived from the user story's attempts counter at assignment time
    attemptNumber: integer('attempt_number').notNull(),

    // Timestamp when the worker was assigned and began execution
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),

    // Timestamp when the attempt finished (null while in_progress)
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Outcome of the attempt: 'in_progress' | 'completed' | 'failed' | 'timed_out'
    // Validated at the application layer via Zod schemas
    status: text('status').notNull().default('in_progress'),

    // Human-readable reason for failure or timeout (null for success/in_progress)
    reason: text('reason'),

    // Cost incurred during this attempt (LLM tokens, API calls, etc.)
    // numeric(10,4) supports up to 999,999.9999
    cost: numeric('cost', { precision: 10, scale: 4 }),

    // Execution duration in milliseconds, computed at completion time as
    // completed_at - started_at; stored for efficient querying without date arithmetic
    durationMs: integer('duration_ms'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('attempts_tenant_idx').on(table.tenantId),
    index('attempts_story_idx').on(table.userStoryId),
    index('attempts_worker_idx').on(table.workerId),

    // Enable unique attempt numbers per story and ordered history queries
    index('attempts_story_attempt_idx').on(table.userStoryId, table.attemptNumber),

    // Enable worker activity timeline queries
    index('attempts_worker_time_idx').on(table.workerId, table.startedAt),
  ],
);

// ---------------------------------------------------------------------------
// Attempt History relations
// ---------------------------------------------------------------------------

/** Story-to-attempts: one user story has many attempts */
export const attemptHistoryRelations = relations(attemptHistoryTable, ({ one }) => ({
  userStory: one(userStoriesTable, {
    fields: [attemptHistoryTable.userStoryId],
    references: [userStoriesTable.id],
  }),
  worker: one(workersTable, {
    fields: [attemptHistoryTable.workerId],
    references: [workersTable.id],
  }),
}));
