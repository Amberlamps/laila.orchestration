# Configure Drizzle Kit Migrations

## Task Details

- **Title:** Configure Drizzle Kit Migrations
- **Status:** Not Started
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Configure Drizzle ORM with Neon](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Setup Neon Serverless Driver

## Description

Set up Drizzle Kit as the migration tool for managing PostgreSQL schema changes. Drizzle Kit generates SQL migration files by comparing the current Drizzle schema definitions with the previous migration state, producing deterministic and reviewable SQL migration files.

The configuration should support:
- Generating migrations from Drizzle TypeScript schema definitions
- Applying migrations to the database (both local dev and CI environments)
- Dropping and recreating the database for testing (via a reset script)
- Migration directory structure with sequential ordering

## Acceptance Criteria

- [ ] `drizzle-kit` is installed as a devDependency in `packages/database`
- [ ] `packages/database/drizzle.config.ts` exists with a complete Drizzle Kit configuration:
  - `schema` points to all schema files (`./src/schema/*.ts`)
  - `out` points to the migration output directory (`./drizzle`)
  - `dialect` is set to `"postgresql"`
  - `dbCredentials` reads `DATABASE_URL` from environment variables
- [ ] `packages/database/drizzle/` directory exists for migration output
- [ ] `packages/database/drizzle/meta/` directory will be auto-created by Drizzle Kit (no need to pre-create)
- [ ] `packages/database/package.json` includes migration scripts:
  - `"db:generate"` — Generate a new migration: `drizzle-kit generate`
  - `"db:migrate"` — Apply pending migrations: `drizzle-kit migrate`
  - `"db:push"` — Push schema directly (for prototyping): `drizzle-kit push`
  - `"db:studio"` — Open Drizzle Studio for visual database browsing: `drizzle-kit studio`
  - `"db:drop"` — Drop a migration: `drizzle-kit drop`
- [ ] Generated migration files are SQL (not TypeScript) for portability and reviewability
- [ ] The `drizzle/` directory is committed to version control (not in `.gitignore`)
- [ ] Running `pnpm --filter @laila/database db:generate` successfully creates a migration file (once schema is defined)

## Technical Notes

- Drizzle Kit configuration:
  ```typescript
  // packages/database/drizzle.config.ts
  // Drizzle Kit configuration for PostgreSQL migration generation and management
  // Reads schema from TypeScript definitions and outputs SQL migration files
  import { defineConfig } from 'drizzle-kit';

  export default defineConfig({
    schema: './src/schema/*.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
      // Uses the direct connection URL (not pooled) for migrations
      // The direct URL bypasses Neon's connection pooler for DDL operations
      url: process.env.DATABASE_DIRECT_URL!,
    },
    // Enable verbose logging during migration generation for debugging
    verbose: true,
    // Enable strict mode to catch potential issues in schema definitions
    strict: true,
  });
  ```
- Use `DATABASE_DIRECT_URL` (direct Neon connection) for migrations instead of the pooled `DATABASE_URL` — DDL operations (CREATE TABLE, ALTER TABLE) should bypass the connection pooler
- Migration files follow a naming convention: `0000_initial.sql`, `0001_add_workers_table.sql`, etc.
- Drizzle Kit's `generate` command compares the current TypeScript schema against the snapshot in `drizzle/meta/` to produce differential SQL
- `db:push` is useful during development for rapid iteration without generating migration files, but should not be used in production
- Drizzle Studio provides a web UI for browsing the database — useful for development debugging
- Consider adding a `db:reset` script that drops all tables and re-runs migrations for testing environments

## References

- **Functional Requirements:** Database schema versioning and migration management
- **Design Specification:** Drizzle Kit, PostgreSQL migrations
- **Project Setup:** packages/database migration infrastructure

## Estimated Complexity

Small — Standard Drizzle Kit configuration with well-documented setup. The configuration file is straightforward and the scripts follow standard patterns.
