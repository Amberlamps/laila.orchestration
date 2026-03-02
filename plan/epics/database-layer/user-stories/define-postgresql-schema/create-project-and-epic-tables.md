# Create Project and Epic Tables

## Task Details

- **Title:** Create Project and Epic Tables
- **Status:** Complete
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables

## Description

Define the `projects` and `epics` tables in the Drizzle schema. These represent the top two levels of the work hierarchy: projects contain epics, and epics contain user stories.

Both tables implement:

- **Optimistic locking** via a `version` integer column that is incremented on every update and checked in WHERE clauses to prevent concurrent modification conflicts
- **Soft delete** via a nullable `deleted_at` timestamp that marks records as deleted without physically removing them
- **Tenant scoping** via a `tenant_id` foreign key to the users table, ensuring complete data isolation between tenants

Projects have both a `lifecycle_status` (planning phase) and a `work_status` (execution state). Epics have only `work_status` since their lifecycle is tied to the parent project.

## Acceptance Criteria

- [ ] `packages/database/src/schema/projects.ts` defines the `projects` table
- [ ] Projects table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `name` (text, not null), `description` (text, nullable), `lifecycle_status` (text enum, not null, default 'draft'), `work_status` (text enum, not null, default 'pending'), `version` (integer, not null, default 0), `created_at` (timestamp), `updated_at` (timestamp), `deleted_at` (timestamp, nullable)
- [ ] Projects table has indexes: `tenant_id`, composite `(tenant_id, lifecycle_status)`, composite `(tenant_id, deleted_at)` for efficient filtered queries
- [ ] `packages/database/src/schema/epics.ts` defines the `epics` table
- [ ] Epics table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `project_id` (UUID FK to projects), `name` (text, not null), `description` (text, nullable), `work_status` (text enum, not null, default 'pending'), `sort_order` (integer, not null, default 0), `version` (integer, not null, default 0), `created_at` (timestamp), `updated_at` (timestamp), `deleted_at` (timestamp, nullable)
- [ ] Epics table has indexes: `tenant_id`, `project_id`, composite `(tenant_id, project_id)`, composite `(project_id, sort_order)`
- [ ] Foreign keys are defined with appropriate cascade behavior: `tenant_id -> users.id`, `project_id -> projects.id` (cascade delete)
- [ ] Both tables export their definitions for use as foreign key targets in other schema files
- [ ] Status columns use PostgreSQL text type with application-level enum validation (not PostgreSQL enum type) for easier schema evolution
- [ ] Drizzle relations are defined for project-to-epics (one-to-many)

## Technical Notes

- Table definition pattern:

  ```typescript
  // packages/database/src/schema/projects.ts
  // Projects table — top-level organizational unit in the work hierarchy
  // Supports optimistic locking (version), soft-delete (deleted_at), and tenant isolation (tenant_id)
  import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
  import { relations } from 'drizzle-orm';
  import { usersTable } from './auth';

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
      version: integer('version').notNull().default(0),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    (table) => ({
      tenantIdIdx: index('projects_tenant_id_idx').on(table.tenantId),
      tenantStatusIdx: index('projects_tenant_status_idx').on(
        table.tenantId,
        table.lifecycleStatus,
      ),
      tenantDeletedIdx: index('projects_tenant_deleted_idx').on(table.tenantId, table.deletedAt),
    }),
  );
  ```

- Use `text` type for status columns instead of PostgreSQL `enum` type — text is easier to evolve (adding new values doesn't require ALTER TYPE), and validation is handled at the application layer via Zod schemas
- The `version` column pattern for optimistic locking:
  ```sql
  -- Application-level optimistic locking check
  UPDATE projects SET name = $1, version = version + 1
  WHERE id = $2 AND tenant_id = $3 AND version = $4;
  -- If rowCount = 0, the version has changed (concurrent modification)
  ```
- Soft delete pattern: all queries must include `WHERE deleted_at IS NULL` — this is enforced by the repository layer
- Define Drizzle `relations()` for the ORM's relational query builder to work
- The `sort_order` column on epics allows manual reordering within a project

## References

- **Functional Requirements:** Project and epic management, hierarchical work structure
- **Design Specification:** Optimistic locking, soft delete, tenant isolation
- **Project Setup:** packages/database schema module

## Estimated Complexity

Medium — Two tables with multiple columns, indexes, foreign keys, and Drizzle relations. Requires careful consideration of indexing strategy for common query patterns.
