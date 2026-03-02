/**
 * @module @laila/shared/types/utility
 *
 * Reusable TypeScript utility types for common entity patterns.
 *
 * These are pure TypeScript types with no runtime validation — they
 * provide structural building blocks that compose with domain entity
 * types to enforce consistent patterns across the codebase.
 *
 * For runtime-validated equivalents, use the corresponding Zod schemas
 * in `@laila/shared/schemas`.
 */

/**
 * Makes a type nullable (T or null).
 *
 * Use for fields that may legitimately have no value, such as
 * optional foreign keys or soft-delete timestamps.
 *
 * @example
 * ```typescript
 * type MaybeUser = Nullable<User>; // User | null
 * ```
 */
export type Nullable<T> = T | null;

/**
 * Mixin for entities that track creation and last-update timestamps.
 *
 * Timestamps are ISO 8601 strings to ensure safe serialization
 * across JSON, DynamoDB, and other storage formats.
 *
 * @example
 * ```typescript
 * type AuditedProject = Project & WithTimestamps;
 * ```
 */
export type WithTimestamps = {
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * Mixin for entities that support soft deletion.
 *
 * When `deletedAt` is non-null, the entity is considered deleted
 * and should be excluded from normal query results.
 */
export type WithSoftDelete = {
  readonly deletedAt: string | null;
};

/**
 * Mixin for entities that use optimistic locking.
 *
 * The `version` field is incremented on every write. Update requests
 * must include the current version; a mismatch triggers a
 * `CONFLICT_VERSION_MISMATCH` error.
 */
export type WithOptimisticLock = {
  readonly version: number;
};

/**
 * Mixin for entities that belong to a specific tenant.
 *
 * All tenant-scoped queries must include `tenantId` as a partition
 * key or filter to enforce data isolation in a multi-tenant system.
 */
export type TenantScoped = {
  readonly tenantId: string;
};
