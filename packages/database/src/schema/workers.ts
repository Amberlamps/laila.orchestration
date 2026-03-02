/**
 * Workers and worker project access tables.
 *
 * Workers are AI execution agents that authenticate via API keys and request
 * work assignments from the orchestration service.
 *
 * API key authentication uses a prefix+hash pattern for efficient and secure
 * lookup:
 *   1. Worker sends request with X-API-Key header: "lw_abc123def456..."
 *   2. Server extracts the prefix: "lw_abc123" (first N characters)
 *   3. Server queries: SELECT * FROM workers WHERE api_key_prefix = 'lw_abc123'
 *   4. Server hashes the full key and compares with api_key_hash
 *   5. If match, the worker is authenticated
 *
 * The raw API key is NEVER stored -- only the hash and a short prefix for
 * O(1) index-based lookup.
 *
 * The worker_project_access junction table implements a many-to-many
 * relationship between workers and projects, controlling which projects a
 * worker is authorised to request work from.
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

import { attemptHistoryTable } from './attempt-history';
import { usersTable } from './auth';
import { projectsTable } from './projects';

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

export const workersTable = pgTable(
  'workers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    name: text('name').notNull(),
    description: text('description'),
    /** SHA-256 hash of the full API key -- never store the raw key. */
    apiKeyHash: text('api_key_hash').notNull(),
    /**
     * First 12 characters of the API key for efficient prefix-based lookup.
     * Format: "lw_" + 8 random chars (e.g. "lw_abc12345").
     * Must be globally unique (not just per-tenant).
     */
    apiKeyPrefix: text('api_key_prefix').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** Updated on every API request from the worker; useful for health monitoring. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('workers_tenant_id_idx').on(table.tenantId),
    uniqueIndex('workers_api_key_prefix_unique_idx').on(table.apiKeyPrefix),
    index('workers_tenant_active_idx').on(table.tenantId, table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Worker project access (junction table)
// ---------------------------------------------------------------------------

export const workerProjectAccessTable = pgTable(
  'worker_project_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workersTable.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projectsTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('worker_project_access_worker_project_unique_idx').on(
      table.workerId,
      table.projectId,
    ),
    index('worker_project_access_worker_id_idx').on(table.workerId),
    index('worker_project_access_project_id_idx').on(table.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Workers relations
// ---------------------------------------------------------------------------

export const workersRelations = relations(workersTable, ({ many }) => ({
  projectAccess: many(workerProjectAccessTable),
  attempts: many(attemptHistoryTable),
}));

// ---------------------------------------------------------------------------
// Worker project access relations
// ---------------------------------------------------------------------------

export const workerProjectAccessRelations = relations(workerProjectAccessTable, ({ one }) => ({
  worker: one(workersTable, {
    fields: [workerProjectAccessTable.workerId],
    references: [workersTable.id],
  }),
  project: one(projectsTable, {
    fields: [workerProjectAccessTable.projectId],
    references: [projectsTable.id],
  }),
}));
