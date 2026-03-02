/**
 * @module connection
 *
 * Connection factory for the Neon serverless PostgreSQL driver.
 *
 * Provides two connection modes optimized for serverless environments
 * (AWS Lambda, Vercel Edge, Cloudflare Workers):
 *
 * 1. **HTTP mode** (`createNeonHttp`) — Executes single queries over HTTP.
 *    Best for Lambda cold starts, simple reads, and individual mutations.
 *    Offers the lowest latency for one-off operations because it avoids
 *    the overhead of establishing and maintaining a WebSocket connection.
 *
 * 2. **WebSocket mode** (`createNeonPool`) — Opens a full PostgreSQL wire
 *    protocol session over WebSocket, enabling multi-statement transactions,
 *    prepared statements, and LISTEN/NOTIFY. Best for complex operations,
 *    migrations, and workflows that issue several queries in sequence.
 *
 * Both modes read the database URL from environment variables at call time,
 * never from hardcoded strings. The module is environment-agnostic: it works
 * identically in Node.js local dev, AWS Lambda, and test environments.
 *
 * Node.js 22+ ships a native WebSocket global, so no `ws` polyfill is needed.
 */

import { neon, neonConfig, Pool } from '@neondatabase/serverless';

import type { NeonQueryFunction } from '@neondatabase/serverless';

// Enable the server-side connection cache for HTTP (fetch) queries.
// Although this setting is deprecated in @neondatabase/serverless >= 1.0
// (all queries now use the cache by default), we set it explicitly for
// backward compatibility with environments running older driver versions.
neonConfig.fetchConnectionCache = true;

/**
 * Retrieves a required environment variable or throws a descriptive error.
 *
 * Use this instead of accessing `process.env` directly so that missing
 * configuration is caught early with a clear message rather than surfacing
 * as a cryptic connection failure deep in the driver.
 *
 * @param name - The environment variable name (e.g. `DATABASE_URL`)
 * @returns The environment variable value, guaranteed to be a non-empty string
 * @throws {Error} When the variable is undefined or empty
 */
export const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Ensure it is set in your .env file or deployment configuration.`,
    );
  }

  return value;
};

/**
 * Creates an HTTP-only Neon SQL query function.
 *
 * **When to use:**
 * - Lambda handlers that execute a single SELECT / INSERT / UPDATE / DELETE
 * - Simple read endpoints where latency must be minimal
 * - Environments that do not support long-lived WebSocket connections
 *
 * The returned function is a tagged-template SQL executor:
 * ```typescript
 * const sql = createNeonHttp(process.env.DATABASE_URL!);
 * const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
 * ```
 *
 * @param databaseUrl - A Neon connection string (should include `?sslmode=require`)
 * @returns A Neon SQL query function for single HTTP-based queries
 */
export const createNeonHttp = (databaseUrl: string): NeonQueryFunction<false, false> => {
  return neon(databaseUrl);
};

/**
 * Creates a WebSocket-based Neon connection pool.
 *
 * **When to use:**
 * - Multi-statement transactions (`BEGIN ... COMMIT`)
 * - Database migrations that run several DDL statements
 * - Complex workflows issuing multiple dependent queries
 * - Operations requiring prepared statements or cursors
 *
 * The returned `Pool` follows the standard `pg.Pool` interface:
 * ```typescript
 * const pool = createNeonPool(process.env.DATABASE_URL!);
 * const client = await pool.connect();
 * try {
 *   await client.query('BEGIN');
 *   await client.query('INSERT INTO ...');
 *   await client.query('COMMIT');
 * } finally {
 *   client.release();
 * }
 * ```
 *
 * @param databaseUrl - A Neon connection string (pooled or direct).
 *   Use the **pooled** connection string (`-pooler.` hostname) for Lambda
 *   workloads to benefit from PgBouncer on the Neon side. Use the **direct**
 *   string for migrations or sessions that need full protocol support.
 * @returns A `Pool` instance from `@neondatabase/serverless`
 */
export const createNeonPool = (databaseUrl: string): Pool => {
  return new Pool({ connectionString: databaseUrl });
};
