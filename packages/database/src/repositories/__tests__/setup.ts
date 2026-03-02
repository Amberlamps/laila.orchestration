/**
 * @module setup
 *
 * Shared test infrastructure for repository integration tests.
 *
 * Provides:
 * - Database connection management (pool client for transaction support)
 * - Transaction-based test isolation (BEGIN / ROLLBACK around each test)
 * - Explicit connection lifecycle (initialize once / close pool once)
 * - Graceful skip when no database is available (DATABASE_URL not set)
 *
 * Each test file imports `getTestDb()` to obtain the shared database client,
 * and uses `setupTestTransaction()` to wrap each test in a rolled-back
 * transaction so that no test data persists between test cases.
 */

import { Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import * as schema from '../../schema';

import type { PoolDatabase } from '../../client';

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

/**
 * The database URL used for integration tests. Falls back from
 * TEST_DATABASE_URL to DATABASE_URL. When neither is set, tests
 * that depend on a real database connection should be skipped.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * Whether a database connection is available for integration tests.
 * Use with `describe.skipIf(!HAS_DATABASE)` to gracefully skip tests
 * when no database is configured.
 */
export const HAS_DATABASE = Boolean(TEST_DATABASE_URL);

// ---------------------------------------------------------------------------
// Database client singleton with explicit lifecycle
// ---------------------------------------------------------------------------

/** The underlying Neon WebSocket pool — tracked for explicit cleanup */
let _pool: Pool | null = null;

/** The Drizzle ORM client wrapping the pool */
let _db: PoolDatabase | null = null;

/**
 * Returns the shared database pool client for tests.
 *
 * The client is lazily created on first call and reused across all test files
 * in the same Vitest run. The pool is closed in `afterAll` by
 * `setupTestTransaction`.
 *
 * @throws {Error} If TEST_DATABASE_URL / DATABASE_URL is not set
 */
export const getTestDb = (): PoolDatabase => {
  if (!_db) {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for integration tests');
    }
    _pool = new Pool({ connectionString: TEST_DATABASE_URL });
    _db = drizzle(_pool, { schema }) as unknown as PoolDatabase;
  }
  return _db;
};

/**
 * Closes the shared pool connection. Called once after all tests complete
 * to release database resources cleanly.
 */
const closePool = async (): Promise<void> => {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
};

// ---------------------------------------------------------------------------
// Transaction-based test isolation
// ---------------------------------------------------------------------------

/**
 * Registers Vitest lifecycle hooks that manage the database connection
 * and wrap every test in a database transaction that is rolled back.
 *
 * Lifecycle:
 * - `beforeAll`:  Initialize the pool connection and verify it works
 * - `beforeEach`: BEGIN a transaction
 * - `afterEach`:  ROLLBACK the transaction (discard all test data)
 * - `afterAll`:   Close the pool connection and release resources
 *
 * This guarantees:
 * - Tests are isolated from each other (no shared state)
 * - No test data leaks into the database
 * - Tests can run in any order without interference
 * - The pool is cleanly closed after all tests finish
 *
 * Call this once at the top of each `describe` block that needs
 * database access.
 *
 * @example
 * ```typescript
 * describe('ProjectRepository', () => {
 *   setupTestTransaction();
 *   const db = getTestDb();
 *   // ... tests ...
 * });
 * ```
 */
export const setupTestTransaction = (): void => {
  beforeAll(async () => {
    const db = getTestDb();
    // Verify the connection works with a simple query
    await db.execute(sql`SELECT 1`);
  });

  beforeEach(async () => {
    const db = getTestDb();
    await db.execute(sql`BEGIN`);
  });

  afterEach(async () => {
    const db = getTestDb();
    await db.execute(sql`ROLLBACK`);
  });

  afterAll(async () => {
    await closePool();
  });
};
