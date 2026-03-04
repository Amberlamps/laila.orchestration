/**
 * @module base-repository
 *
 * Base repository abstraction providing foundational data access patterns
 * for all entity-specific repositories in the system.
 *
 * Every method enforces four invariants:
 *
 * 1. **Mandatory tenant scoping** — All queries require a `tenantId` parameter.
 *    The type system makes it impossible to issue a query without specifying
 *    which tenant the data belongs to. This is the primary data-isolation
 *    mechanism in a multi-tenant environment where `tenant_id = user.id`.
 *
 * 2. **Soft-delete filtering** — Read queries (`findById`, `findMany`)
 *    automatically exclude rows where `deleted_at IS NOT NULL`. A dedicated
 *    `softDelete` method sets the timestamp instead of physically removing
 *    the row. `hardDelete` is available for testing and cleanup scenarios.
 *
 * 3. **Optimistic locking** — Every `update` call requires an
 *    `expectedVersion` parameter. The UPDATE statement includes a
 *    `WHERE version = expectedVersion` clause and atomically increments the
 *    version on success. When no rows match (version mismatch), a
 *    `ConflictError` is thrown so callers can retry with the latest state.
 *
 * 4. **Pagination** — `findMany` returns a `{ data, pagination }` envelope
 *    containing page metadata (`total`, `totalPages`, `hasNext`, `hasPrev`)
 *    computed from a separate COUNT query and the requested page/limit.
 *
 * The repository is generic over any Drizzle PgTable that contains the
 * standard audit columns (`id`, `tenantId`, `version`, `createdAt`,
 * `updatedAt`, `deletedAt`).
 */

import {
  eq,
  and,
  isNull,
  sql,
  count,
  asc,
  desc,
  getTableName,
  type SQL,
  type InferSelectModel,
  type InferInsertModel,
  type Table,
  ColumnBaseConfig,
  ColumnDataType,
} from 'drizzle-orm';

import type { Database, PoolDatabase } from '../client';
import type { PaginationQuery, PaginationMeta } from '@laila/shared';
import type {
  PgColumn,
  PgDatabase,
  PgQueryResultHKT,
  PgTableWithColumns,
  TableConfig,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Drizzle database type alias
// ---------------------------------------------------------------------------

/**
 * A common base type that both `Database` (Neon HTTP) and `PoolDatabase`
 * (Neon WebSocket pool) are assignable to. Used internally to avoid
 * `as any` casts when calling Drizzle query builder methods on the
 * `Database | PoolDatabase` union.
 *
 * Both Neon driver types extend `PgDatabase` with different query-result
 * HKTs, but the query builder API (select, insert, update, delete,
 * transaction, execute) is identical across them.
 */
export type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown when an optimistic locking conflict is detected during an update.
 *
 * This occurs when the `version` column in the database does not match the
 * `expectedVersion` supplied by the caller, indicating that another process
 * has modified the record since it was last read.
 *
 * Callers should re-read the entity, merge changes, and retry the update
 * with the latest version number.
 */
export class ConflictError extends Error {
  public readonly entityName: string;
  public readonly entityId: string;
  public readonly expectedVersion: number;

  constructor(entityName: string, id: string, expectedVersion: number) {
    super(
      `Optimistic locking conflict: ${entityName} ${id} has been modified. ` +
        `Expected version ${String(expectedVersion)} but found a newer version. ` +
        `Retry with the latest version.`,
    );
    this.name = 'ConflictError';
    this.entityName = entityName;
    this.entityId = id;
    this.expectedVersion = expectedVersion;
  }
}

/**
 * Thrown when an entity cannot be found for the given tenant and ID.
 *
 * Entity-specific repositories use this to signal lookup failures so
 * that upstream layers (services, API handlers) can map it to an
 * appropriate HTTP 404 response.
 */
export class NotFoundError extends Error {
  public readonly entityName: string;
  public readonly entityId: string;

  constructor(entityName: string, id: string) {
    super(`${entityName} with id ${id} not found.`);
    this.name = 'NotFoundError';
    this.entityName = entityName;
    this.entityId = id;
  }
}

/**
 * Thrown when input data fails domain-level validation inside a repository.
 *
 * This is distinct from Zod schema validation (which happens at the API
 * boundary). Repository-level validation catches invariants that depend on
 * database state, such as duplicate-name checks or referential constraints
 * that cannot be expressed purely through schemas.
 */
export class ValidationError extends Error {
  public readonly field: string;
  public readonly reason: string;

  constructor(field: string, reason: string) {
    super(`Validation failed on field "${field}": ${reason}`);
    this.name = 'ValidationError';
    this.field = field;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Type constraints for tables compatible with the base repository
// ---------------------------------------------------------------------------

/**
 * Describes the minimum set of columns that a Drizzle table must have
 * in order to be used with the base repository.
 *
 * Every tenant-scoped table in the schema includes these columns:
 * - `id`        — UUID primary key
 * - `tenantId`  — UUID foreign key for tenant isolation
 * - `version`   — integer for optimistic locking
 * - `createdAt` — creation timestamp
 * - `updatedAt` — last-modification timestamp
 * - `deletedAt` — soft-delete timestamp (nullable)
 */
export type BaseTableColumns = {
  id: unknown;
  tenantId: unknown;
  version: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  deletedAt: unknown;
};

/**
 * A Drizzle PgTable that contains at minimum the standard audit columns
 * required by the base repository.
 */
export type BaseTable = PgTableWithColumns<TableConfig> & BaseTableColumns;

// ---------------------------------------------------------------------------
// Paginated response shape
// ---------------------------------------------------------------------------

/**
 * The return type for paginated queries.
 *
 * Matches the shared `paginatedResponseSchema` shape so that services
 * can return repository results directly without transformation.
 */
export interface PaginatedResult<TRecord> {
  /** Array of entity records for the current page */
  data: TRecord[];
  /** Pagination metadata for client-side page navigation */
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// FindMany options
// ---------------------------------------------------------------------------

/**
 * Options accepted by `findMany` for filtering, sorting, and pagination.
 *
 * Entity-specific repositories extend this with additional filter fields
 * (e.g., `status`, `projectId`).
 */
export interface FindManyOptions {
  /** Pagination parameters (page, limit, sortBy, sortOrder) */
  pagination?: PaginationQuery | undefined;
  /** Additional WHERE conditions to apply alongside tenant scoping */
  filters?: SQL | undefined;
}

// ---------------------------------------------------------------------------
// Database client type alias
// ---------------------------------------------------------------------------

/** Union of both supported Drizzle client types for flexibility */
type DatabaseClient = Database | PoolDatabase;

/**
 * Casts a `Database | PoolDatabase` union to the common `DrizzleDb` base
 * type. Both Neon driver variants extend `PgDatabase` and share the same
 * query builder API, so this cast is safe at runtime.
 */
export const asDrizzle = (client: DatabaseClient): DrizzleDb => client as unknown as DrizzleDb;

// ---------------------------------------------------------------------------
// Base repository factory
// ---------------------------------------------------------------------------

/**
 * Creates a base repository instance for the given Drizzle table.
 *
 * This factory function returns an object with typed CRUD methods that
 * enforce tenant scoping, soft-delete filtering, optimistic locking, and
 * pagination on every operation.
 *
 * Entity-specific repositories call this factory and extend or compose
 * the returned object with domain-specific query methods.
 *
 * @param table - A Drizzle PgTable definition with the standard audit columns
 * @param db    - A Drizzle database client (HTTP or pool mode)
 *
 * @example
 * ```typescript
 * import { createBaseRepository } from './base-repository';
 * import { projectsTable } from '../schema';
 * import type { Database } from '../client';
 *
 * const createProjectRepository = (db: Database) => {
 *   const base = createBaseRepository(projectsTable, db);
 *   return {
 *     ...base,
 *     // Add project-specific methods here
 *   };
 * };
 * ```
 */
export const createBaseRepository = <TTable extends BaseTable>(
  table: TTable,
  db: DatabaseClient,
) => {
  /** Human-readable entity name derived from the database table name */
  const entityName = getTableName(table);

  /** Drizzle client cast to the common PgDatabase base type */
  const typedDb = asDrizzle(db);

  // Type aliases scoped to the specific table
  type SelectModel = InferSelectModel<TTable>;
  type InsertModel = InferInsertModel<TTable>;

  // Cast table columns to PgColumn for drizzle query builder compatibility.
  // BaseTableColumns uses `unknown` to keep the constraint loose, but the
  // columns are always PgColumn instances at runtime.
  type Col = PgColumn<ColumnBaseConfig<ColumnDataType, string>, object, object>;
  const col = {
    id: table.id as Col,
    tenantId: table.tenantId as Col,
    version: table.version as Col,
    createdAt: table.createdAt as Col,
    updatedAt: table.updatedAt as Col,
    deletedAt: table.deletedAt as Col,
  };

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Builds the base WHERE clause for tenant-scoped, non-deleted records.
   *
   * This is the foundation of every read query. By centralizing the
   * tenant + soft-delete filter, we eliminate the risk of accidentally
   * querying across tenants or including deleted records.
   */
  const tenantScope = (tenantId: string): SQL => {
    // and() with 2+ conditions always returns a defined SQL — safe to assert
    const clause = and(eq(col.tenantId, tenantId), isNull(col.deletedAt));
    return clause as SQL;
  };

  /**
   * Computes pagination metadata from a total count and query parameters.
   *
   * Returns `total`, `totalPages`, `hasNext`, and `hasPrev` so clients
   * can implement page navigation without additional API calls.
   */
  const computePaginationMeta = (total: number, page: number, limit: number): PaginationMeta => {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  };

  /**
   * Resolves a Drizzle column reference from a camelCase field name.
   *
   * Used by `findMany` to convert the `sortBy` string (e.g. `'createdAt'`)
   * into the corresponding column object for ORDER BY clauses.
   * Falls back to `createdAt` if the field name does not match any column.
   */
  const resolveColumn = (fieldName: string): Col => {
    const columns = table as unknown as Record<string, unknown>;
    return (columns[fieldName] ?? col.createdAt) as Col;
  };

  // -------------------------------------------------------------------------
  // Public query methods
  // -------------------------------------------------------------------------

  /**
   * Finds a single entity by its primary key within a tenant scope.
   *
   * Automatically excludes soft-deleted records. Returns `null` if no
   * matching record exists (rather than throwing), allowing callers to
   * distinguish "not found" from "error".
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param id       - The entity UUID to look up
   * @returns The entity record, or `null` if not found or soft-deleted
   */
  const findById = async (tenantId: string, id: string): Promise<SelectModel | null> => {
    const results: SelectModel[] = (await typedDb
      .select()
      .from(table as Table)
      .where(and(eq(col.id, id), tenantScope(tenantId)))
      .limit(1)) as SelectModel[];

    return results[0] ?? null;
  };

  /**
   * Finds multiple entities with tenant scoping, pagination, and optional
   * additional filters.
   *
   * The method executes two queries in parallel:
   * 1. A COUNT query to determine the total number of matching records
   * 2. A SELECT query with ORDER BY, LIMIT, and OFFSET for the current page
   *
   * Results are returned in the standard `{ data, pagination }` envelope
   * that matches the shared `paginatedResponseSchema`.
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param options  - Pagination parameters and optional additional filters
   * @returns A paginated result with data array and pagination metadata
   */
  const findMany = async (
    tenantId: string,
    options: FindManyOptions = {},
  ): Promise<PaginatedResult<SelectModel>> => {
    const {
      pagination: paginationParams = {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      },
      filters,
    } = options;

    const { page, limit, sortBy, sortOrder } = paginationParams;
    const offset = (page - 1) * limit;

    // Combine mandatory tenant scope with any additional caller-provided filters
    const whereClause = filters
      ? (and(tenantScope(tenantId), filters) as SQL)
      : tenantScope(tenantId);

    // Resolve the sort column and direction
    const sortColumn = resolveColumn(sortBy);
    const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Execute count and data queries in parallel for efficiency
    const [countResult, data] = await Promise.all([
      typedDb
        .select({ total: count() })
        .from(table as Table)
        .where(whereClause) as Promise<{ total: number }[]>,
      typedDb
        .select()
        .from(table as Table)
        .where(whereClause)
        .orderBy(orderDirection)
        .limit(limit)
        .offset(offset) as unknown as Promise<SelectModel[]>,
    ]);

    const total = countResult[0]?.total ?? 0;
    const pagination = computePaginationMeta(total, page, limit);

    return { data, pagination };
  };

  /**
   * Inserts a new entity record with the tenant_id automatically set.
   *
   * The `tenantId` is injected into the insert data to guarantee that
   * every record is associated with the correct tenant, regardless of
   * what the caller passes in the data object.
   *
   * @param tenantId - The tenant UUID to associate with the new record
   * @param data     - The entity data to insert (without `tenantId`)
   * @returns The newly created entity record
   */
  const create = async (
    tenantId: string,
    data: Omit<
      InsertModel,
      'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'
    >,
  ): Promise<SelectModel> => {
    const results: SelectModel[] = (await typedDb
      .insert(table as Table)
      .values({
        ...data,
        tenantId,
      } as InsertModel)
      .returning()) as SelectModel[];

    // INSERT always returns a row via .returning()
    return results[0] as SelectModel;
  };

  /**
   * Updates an existing entity record with optimistic locking.
   *
   * The UPDATE statement includes a `WHERE version = expectedVersion` clause
   * that ensures no other process has modified the record since it was last
   * read. On success, the version is atomically incremented by 1 and
   * `updatedAt` is set to the current timestamp.
   *
   * If no rows are affected (version mismatch or record not found), a
   * `ConflictError` is thrown. Callers should catch this error, re-read the
   * entity, merge their changes, and retry with the new version.
   *
   * @param tenantId        - The tenant UUID to scope the update to
   * @param id              - The entity UUID to update
   * @param data            - The partial entity data to set
   * @param expectedVersion - The version number the caller expects the record to have
   * @returns The updated entity record with the new version number
   * @throws {ConflictError} If the record's current version differs from `expectedVersion`
   */
  const update = async (
    tenantId: string,
    id: string,
    data: Partial<
      Omit<InsertModel, 'id' | 'tenantId' | 'version' | 'createdAt' | 'updatedAt' | 'deletedAt'>
    >,
    expectedVersion: number,
  ): Promise<SelectModel> => {
    // Optimistic locking: only update if version matches, then increment version
    const results: SelectModel[] = (await typedDb
      .update(table)
      .set({
        ...data,
        version: sql`${col.version} + 1`,
        updatedAt: new Date(),
      } as InsertModel)
      .where(
        and(
          eq(col.id, id),
          eq(col.tenantId, tenantId),
          eq(col.version, expectedVersion),
          isNull(col.deletedAt),
        ),
      )
      .returning()) as SelectModel[];

    if (results.length === 0) {
      throw new ConflictError(entityName, id, expectedVersion);
    }

    // Length check above guarantees results[0] exists
    return results[0] as SelectModel;
  };

  /**
   * Soft-deletes an entity by setting its `deleted_at` timestamp.
   *
   * The record remains in the database but is excluded from all standard
   * read queries (`findById`, `findMany`) because they filter on
   * `deleted_at IS NULL`. This approach preserves audit history and allows
   * recovery if needed.
   *
   * The version is also incremented and `updatedAt` is refreshed to
   * maintain a consistent modification trail.
   *
   * @param tenantId - The tenant UUID to scope the operation to
   * @param id       - The entity UUID to soft-delete
   * @returns The soft-deleted entity record, or `null` if not found
   */
  const softDelete = async (tenantId: string, id: string): Promise<SelectModel | null> => {
    const results: SelectModel[] = (await typedDb
      .update(table)
      .set({
        deletedAt: new Date(),
        version: sql`${col.version} + 1`,
        updatedAt: new Date(),
      } as InsertModel)
      .where(and(eq(col.id, id), eq(col.tenantId, tenantId), isNull(col.deletedAt)))
      .returning()) as SelectModel[];

    return results[0] ?? null;
  };

  /**
   * Physically removes a record from the database.
   *
   * **Use with caution.** This is intended for:
   * - Test cleanup
   * - GDPR "right to erasure" compliance
   * - Removing data that should never have been created
   *
   * In production, prefer `softDelete` to preserve audit history.
   * The tenant scope is still enforced to prevent accidental cross-tenant
   * deletion.
   *
   * @param tenantId - The tenant UUID to scope the deletion to
   * @param id       - The entity UUID to permanently remove
   * @returns The deleted entity record, or `null` if not found
   */
  const hardDelete = async (tenantId: string, id: string): Promise<SelectModel | null> => {
    const results: SelectModel[] = (await typedDb
      .delete(table)
      .where(and(eq(col.id, id), eq(col.tenantId, tenantId)))
      .returning()) as SelectModel[];

    return results[0] ?? null;
  };

  return {
    /** The Drizzle table definition this repository operates on */
    table,
    /** Human-readable entity name (derived from the SQL table name) */
    entityName,
    /** The database client instance */
    db,
    /** Builds the standard tenant + soft-delete WHERE clause */
    tenantScope,
    /** Computes pagination metadata from total count and page parameters */
    computePaginationMeta,
    findById,
    findMany,
    create,
    update,
    softDelete,
    hardDelete,
  };
};

/**
 * Inferred return type of `createBaseRepository` for use in entity-specific
 * repository type declarations.
 */
export type BaseRepository<TTable extends BaseTable> = ReturnType<
  typeof createBaseRepository<TTable>
>;
