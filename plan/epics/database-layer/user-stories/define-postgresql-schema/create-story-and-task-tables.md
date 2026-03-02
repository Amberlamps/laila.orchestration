# Create Story and Task Tables

## Task Details

- **Title:** Create Story and Task Tables
- **Status:** Complete
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables

## Description

Define the `user_stories` and `tasks` tables in the Drizzle schema. These represent the lower two levels of the work hierarchy: user stories are contained within epics and group related tasks, while tasks are the atomic units of work assigned to AI agent workers.

User stories track:

- Assignment to workers (which worker is currently executing it)
- Cost tracking (estimated and actual execution cost)
- Attempt management (how many times the story has been attempted, max retries)

Tasks track:

- Acceptance criteria (array of strings stored as JSONB)
- Technical notes for the executing agent
- Persona reference (what role/skill is needed)
- References to external resources (JSONB array)

## Acceptance Criteria

- [ ] `packages/database/src/schema/user-stories.ts` defines the `user_stories` table
- [ ] User stories table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `epic_id` (UUID FK to epics), `title` (text, not null), `description` (text, nullable), `priority` (text, not null, default 'medium'), `work_status` (text, not null, default 'pending'), `cost_estimate` (numeric, nullable), `actual_cost` (numeric, nullable), `assigned_worker_id` (UUID FK to workers, nullable), `assigned_at` (timestamp, nullable), `attempts` (integer, not null, default 0), `max_attempts` (integer, not null, default 3), `version` (integer, not null, default 0), `created_at` (timestamp), `updated_at` (timestamp), `deleted_at` (timestamp, nullable)
- [ ] User stories table has indexes: `tenant_id`, `epic_id`, `assigned_worker_id`, composite `(tenant_id, work_status)`, composite `(epic_id, priority)`
- [ ] `packages/database/src/schema/tasks.ts` defines the `tasks` table
- [ ] Tasks table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `user_story_id` (UUID FK to user_stories), `title` (text, not null), `description` (text, nullable), `acceptance_criteria` (jsonb, not null, default '[]'), `technical_notes` (text, nullable), `persona_id` (UUID FK to personas, nullable), `work_status` (text, not null, default 'pending'), `references` (jsonb, not null, default '[]'), `version` (integer, not null, default 0), `created_at` (timestamp), `updated_at` (timestamp), `deleted_at` (timestamp, nullable)
- [ ] Tasks table has indexes: `tenant_id`, `user_story_id`, `persona_id`, composite `(tenant_id, work_status)`, composite `(user_story_id, work_status)`
- [ ] Foreign keys include: `epic_id -> epics.id` (cascade delete), `assigned_worker_id -> workers.id` (set null on delete), `user_story_id -> user_stories.id` (cascade delete), `persona_id -> personas.id` (set null on delete)
- [ ] JSONB columns (`acceptance_criteria`, `references`) have appropriate TypeScript type annotations
- [ ] Drizzle relations are defined: epic-to-stories (one-to-many), story-to-tasks (one-to-many)
- [ ] Code comments explain the assignment lifecycle: pending -> assigned (assigned_worker_id set) -> in_progress -> done/failed

## Technical Notes

- JSONB column definition in Drizzle:

  ```typescript
  // packages/database/src/schema/tasks.ts
  // Tasks table — atomic units of work in the orchestration hierarchy
  // Contains acceptance criteria and references as structured JSONB data
  import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

  export const tasksTable = pgTable('tasks', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    userStoryId: uuid('user_story_id')
      .notNull()
      .references(() => userStoriesTable.id, {
        onDelete: 'cascade',
      }),
    // ... other columns
    // Acceptance criteria stored as JSONB array of strings
    // e.g., ["All tests pass", "No type errors", "Documentation updated"]
    acceptanceCriteria: jsonb('acceptance_criteria').$type<string[]>().notNull().default([]),
    // References to external resources (docs, specs, examples)
    // e.g., [{ type: "doc", url: "...", title: "..." }]
    references: jsonb('references')
      .$type<Array<{ type: string; url: string; title: string }>>()
      .notNull()
      .default([]),
  });
  ```

- Use `.$type<T>()` on JSONB columns to provide TypeScript type information — Drizzle uses this for query result typing
- The `numeric` type for cost fields provides decimal precision for monetary values — use `numeric('cost_estimate', { precision: 10, scale: 4 })` for cost tracking
- The `assigned_worker_id` uses `SET NULL` on delete so that if a worker is removed, the story's assignment history is preserved (the attempt_history table captures the full history)
- The `attempts` counter tracks how many times a story has been picked up by a worker, enabling retry limiting via `max_attempts`
- User stories are the unit of work assignment — workers receive a story with all its tasks, not individual tasks

## References

- **Functional Requirements:** Work assignment, cost tracking, retry management
- **Design Specification:** User story and task entity model, JSONB storage
- **Project Setup:** packages/database schema module

## Estimated Complexity

Medium — Two tables with complex column types (JSONB, numeric), multiple foreign keys with different cascade behaviors, and indexes for various query patterns.
