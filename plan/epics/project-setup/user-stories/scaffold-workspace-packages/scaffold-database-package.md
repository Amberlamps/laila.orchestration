# Scaffold Database Package

## Task Details

- **Title:** Scaffold Database Package
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Scaffold Workspace Packages](./tasks.md)
- **Parent Epic:** [Project Setup & Monorepo Scaffold](../../user-stories.md)
- **Dependencies:** None (within this user story)

## Description

Create the `packages/database` workspace package that houses the Drizzle ORM schema definitions, database client configuration, repository implementations, DynamoDB access layer, and migration infrastructure.

This package serves as the data access layer for the entire application. It depends on `@laila/shared` for type definitions and constants, and exposes repository interfaces that the domain and API layers consume.

Directory structure:
- `src/schema/` — Drizzle table definitions (PostgreSQL schema)
- `src/repositories/` — Repository implementations with tenant-scoped queries
- `src/dynamo/` — DynamoDB access layer for audit logs
- `src/client.ts` — Database client factory
- `drizzle/` — Generated SQL migrations (managed by drizzle-kit)
- `drizzle.config.ts` — Drizzle Kit configuration for migration generation

## Acceptance Criteria

- [ ] `packages/database/package.json` exists with name `@laila/database`
- [ ] Dependencies include `drizzle-orm`, `@neondatabase/serverless`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-dynamodb`
- [ ] Dev dependencies include `drizzle-kit`
- [ ] `@laila/shared` is listed as a workspace dependency
- [ ] `packages/database/tsconfig.json` extends `../../tsconfig.base.json`
- [ ] Directory structure exists: `src/schema/`, `src/repositories/`, `src/dynamo/`
- [ ] `drizzle/` directory exists for migrations (with `.gitkeep`)
- [ ] `drizzle.config.ts` exists with a placeholder Drizzle Kit configuration
- [ ] `src/schema/index.ts` exists with a placeholder module comment
- [ ] `src/repositories/index.ts` exists with a placeholder module comment
- [ ] `src/dynamo/index.ts` exists with a placeholder module comment
- [ ] `src/client.ts` exists with a placeholder database client factory stub
- [ ] `src/index.ts` barrel export file exists
- [ ] Package compiles with `tsc --noEmit` without errors

## Technical Notes

- Drizzle ORM is chosen for its TypeScript-first approach, SQL-like query builder, and zero-overhead design
- The `@neondatabase/serverless` driver is specifically designed for serverless environments (Lambda, Edge) and uses HTTP/WebSocket instead of persistent TCP connections
- `drizzle.config.ts` should reference the schema files for migration generation:
  ```typescript
  // drizzle.config.ts
  // Configuration for Drizzle Kit migration generation
  // Points to schema definitions and specifies the PostgreSQL dialect
  import { defineConfig } from 'drizzle-kit';
  export default defineConfig({
    schema: './src/schema/*.ts',
    out: './drizzle',
    dialect: 'postgresql',
  });
  ```
- The DynamoDB layer uses AWS SDK v3 modular imports to minimize bundle size in Lambda
- Repository implementations will enforce tenant scoping — every query must include a `tenant_id` filter to ensure data isolation
- Migration files in `drizzle/` should be committed to version control for reproducible deployments

## References

- **Functional Requirements:** PostgreSQL data storage, DynamoDB audit logs
- **Design Specification:** Drizzle ORM, Neon serverless, AWS DynamoDB
- **Project Setup:** Database package scaffold

## Estimated Complexity

Small — Scaffold is directory and config file creation. Actual schema definitions and repository implementations are in Epic 3.
