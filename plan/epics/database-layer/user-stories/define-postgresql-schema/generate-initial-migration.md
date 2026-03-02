# Generate Initial Migration

## Task Details

- **Title:** Generate Initial Migration
- **Status:** Not Started
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Define PostgreSQL Schema](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Create Auth Tables, Create Project and Epic Tables, Create Story and Task Tables, Create Dependency Edge Table, Create Worker Tables, Create Persona Table, Create Attempt History Table

## Description

Generate and verify the initial SQL migration from the complete Drizzle schema. This migration creates all database tables, indexes, constraints, and foreign keys in a single initial migration file. It is the first migration that runs against a fresh database to set up the complete schema.

This task is the gatekeeper for schema quality — it verifies that all table definitions compile correctly, all foreign key references resolve, all indexes are valid, and the generated SQL is correct.

## Acceptance Criteria

- [ ] Running `pnpm --filter @laila/database db:generate` produces a migration file in `packages/database/drizzle/`
- [ ] The generated migration file contains valid PostgreSQL SQL
- [ ] The migration creates all expected tables: `users`, `sessions`, `accounts`, `projects`, `epics`, `user_stories`, `tasks`, `task_dependency_edges`, `workers`, `worker_project_access`, `personas`, `attempt_history`
- [ ] All foreign key constraints are present in the generated SQL
- [ ] All indexes (including unique indexes and composite indexes) are present
- [ ] All default values are correctly specified
- [ ] The migration can be applied successfully against a clean Neon database branch: `pnpm --filter @laila/database db:migrate`
- [ ] After migration, the database schema matches the Drizzle TypeScript definitions exactly (no drift)
- [ ] The `drizzle/meta/` snapshot file is committed alongside the migration SQL
- [ ] A `packages/database/src/schema/index.ts` barrel export exists that re-exports all table definitions and relations
- [ ] All Drizzle schema files compile with `tsc --noEmit` without errors

## Technical Notes

- Migration generation steps:
  ```bash
  # Step 1: Ensure all schema files are syntactically correct
  pnpm --filter @laila/database typecheck

  # Step 2: Generate the migration
  pnpm --filter @laila/database db:generate
  # This creates: drizzle/0000_initial.sql and drizzle/meta/_journal.json

  # Step 3: Apply the migration to a test database
  pnpm --filter @laila/database db:migrate
  # This runs the SQL against DATABASE_DIRECT_URL

  # Step 4: Verify the schema matches
  pnpm --filter @laila/database db:push --dry-run
  # Should report "No changes detected" if migration matches schema
  ```
- Review the generated SQL carefully:
  - Check that `ON DELETE CASCADE` and `ON DELETE SET NULL` behaviors are correct for each foreign key
  - Verify that `UNIQUE INDEX` constraints are on the right columns
  - Ensure `NOT NULL` constraints are present where expected
  - Confirm `DEFAULT` values are correct (especially for timestamps, versions, and booleans)
- The schema barrel export should include:
  ```typescript
  // packages/database/src/schema/index.ts
  // Barrel export for all Drizzle table definitions
  // Import this in client.ts for typed Drizzle queries
  export * from './auth';
  export * from './projects';
  export * from './epics';
  export * from './user-stories';
  export * from './tasks';
  export * from './dependency-edges';
  export * from './workers';
  export * from './personas';
  export * from './attempt-history';
  ```
- Consider testing the migration on a Neon database branch (Neon supports instant branching for testing)
- The migration file should be committed to version control and never manually edited after generation
- If the generated SQL needs adjustments, modify the Drizzle TypeScript schema and regenerate

## References

- **Functional Requirements:** Database schema creation, migration management
- **Design Specification:** Complete schema verification, migration generation
- **Project Setup:** packages/database migration pipeline

## Estimated Complexity

Medium — While the Drizzle Kit command is simple, verifying the generated SQL is correct across all tables requires careful review. Any schema definition issues from previous tasks will surface here.
