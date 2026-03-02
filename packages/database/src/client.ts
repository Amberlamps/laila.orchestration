/**
 * @module client
 *
 * Database client factory integrating Neon serverless driver with Drizzle ORM.
 *
 * The primary entry point is `createDrizzleClient`, which accepts a connection
 * configuration (mode + URL) and returns the correct typed Drizzle client.
 *
 * Two connection modes are available:
 *
 * 1. **HTTP mode** (`'http'`) — Each query executes as an independent HTTP
 *    request to Neon's SQL-over-HTTP endpoint. Recommended for AWS Lambda and
 *    other serverless environments (no persistent connections, minimal cold
 *    start latency).
 *
 * 2. **WebSocket pool mode** (`'pool'`) — Maintains a pool of WebSocket
 *    connections using the standard `pg.Pool` interface. Supports multi-
 *    statement transactions, prepared statements, and cursors. Use for dev
 *    servers, migrations, and background Lambda functions.
 *
 * A singleton accessor (`getDb`) is also provided for request-scoped access,
 * lazily creating an HTTP client from `DATABASE_URL` on first call.
 *
 * @example
 * ```typescript
 * // Unified factory — specify mode explicitly
 * import { createDrizzleClient } from '@laila/database';
 * const db = createDrizzleClient({ mode: 'http', url: process.env.DATABASE_URL! });
 * const users = await db.query.users.findMany();
 *
 * // Pool mode for transactions
 * const poolDb = createDrizzleClient({ mode: 'pool', url: process.env.DATABASE_URL! });
 *
 * // Request-scoped singleton — simplest usage in API routes
 * import { getDb } from '@laila/database';
 * const db = getDb();
 * ```
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';

import { createNeonHttp, createNeonPool, getRequiredEnv } from './connection';
import * as schema from './schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported connection modes for the Drizzle client factory. */
export type ConnectionMode = 'http' | 'pool';

/** Configuration accepted by `createDrizzleClient`. */
export interface ConnectionConfig {
  /** `'http'` for serverless/Lambda, `'pool'` for long-running processes. */
  mode: ConnectionMode;
  /** A Neon PostgreSQL connection string (e.g. `postgres://user:pass@host/db`). */
  url: string;
}

/**
 * The Drizzle database client type used throughout the application.
 *
 * This is the return type of `createHttpClient`, which uses the Neon HTTP
 * transport. Repositories and services should accept this type in their
 * constructors so they remain agnostic of the underlying connection mode.
 */
export type Database = ReturnType<typeof createHttpClient>;

/**
 * The Drizzle database client type for the WebSocket pool mode.
 *
 * Use this when you specifically need to reference the pool-backed client,
 * for example in migration scripts or long-running background workers.
 */
export type PoolDatabase = ReturnType<typeof createPoolClient>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a PostgreSQL connection string before it reaches the driver.
 *
 * @throws {Error} If the string is empty or uses an unsupported protocol
 */
const validateConnectionString = (url: string): void => {
  if (!url || url.trim().length === 0) {
    throw new Error(
      'Database connection string is empty. ' +
        'Provide a valid PostgreSQL connection URL ' +
        '(e.g. postgres://user:pass@host/db?sslmode=require).',
    );
  }

  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      `Invalid database connection string: expected a URL starting with ` +
        `"postgres://" or "postgresql://", but received "${url.slice(0, 24)}…". ` +
        `Check your DATABASE_URL environment variable.`,
    );
  }
};

// ---------------------------------------------------------------------------
// Internal factory functions
// ---------------------------------------------------------------------------

/**
 * Creates a Drizzle client using Neon HTTP transport.
 *
 * Prefer `createDrizzleClient({ mode: 'http', url })` in application code.
 *
 * **When to use HTTP mode:**
 * - AWS Lambda handlers that execute single queries per invocation
 * - Vercel serverless or Edge API routes
 * - Simple read endpoints where cold-start latency must be minimal
 * - Any environment that does not support long-lived WebSocket connections
 *
 * @param databaseUrl - A Neon PostgreSQL connection string
 * @returns A fully typed Drizzle ORM client instance (HTTP mode)
 */
export const createHttpClient = (databaseUrl: string) => {
  validateConnectionString(databaseUrl);
  const sql = createNeonHttp(databaseUrl);
  return drizzle(sql, { schema });
};

/**
 * Creates a Drizzle client using a Neon WebSocket connection pool.
 *
 * Prefer `createDrizzleClient({ mode: 'pool', url })` in application code.
 *
 * **When to use pool mode:**
 * - Multi-statement transactions (`BEGIN ... COMMIT`)
 * - Database migrations that run several DDL statements in sequence
 * - Development servers (e.g. `next dev`) that benefit from connection reuse
 * - Background workers or scheduled jobs that execute many queries
 *
 * @param databaseUrl - A Neon PostgreSQL connection string
 * @returns A fully typed Drizzle ORM client instance (WebSocket pool mode)
 */
export const createPoolClient = (databaseUrl: string) => {
  validateConnectionString(databaseUrl);
  const pool = createNeonPool(databaseUrl);
  return drizzlePool(pool, { schema });
};

// ---------------------------------------------------------------------------
// Unified factory
// ---------------------------------------------------------------------------

/**
 * Creates a Drizzle client for the specified connection mode.
 *
 * This is the primary entry point for obtaining a database client. It
 * validates the connection string, selects the correct Neon transport
 * (HTTP or WebSocket pool), and returns a fully typed Drizzle instance.
 *
 * @param config - Connection mode (`'http'` | `'pool'`) and database URL
 * @returns A typed Drizzle ORM client instance
 * @throws {Error} If the connection string is empty or malformed
 */
export const createDrizzleClient = (config: ConnectionConfig): Database | PoolDatabase => {
  if (config.mode === 'pool') {
    return createPoolClient(config.url);
  }
  return createHttpClient(config.url);
};

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

/** Module-level singleton for the default HTTP client. */
let _db: Database | null = null;

/**
 * Returns a singleton Drizzle client instance backed by Neon HTTP transport.
 *
 * On the first call the function reads `DATABASE_URL` from the environment
 * (validated via `getRequiredEnv`) and creates an HTTP client. Subsequent
 * calls return the same instance, avoiding redundant client construction.
 *
 * **When to use:**
 * - API route handlers in Next.js or Express where you need a quick,
 *   request-scoped database reference without wiring up dependency injection
 * - Server-side rendering functions that query the database
 *
 * @returns The shared `Database` instance
 * @throws {Error} If `DATABASE_URL` is not set or the connection string is invalid
 */
export const getDb = (): Database => {
  if (!_db) {
    const url = getRequiredEnv('DATABASE_URL');
    _db = createHttpClient(url);
  }
  return _db;
};
