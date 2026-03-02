# Create Database Client Factory

## Task Details

- **Title:** Create Database Client Factory
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Configure Drizzle ORM with Neon](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Setup Neon Serverless Driver

## Description

Create the database client factory (`client.ts`) that integrates the Neon serverless driver with Drizzle ORM. This factory is the primary entry point for all database operations in the application — every repository and database query flows through the Drizzle client instance it creates.

The factory should support:

- Creating a Drizzle client from the Neon HTTP driver (for serverless/Lambda)
- Creating a Drizzle client from the Neon WebSocket pool (for long-running processes)
- Singleton pattern to avoid creating multiple clients in the same process
- Type-safe schema inference for all Drizzle queries

## Acceptance Criteria

- [ ] `packages/database/src/client.ts` exists with the database client factory
- [ ] The factory exports a `createDrizzleClient` function that accepts connection configuration and returns a Drizzle client instance
- [ ] The Drizzle client is typed with the full schema for type-safe queries: `drizzle<typeof schema>(client)`
- [ ] The factory supports HTTP mode for Lambda environments (lowest latency for single queries)
- [ ] The factory supports WebSocket pool mode for development and background processes
- [ ] A singleton `getDb()` function exists for request-scoped database access in the web app
- [ ] The factory validates that required environment variables are present before creating connections
- [ ] The client factory properly handles connection errors with descriptive error messages
- [ ] `packages/database/src/index.ts` re-exports the client factory and the Drizzle client type
- [ ] The module includes code comments explaining when to use each connection mode

## Technical Notes

- Database client factory implementation:

  ```typescript
  // packages/database/src/client.ts
  // Database client factory integrating Neon serverless driver with Drizzle ORM
  // Provides HTTP mode (Lambda) and WebSocket pool mode (long-running) clients
  import { drizzle } from 'drizzle-orm/neon-http';
  import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
  import { neon, Pool } from '@neondatabase/serverless';
  import * as schema from './schema';

  // Type export for consumers to reference the database client type
  export type Database = ReturnType<typeof createHttpClient>;

  /**
   * Creates a Drizzle client using Neon HTTP transport
   * Optimized for serverless: no persistent connection, lowest cold-start overhead
   * Each query is an independent HTTP request to Neon's SQL-over-HTTP endpoint
   */
  export function createHttpClient(databaseUrl: string) {
    const sql = neon(databaseUrl);
    return drizzle(sql, { schema });
  }

  /**
   * Creates a Drizzle client using Neon WebSocket pool
   * Suitable for long-running processes, development servers, and multi-statement transactions
   */
  export function createPoolClient(databaseUrl: string) {
    const pool = new Pool({ connectionString: databaseUrl });
    return drizzlePool(pool, { schema });
  }

  // Singleton for request-scoped access in the web application
  let _db: Database | null = null;

  /**
   * Returns a singleton Drizzle client instance
   * Uses HTTP mode by default for serverless compatibility
   * Call this in API route handlers and server-side functions
   */
  export function getDb(): Database {
    if (!_db) {
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DATABASE_URL environment variable is not set. ' +
            'Check your .env file or deployment configuration.',
        );
      }
      _db = createHttpClient(url);
    }
    return _db;
  }
  ```

- The `schema` parameter in `drizzle(client, { schema })` enables Drizzle's relational query API (`.query.projects.findMany()`) in addition to the SQL-like API
- The HTTP client creates a new HTTP request per query — this is the recommended approach for Lambda because it avoids connection management overhead
- The pool client maintains WebSocket connections and should be used for the `next dev` server and background Lambda functions that execute multiple queries
- Export the `Database` type so repositories can properly type their constructor parameter
- For testing, consider adding a `createTestClient` function that connects to a test database branch

## References

- **Functional Requirements:** Database access layer for all application components
- **Design Specification:** Drizzle ORM + Neon serverless integration
- **Project Setup:** packages/database client module

## Estimated Complexity

Medium — Requires understanding Drizzle ORM's adapter patterns, Neon's connection modes, and designing a factory that works across multiple execution environments (Lambda, Next.js dev server, test).
