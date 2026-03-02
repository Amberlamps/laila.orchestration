/**
 * Personas table -- role definitions for task assignment matching.
 *
 * Each persona describes a type of agent skill needed to execute tasks.
 * Examples: "backend-developer", "database-administrator", "qa-expert".
 *
 * Personas are tenant-scoped: each tenant (user) defines their own set of
 * personas that describe the roles in their workflow. Tasks reference personas
 * to help the orchestration system match work with appropriately skilled agents.
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

    /**
     * Human-readable role title (e.g., "Backend Developer", "QA Engineer").
     * Must be unique within a tenant (enforced by composite unique index).
     */
    title: text('title').notNull(),

    /**
     * Rich description of the persona's capabilities and responsibilities.
     * Stored as Markdown -- used as context for AI agents when executing
     * tasks assigned to this persona. Intentionally `text` (unlimited
     * length) since Markdown persona descriptions can be detailed.
     */
    description: text('description').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('personas_tenant_idx').on(table.tenantId),
    // Ensure unique persona titles within a tenant
    uniqueIndex('personas_tenant_title_unique_idx').on(table.tenantId, table.title),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

/**
 * Persona relations:
 * - belongs to one tenant (user)
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
  tasks: many(tasksTable),
}));
