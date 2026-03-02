/**
 * Epics table -- second level of the work hierarchy (projects > epics > stories).
 *
 * Supports optimistic locking (version), soft-delete (deleted_at),
 * and tenant isolation (tenant_id).
 *
 * Epics have only work_status (not lifecycle_status) because their lifecycle
 * is tied to the parent project. The sort_order column allows manual
 * reordering of epics within a project.
 *
 * Status columns use text type for easier schema evolution; validation is
 * handled at the application layer via Zod schemas.
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { projectsTable } from './projects';
import { userStoriesTable } from './user-stories';

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

export const epicsTable = pgTable(
  'epics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projectsTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    workStatus: text('work_status').notNull().default('pending'),
    sortOrder: integer('sort_order').notNull().default(0),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('epics_tenant_id_idx').on(table.tenantId),
    index('epics_project_id_idx').on(table.projectId),
    index('epics_tenant_project_idx').on(table.tenantId, table.projectId),
    index('epics_project_sort_idx').on(table.projectId, table.sortOrder),
  ],
);

// ---------------------------------------------------------------------------
// Epics relations
// ---------------------------------------------------------------------------

export const epicsRelations = relations(epicsTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [epicsTable.projectId],
    references: [projectsTable.id],
  }),
  stories: many(userStoriesTable),
}));
