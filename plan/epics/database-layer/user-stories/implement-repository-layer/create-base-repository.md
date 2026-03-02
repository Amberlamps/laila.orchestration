# Create Base Repository

## Task Details

- **Title:** Create Base Repository
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** None (within this user story; depends on Define PostgreSQL Schema)

## Description

Create the base repository abstraction that all entity-specific repositories extend. This base provides the foundational patterns that ensure every database operation in the system follows consistent rules for:

1. **Mandatory tenant scoping** — Every query MUST include a `tenant_id` filter. This is the primary data isolation mechanism. The base repository makes it impossible to accidentally query across tenants.
2. **Pagination support** — Standard paginated query helpers that apply limit/offset, compute total count, and return pagination metadata.
3. **Soft-delete filtering** — All read queries automatically exclude soft-deleted records (`WHERE deleted_at IS NULL`). Explicit methods are provided for querying deleted records when needed.
4. **Optimistic locking** — Update helpers that automatically check and increment the `version` column, throwing a conflict error when the version doesn't match.

## Acceptance Criteria

- [ ] `packages/database/src/repositories/base-repository.ts` exists
- [ ] The base repository class/factory accepts a Drizzle database client and provides typed query methods
- [ ] All query methods require a `tenantId` parameter — there is no way to query without tenant scoping
- [ ] `findById(tenantId, id)` returns a single entity or null, excluding soft-deleted records
- [ ] `findMany(tenantId, options)` returns a paginated result with `{ data, pagination }` shape
- [ ] `create(tenantId, data)` inserts a new record with the tenant_id set
- [ ] `update(tenantId, id, data, expectedVersion)` updates a record with optimistic locking — throws `ConflictError` if version mismatch
- [ ] `softDelete(tenantId, id)` sets `deleted_at` to the current timestamp instead of physically deleting
- [ ] `hardDelete(tenantId, id)` physically removes a record (for use in testing and specific cleanup scenarios)
- [ ] Pagination helpers compute `total`, `totalPages`, `hasNext`, `hasPrev` from the query count and pagination params
- [ ] Optimistic locking increments `version` on every successful update
- [ ] A `ConflictError` class is defined and exported for optimistic locking failures
- [ ] The base repository is generic/parameterized to work with any Drizzle table definition
- [ ] Code comments explain each pattern (tenant scoping, soft-delete, optimistic locking) and why it exists

## Technical Notes

- Base repository pattern with Drizzle:

  ```typescript
  // packages/database/src/repositories/base-repository.ts
  // Base repository providing mandatory tenant scoping, pagination,
  // soft-delete filtering, and optimistic locking for all entity repositories
  import { eq, and, isNull, sql, SQL } from 'drizzle-orm';
  import type { PgTable } from 'drizzle-orm/pg-core';
  import type { Database } from '../client';
  import type { PaginationQuery, PaginatedResponse } from '@laila/shared';

  export class ConflictError extends Error {
    constructor(entityName: string, id: string, expectedVersion: number) {
      super(
        `Optimistic locking conflict: ${entityName} ${id} has been modified. ` +
          `Expected version ${expectedVersion} but found a newer version. ` +
          `Retry with the latest version.`,
      );
      this.name = 'ConflictError';
    }
  }

  // Ensures all queries include tenant_id — the type system prevents omission
  export type TenantScopedQuery<T> = T & { tenantId: string };
  ```

- The base repository should use Drizzle's query builder, not raw SQL, for type safety
- Soft-delete filter pattern: `and(eq(table.tenantId, tenantId), isNull(table.deletedAt))`
- Optimistic locking update pattern:

  ```typescript
  // Optimistic locking: only update if version matches, increment version
  const result = await db
    .update(table)
    .set({ ...data, version: sql`${table.version} + 1`, updatedAt: new Date() })
    .where(and(eq(table.id, id), eq(table.tenantId, tenantId), eq(table.version, expectedVersion)))
    .returning();

  if (result.length === 0) {
    throw new ConflictError(entityName, id, expectedVersion);
  }
  ```

- Consider using a generic type parameter for the table to make the base repository work across all entities:
  ```typescript
  export function createBaseRepository<TTable extends PgTable>(table: TTable, db: Database) { ... }
  ```
- Alternatively, use a class-based approach with generics for entity-specific overrides
- The pagination helper should use a separate count query for total, or use a window function if supported

## References

- **Functional Requirements:** Tenant isolation, optimistic locking, soft delete, paginated queries
- **Design Specification:** Repository pattern, data access layer abstractions
- **Project Setup:** packages/database repositories module

## Estimated Complexity

Large — This is the foundational abstraction for all data access. Requires careful generic type design to work with Drizzle's type system, comprehensive error handling for optimistic locking, and correct pagination implementation.
