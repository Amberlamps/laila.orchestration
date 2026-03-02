/**
 * Tasks table -- atomic units of work in the orchestration hierarchy
 * (project > epic > story > task).
 *
 * Each task belongs to a single user story and represents one discrete piece of
 * work that an AI agent worker must complete. Workers receive the full set of
 * tasks for a story when the story is assigned.
 *
 * Key JSONB columns:
 * - `acceptance_criteria`: array of human-readable criteria the task output must
 *   satisfy, e.g. ["All tests pass", "No type errors"].
 * - `references`: array of external resource links that provide context for
 *   execution, e.g. [{ type: "doc", url: "...", title: "..." }].
 *
 * The optional `persona_id` links to the persona (role/skill profile) best
 * suited to execute this task. When a persona is deleted the FK is set to NULL
 * so the task remains intact and can be re-assigned to a different persona.
 *
 * Supports optimistic locking (version), soft-delete (deleted_at),
 * and tenant isolation (tenant_id).
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { personasTable } from './personas';
import { userStoriesTable } from './user-stories';

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasksTable = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    userStoryId: uuid('user_story_id')
      .notNull()
      .references(() => userStoriesTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),

    // Acceptance criteria stored as JSONB array of strings
    // e.g., ["All tests pass", "No type errors", "Documentation updated"]
    acceptanceCriteria: jsonb('acceptance_criteria').$type<string[]>().notNull().default([]),

    technicalNotes: text('technical_notes'),

    // Persona (role/skill profile) best suited for this task.
    // SET NULL on delete keeps the task intact for reassignment.
    personaId: uuid('persona_id').references(() => personasTable.id, {
      onDelete: 'set null',
    }),

    workStatus: text('work_status').notNull().default('pending'),

    // References to external resources (docs, specs, examples)
    // e.g., [{ type: "doc", url: "https://...", title: "API Spec" }]
    references: jsonb('references')
      .$type<Array<{ type: string; url: string; title: string }>>()
      .notNull()
      .default([]),

    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('tasks_tenant_id_idx').on(table.tenantId),
    index('tasks_user_story_id_idx').on(table.userStoryId),
    index('tasks_persona_id_idx').on(table.personaId),
    index('tasks_tenant_status_idx').on(table.tenantId, table.workStatus),
    index('tasks_story_status_idx').on(table.userStoryId, table.workStatus),
  ],
);

// ---------------------------------------------------------------------------
// Tasks relations
// ---------------------------------------------------------------------------

export const tasksRelations = relations(tasksTable, ({ one }) => ({
  userStory: one(userStoriesTable, {
    fields: [tasksTable.userStoryId],
    references: [userStoriesTable.id],
  }),
}));
