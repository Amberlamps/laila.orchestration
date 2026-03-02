/**
 * API keys table for execution agent authentication.
 *
 * Each API key is a separate record linked to a worker. A worker may have
 * multiple API keys (e.g. for rotation), each with its own prefix, hash,
 * optional expiry, and usage tracking.
 *
 * Authentication uses a prefix+hash pattern:
 *   1. Agent sends request with Authorization: Bearer lw_<hex>
 *   2. Server extracts the 8-char lookup prefix from the key body
 *   3. Server queries: SELECT * FROM api_keys WHERE prefix = '<prefix>'
 *   4. Server hashes the full key and compares with hashed_key
 *   5. If match and not expired, the agent is authenticated
 *
 * The raw API key is NEVER stored — only the SHA-256 hash and a short
 * prefix for O(1) index-based lookup.
 */

import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

import { usersTable } from './auth';
import { workersTable } from './workers';

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export const apiKeysTable = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => usersTable.id),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workersTable.id, { onDelete: 'cascade' }),
    /** SHA-256 hash of the full API key — never store the raw key. */
    hashedKey: text('hashed_key').notNull(),
    /**
     * First 8 hex characters of the key body for O(1) prefix-based lookup.
     * Must be globally unique (enforced by unique index).
     */
    prefix: text('prefix').notNull(),
    /** Optional human-readable label for the key (e.g. "Production Agent Key"). */
    name: text('name'),
    /** Whether this key has been revoked. Revoked keys cannot authenticate. */
    isRevoked: boolean('is_revoked').notNull().default(false),
    /** Optional expiration date. Null means the key never expires. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Updated asynchronously on every successful authentication. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('api_keys_prefix_unique_idx').on(table.prefix),
    index('api_keys_worker_id_idx').on(table.workerId),
    index('api_keys_tenant_id_idx').on(table.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const apiKeysRelations = relations(apiKeysTable, ({ one }) => ({
  worker: one(workersTable, {
    fields: [apiKeysTable.workerId],
    references: [workersTable.id],
  }),
}));
