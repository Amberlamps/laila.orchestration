# Setup Neon Serverless Driver

## Task Details

- **Title:** Setup Neon Serverless Driver
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Configure Drizzle ORM with Neon](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** None

## Description

Install and configure the `@neondatabase/serverless` driver as the PostgreSQL connection layer for the application. This driver is specifically designed for serverless environments (AWS Lambda, Vercel Edge, Cloudflare Workers) where traditional TCP-based PostgreSQL drivers are inefficient or unsupported.

The Neon serverless driver provides two connection modes:
1. **HTTP mode** — Single-query transactions over HTTP, ideal for simple reads and writes in Lambda functions with minimal latency overhead
2. **WebSocket mode** — Full-featured PostgreSQL wire protocol over WebSocket, supporting multi-statement transactions and prepared statements

The driver integrates directly with Drizzle ORM via the `drizzle-orm/neon-serverless` adapter.

## Acceptance Criteria

- [ ] `@neondatabase/serverless` is installed as a dependency in `packages/database`
- [ ] `drizzle-orm` is installed as a dependency in `packages/database`
- [ ] A connection configuration module exists at `packages/database/src/connection.ts` that:
  - Exports a `createNeonPool` function that creates a Neon connection pool from `DATABASE_URL`
  - Exports a `createNeonHttp` function that creates an HTTP-only client for single queries
  - Handles environment variable validation (throws descriptive errors for missing `DATABASE_URL`)
  - Supports both pooled and direct connection strings for different use cases
- [ ] The connection module is environment-agnostic (works in Node.js local dev, Lambda, and test environments)
- [ ] Connection configuration is imported from environment variables, never hardcoded
- [ ] The module includes descriptive code comments explaining when to use HTTP vs. WebSocket mode

## Technical Notes

- Neon serverless driver setup:
  ```typescript
  // packages/database/src/connection.ts
  // Connection factory for the Neon serverless PostgreSQL driver
  // Provides both HTTP (single-query) and WebSocket (multi-statement) connection modes
  import { neon, neonConfig, Pool } from '@neondatabase/serverless';

  // Configure WebSocket for environments that need it (Lambda)
  // In Node.js 22+, the global WebSocket is available natively
  neonConfig.fetchConnectionCache = true;

  /**
   * Creates an HTTP-only Neon client for single queries
   * Best for: Lambda cold starts, simple reads, individual mutations
   * Lowest latency for single operations
   */
  export function createNeonHttp(databaseUrl: string) {
    return neon(databaseUrl);
  }

  /**
   * Creates a WebSocket-based connection pool for multi-statement transactions
   * Best for: Complex operations, migrations, transactions with multiple queries
   */
  export function createNeonPool(databaseUrl: string) {
    return new Pool({ connectionString: databaseUrl });
  }
  ```
- Node.js 22.x has native WebSocket support, so no additional WebSocket polyfill (`ws` package) is needed for the Neon driver
- For local development, the same Neon cloud database is used (Neon offers free tier with branching) — there is no local PostgreSQL setup
- The `DATABASE_URL` should include `?sslmode=require` for Neon connections
- Consider creating a `getRequiredEnv` utility function that throws a descriptive error when environment variables are missing:
  ```typescript
  function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
  }
  ```

## References

- **Functional Requirements:** PostgreSQL database access via Neon
- **Design Specification:** @neondatabase/serverless, serverless-optimized connections
- **Project Setup:** packages/database connection layer

## Estimated Complexity

Small — Driver installation and configuration module creation. The Neon driver has a simple API and Drizzle integration is well-documented.
