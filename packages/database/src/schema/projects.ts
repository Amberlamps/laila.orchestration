/**
 * Projects table -- top-level organizational unit in the work hierarchy.
 *
 * Supports optimistic locking (version), soft-delete (deleted_at),
 * and tenant isolation (tenant_id).
 *
 * A project has both a lifecycle_status (planning phase: draft, active, archived)
 * and a work_status (execution state: pending, in_progress, completed).
 * Status columns use text type for easier schema evolution; validation is
 * handled at the application layer via Zod schemas.
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { epicsTable } from './epics';
import { workerProjectAccessTable } from './workers';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectsTable = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    name: text('name').notNull(),
    description: text('description'),
    lifecycleStatus: text('lifecycle_status').notNull().default('draft'),
    workStatus: text('work_status').notNull().default('pending'),
    workerInactivityTimeoutMinutes: integer('worker_inactivity_timeout_minutes')
      .notNull()
      .default(30),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('projects_tenant_id_idx').on(table.tenantId),
    index('projects_tenant_status_idx').on(table.tenantId, table.lifecycleStatus),
    index('projects_tenant_deleted_idx').on(table.tenantId, table.deletedAt),
  ],
);

// ---------------------------------------------------------------------------
// Projects relations
// ---------------------------------------------------------------------------

export const projectsRelations = relations(projectsTable, ({ many }) => ({
  epics: many(epicsTable),
  workerProjectAccess: many(workerProjectAccessTable),
}));
