/**
 * @module repositories
 *
 * Repository implementations with tenant-scoped queries.
 *
 * Each repository provides a data access interface for a specific domain entity.
 * All queries enforce tenant isolation by requiring a `tenantId` parameter,
 * ensuring no cross-tenant data leakage.
 *
 * Repositories depend on the Drizzle ORM client from `../client.ts` and
 * table definitions from `../schema/`.
 */

export {};
