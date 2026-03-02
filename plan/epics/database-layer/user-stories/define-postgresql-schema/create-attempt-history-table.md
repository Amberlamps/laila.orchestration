# Create Attempt History Table

## Task Details

- **Title:** Create Attempt History Table
- **Status:** Not Started
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables

## Description

Define the `attempt_history` table that tracks every worker assignment attempt for user stories. Each row records a single attempt: which worker was assigned, when the assignment started and ended, the outcome (success/failure), the reason for failure (if applicable), and the cost incurred.

This history is essential for:
- Debugging failed assignments (what went wrong, which worker tried)
- Cost accounting (tracking per-attempt and total execution costs)
- Retry intelligence (avoiding reassigning to a worker that already failed on this story)
- Audit trail (complete record of who worked on what and when)

## Acceptance Criteria

- [ ] `packages/database/src/schema/attempt-history.ts` defines the `attempt_history` table
- [ ] Table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `user_story_id` (UUID FK to user_stories), `worker_id` (UUID FK to workers), `attempt_number` (integer, not null), `started_at` (timestamp, not null), `completed_at` (timestamp, nullable), `status` (text, not null — 'in_progress', 'completed', 'failed', 'timed_out'), `reason` (text, nullable — failure/timeout reason), `cost` (numeric, nullable), `duration_ms` (integer, nullable — computed from started_at to completed_at), `created_at` (timestamp)
- [ ] Indexes: `tenant_id`, `user_story_id`, `worker_id`, composite `(user_story_id, attempt_number)`, composite `(worker_id, started_at)`
- [ ] Foreign keys: `tenant_id -> users.id`, `user_story_id -> user_stories.id` (cascade delete), `worker_id -> workers.id` (set null on delete — preserve history even if worker is deleted)
- [ ] Drizzle relations are defined: story-to-attempts (one-to-many), worker-to-attempts (one-to-many)
- [ ] Code comments explain the attempt lifecycle: created when assigned -> updated when completed/failed/timed_out

## Technical Notes

- Attempt history table definition:
  ```typescript
  // packages/database/src/schema/attempt-history.ts
  // Attempt history — records every worker assignment attempt for user stories
  // Lifecycle: row created at assignment time (started_at set, status = 'in_progress')
  //            row updated at completion (completed_at set, status = 'completed'/'failed'/'timed_out')
  // This provides a complete audit trail of work execution and enables retry intelligence
  import { pgTable, uuid, text, integer, timestamp, numeric, index } from 'drizzle-orm/pg-core';
  import { usersTable } from './auth';
  import { userStoriesTable } from './user-stories';
  import { workersTable } from './workers';

  export const attemptHistoryTable = pgTable('attempt_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => usersTable.id),
    userStoryId: uuid('user_story_id').notNull().references(() => userStoriesTable.id, {
      onDelete: 'cascade',
    }),
    // Worker that executed this attempt — set null if worker is later deleted
    workerId: uuid('worker_id').references(() => workersTable.id, {
      onDelete: 'set null',
    }),
    // Sequential attempt number for this user story (1, 2, 3...)
    attemptNumber: integer('attempt_number').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // Outcome of the attempt
    status: text('status').notNull().default('in_progress'),
    // Human-readable reason for failure or timeout (null for success)
    reason: text('reason'),
    // Cost incurred during this attempt (LLM tokens, API calls, etc.)
    cost: numeric('cost', { precision: 10, scale: 4 }),
    // Execution duration in milliseconds (computed at completion time)
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    tenantIdx: index('attempts_tenant_idx').on(table.tenantId),
    storyIdx: index('attempts_story_idx').on(table.userStoryId),
    workerIdx: index('attempts_worker_idx').on(table.workerId),
    // Ensure unique attempt numbers per story and enable ordered history queries
    storyAttemptIdx: index('attempts_story_attempt_idx')
      .on(table.userStoryId, table.attemptNumber),
    // Enable worker activity timeline queries
    workerTimeIdx: index('attempts_worker_time_idx')
      .on(table.workerId, table.startedAt),
  }));
  ```
- The `attempt_number` is derived from the user story's `attempts` counter at the time of assignment
- `duration_ms` is computed at completion time as `completed_at - started_at` in milliseconds, stored for efficient querying without date arithmetic
- The `cost` field uses `numeric(10, 4)` for precise decimal representation (up to 999,999.9999)
- `worker_id` uses `SET NULL` on delete to preserve attempt history even after a worker is decommissioned
- This table does NOT use soft delete or optimistic locking — attempt records are append-only (created on assignment, updated once on completion)
- Common queries:
  - "Get all attempts for story X" → `WHERE user_story_id = X ORDER BY attempt_number`
  - "Get recent worker activity" → `WHERE worker_id = W ORDER BY started_at DESC`
  - "Find timed-out attempts" → `WHERE status = 'in_progress' AND started_at < (now - timeout_threshold)`

## References

- **Functional Requirements:** Attempt tracking, cost accounting, retry intelligence
- **Design Specification:** Attempt history entity model, execution lifecycle
- **Project Setup:** packages/database schema module

## Estimated Complexity

Small — Single table with clear columns and indexes. The lifecycle is simple (create on assign, update on complete). No complex constraints or JSONB columns.
