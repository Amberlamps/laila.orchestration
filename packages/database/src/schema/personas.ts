/**
 * Personas table -- role definitions for task assignment matching.
 *
 * Each persona describes a type of agent skill needed to execute tasks.
 * Examples: "backend-developer", "database-administrator", "qa-expert".
 *
 * Personas are tenant-scoped and project-scoped: each tenant (user) defines
 * personas within specific projects. Tasks reference personas to help the
 * orchestration system match work with appropriately skilled agents.
 *
 * IMPORTANT -- Deletion guard:
 * Personas are soft-referenced by tasks (tasks carry a persona_id FK).
 * Physical deletion of a persona must be guarded at the repository/service
 * layer by checking whether any non-completed tasks still reference the
 * persona before allowing the delete. There is no `deleted_at` column --
 * personas do NOT use soft delete. There is no `version` column -- optimistic
 * locking is not needed for persona definitions.
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { projectsTable } from './projects';
import { tasksTable } from './tasks';

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export const personasTable = pgTable(
  'personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Tenant scope -- each user is their own tenant (users.id). */
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),

    /** Project scope -- personas belong to a specific project. */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projectsTable.id),

    /**
     * Human-readable persona name (e.g., "Backend Developer", "QA Engineer").
     * Must be unique within a project (enforced by composite unique index).
     */
    name: text('name').notNull(),

    /**
     * Optional short description of the persona's capabilities and role.
     * Up to 2,000 characters. Nullable.
     */
    description: text('description'),

    /**
     * System prompt instructions injected into the AI worker's context
     * when executing tasks assigned to this persona. Supports up to
     * 50,000 characters for detailed technical instructions.
     */
    systemPrompt: text('system_prompt').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('personas_tenant_idx').on(table.tenantId),
    index('personas_project_idx').on(table.projectId),
    // Ensure unique persona names within a project
    uniqueIndex('personas_project_name_unique_idx').on(table.projectId, table.name),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

/**
 * Persona relations:
 * - belongs to one tenant (user)
 * - belongs to one project
 * - referenced by many tasks (one-to-many)
 *
 * The tasks relation is the inverse side -- tasks carry the persona_id FK.
 * Deletion of a persona should be guarded by checking for active task
 * references at the application layer.
 */
export const personasRelations = relations(personasTable, ({ one, many }) => ({
  tenant: one(usersTable, {
    fields: [personasTable.tenantId],
    references: [usersTable.id],
  }),
  project: one(projectsTable, {
    fields: [personasTable.projectId],
    references: [projectsTable.id],
  }),
  tasks: many(tasksTable),
}));
