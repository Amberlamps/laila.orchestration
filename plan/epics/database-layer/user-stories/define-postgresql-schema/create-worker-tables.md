# Create Worker Tables

## Task Details

- **Title:** Create Worker Tables
- **Status:** Not Started
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables

## Description

Define the `workers` table and `worker_project_access` junction table in the Drizzle schema. Workers represent AI execution agents that authenticate via API keys and request work assignments from the orchestration service.

The `workers` table stores:
- Worker identity and metadata
- A **hashed** API key (the raw key is only shown once at creation time)
- A **prefix** column containing the first characters of the API key (e.g., `lw_abc123`) for efficient lookup without exposing the full hash
- Active/inactive status and last-seen timestamp

The `worker_project_access` junction table implements a many-to-many relationship between workers and projects, controlling which projects a worker is authorized to request work from.

## Acceptance Criteria

- [ ] `packages/database/src/schema/workers.ts` defines the `workers` table
- [ ] Workers table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `name` (text, not null), `description` (text, nullable), `api_key_hash` (text, not null), `api_key_prefix` (text, not null), `is_active` (boolean, not null, default true), `last_seen_at` (timestamp, nullable), `created_at` (timestamp), `updated_at` (timestamp)
- [ ] Workers table has indexes: `tenant_id`, unique index on `api_key_prefix`, composite `(tenant_id, is_active)`
- [ ] `packages/database/src/schema/workers.ts` (or separate file) defines the `worker_project_access` table
- [ ] Worker project access table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `worker_id` (UUID FK to workers), `project_id` (UUID FK to projects), `created_at` (timestamp)
- [ ] Worker project access table has a composite unique constraint on `(worker_id, project_id)` to prevent duplicate grants
- [ ] Worker project access table has indexes: `worker_id`, `project_id`
- [ ] Foreign keys: `worker_id -> workers.id` (cascade delete), `project_id -> projects.id` (cascade delete)
- [ ] Workers table does NOT store the raw API key — only the hash and prefix
- [ ] The `api_key_prefix` column is designed for O(1) lookup: API authentication queries first match on prefix, then verify the full hash
- [ ] Drizzle relations are defined: worker-to-project-access (one-to-many), project-to-worker-access (one-to-many)

## Technical Notes

- API key authentication flow:
  ```
  1. Worker sends request with X-API-Key header: "lw_abc123def456..."
  2. Server extracts prefix: "lw_abc123" (first N characters)
  3. Server queries: SELECT * FROM workers WHERE api_key_prefix = 'lw_abc123'
  4. Server hashes the full key and compares with api_key_hash
  5. If match, worker is authenticated
  ```
- This two-step lookup (prefix index scan + hash verification) avoids scanning all workers and hashing against each one:
  ```typescript
  // packages/database/src/schema/workers.ts
  // Workers table — AI execution agents that authenticate via API keys
  // Uses a prefix+hash pattern for efficient and secure API key authentication
  import { pgTable, uuid, text, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

  export const workersTable = pgTable('workers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => usersTable.id),
    name: text('name').notNull(),
    description: text('description'),
    // SHA-256 hash of the full API key — never store the raw key
    apiKeyHash: text('api_key_hash').notNull(),
    // First 12 characters of the API key for efficient prefix-based lookup
    // Format: "lw_" + 8 random chars (e.g., "lw_abc12345")
    apiKeyPrefix: text('api_key_prefix').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    tenantIdx: index('workers_tenant_idx').on(table.tenantId),
    // Unique prefix index — enables O(1) lookup during API key authentication
    prefixUniqueIdx: uniqueIndex('workers_prefix_unique_idx').on(table.apiKeyPrefix),
    tenantActiveIdx: index('workers_tenant_active_idx').on(table.tenantId, table.isActive),
  }));
  ```
- The prefix must be long enough to be unique across all workers in the system (not just per tenant)
- Use SHA-256 or bcrypt for the API key hash — SHA-256 is faster for API key lookup (no salt needed since API keys have high entropy), while bcrypt is more appropriate for passwords
- `last_seen_at` is updated on every API request from the worker, useful for monitoring worker health
- The junction table uses cascade delete on both sides: removing a worker or project removes all access grants

## References

- **Functional Requirements:** Worker authentication, project access control
- **Design Specification:** API key prefix+hash pattern, worker-project authorization
- **Project Setup:** packages/database schema module

## Estimated Complexity

Medium — Two tables with a specific authentication pattern (prefix+hash) that requires careful design. The junction table for project access adds a many-to-many relationship.
