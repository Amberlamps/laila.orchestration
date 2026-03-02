# Create Persona Table

## Task Details

- **Title:** Create Persona Table
- **Status:** Complete
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables

## Description

Define the `personas` table in the Drizzle schema. Personas represent role definitions (e.g., "backend-developer", "database-administrator", "qa-expert") that tasks reference to indicate what type of agent skill is needed for execution.

Personas are tenant-scoped — each tenant defines their own set of personas that describe the roles in their workflow. Tasks reference personas to help the orchestration system match work with appropriately skilled agents.

The persona description field supports Markdown for rich formatting, allowing detailed role specifications including required skills, tools, and behavioral guidelines.

## Acceptance Criteria

- [ ] `packages/database/src/schema/personas.ts` defines the `personas` table
- [ ] Personas table columns: `id` (UUID PK), `tenant_id` (UUID FK to users), `title` (text, not null), `description` (text, not null — Markdown content), `created_at` (timestamp), `updated_at` (timestamp)
- [ ] Personas table has indexes: `tenant_id`, composite `(tenant_id, title)` for unique persona names per tenant
- [ ] A unique constraint on `(tenant_id, title)` ensures no duplicate persona names within a tenant
- [ ] Foreign key: `tenant_id -> users.id`
- [ ] Drizzle relations are defined: persona-to-tasks (one-to-many) — a persona can be referenced by many tasks
- [ ] Table export is available for use as a foreign key target from the tasks table
- [ ] Code comments explain that personas are soft-referenced by tasks and that deletion should be guarded by checking for active task references

## Technical Notes

- Persona table definition:

  ```typescript
  // packages/database/src/schema/personas.ts
  // Personas table — role definitions for task assignment matching
  // Each persona describes a type of agent skill needed to execute tasks
  // Tasks reference personas to indicate what expertise is required
  // Examples: "backend-developer", "database-administrator", "qa-expert"
  import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
  import { relations } from 'drizzle-orm';
  import { usersTable } from './auth';

  export const personasTable = pgTable(
    'personas',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      tenantId: uuid('tenant_id')
        .notNull()
        .references(() => usersTable.id),
      // Human-readable role title (e.g., "Backend Developer", "QA Engineer")
      title: text('title').notNull(),
      // Rich description of the persona's capabilities and responsibilities (Markdown)
      // Used as context for AI agents when executing tasks assigned to this persona
      description: text('description').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
      tenantIdx: index('personas_tenant_idx').on(table.tenantId),
      // Ensure unique persona titles within a tenant
      tenantTitleUniqueIdx: uniqueIndex('personas_tenant_title_unique_idx').on(
        table.tenantId,
        table.title,
      ),
    }),
  );
  ```

- Personas do NOT use soft delete — they are either active or deleted. However, deletion must be guarded: the repository layer should check if any non-completed tasks reference the persona before allowing deletion
- The `description` field is intentionally `text` (unlimited length) since Markdown persona descriptions can be detailed
- Unlike most tables, personas do not have a `version` column for optimistic locking since concurrent editing conflicts are unlikely for persona definitions. This can be added later if needed
- Personas do not have a `deleted_at` column — deletion is physical but guarded by referential integrity checks at the application layer

## References

- **Functional Requirements:** Role-based task assignment, persona definitions
- **Design Specification:** Persona entity model, Markdown descriptions
- **Project Setup:** packages/database schema module

## Estimated Complexity

Small — Single table with straightforward columns. The main design consideration is the unique constraint per tenant and the deletion guard strategy.
