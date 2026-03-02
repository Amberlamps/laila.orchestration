/**
 * @module persona-repository
 *
 * Repository for persona CRUD operations with tenant-scoped queries.
 *
 * Personas are reference data describing agent roles (e.g., "Backend Developer",
 * "QA Engineer"). They are simpler than transactional entities:
 *
 * - **No soft-delete** — personas use physical deletion.
 * - **No optimistic locking** — no `version` column exists on the table.
 * - **Deletion guard** — a persona cannot be deleted while active (non-terminal)
 *   tasks reference it. The repository checks for active tasks before deleting.
 * - **Title uniqueness** — enforced by a composite unique index
 *   `(tenant_id, title)`. The repository catches PostgreSQL unique-constraint
 *   violations and re-throws them as a user-friendly `ValidationError`.
 *
 * Because the personas table lacks `version` and `deletedAt` columns, this
 * repository does NOT extend the base repository (which requires those columns).
 * Instead it implements its own tenant-scoped CRUD using the same patterns.
 */

import {
  eq,
  and,
  isNull,
  sql,
  count,
  asc,
  desc,
  notInArray,
  type InferSelectModel,
  type InferInsertModel,
} from 'drizzle-orm';

import { personasTable } from '../schema/personas';
import { tasksTable } from '../schema/tasks';

import { asDrizzle, ValidationError } from './base-repository';

import type { Database, PoolDatabase } from '../client';
import type { PaginatedResult, FindManyOptions } from './base-repository';
import type { PaginationMeta } from '@laila/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape returned by SELECT on the personas table. */
export type Persona = InferSelectModel<typeof personasTable>;

/** Insert shape for the personas table. */
type PersonaInsert = InferInsertModel<typeof personasTable>;

/** Fields accepted when creating a new persona. */
export type CreatePersonaData = Pick<PersonaInsert, 'title' | 'description'>;

/** Fields accepted when updating an existing persona. */
export type UpdatePersonaData = Partial<CreatePersonaData>;

/** Persona enriched with task-count breakdown. */
export interface PersonaWithTaskCounts extends Persona {
  taskCounts: {
    active: number;
    total: number;
  };
}

/** Database client union type. */
type DatabaseClient = Database | PoolDatabase;

// ---------------------------------------------------------------------------
// Terminal task statuses (tasks in these states do not block deletion)
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ['done', 'failed', 'skipped'] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Detects whether a database error is a PostgreSQL unique-constraint violation
 * (error code 23505) on the persona title index.
 */
const isUniqueViolation = (error: unknown): boolean => {
  if (error instanceof Error && 'code' in error) {
    return (error as Error & { code: string }).code === '23505';
  }
  return false;
};

/**
 * Computes pagination metadata from a total count and query parameters.
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
 * Resolves a column reference from a camelCase field name on the personas table.
 * Falls back to `createdAt` if the field does not exist.
 */
const resolveColumn = (fieldName: string): unknown => {
  const columns = personasTable as Record<string, unknown>;
  return columns[fieldName] ?? personasTable.createdAt;
};

// ---------------------------------------------------------------------------
// Repository factory
// ---------------------------------------------------------------------------

/**
 * Creates a persona repository bound to the given database client.
 *
 * All methods require a `tenantId` parameter to enforce tenant isolation.
 * The returned object provides:
 *
 * - `create`             — insert with title-uniqueness guard
 * - `update`             — partial field update
 * - `findById`           — single lookup (or null)
 * - `findByTenant`       — paginated listing
 * - `delete`             — physical delete with active-task safety check
 * - `findWithTaskCounts` — persona + aggregated task counts
 *
 * @param db - A Drizzle database client (HTTP or pool mode)
 */
export const createPersonaRepository = (db: DatabaseClient) => {
  const typedDb = asDrizzle(db);

  // -----------------------------------------------------------------------
  // Tenant scope helper
  // -----------------------------------------------------------------------

  const tenantScope = (tenantId: string) => eq(personasTable.tenantId, tenantId);

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  /**
   * Creates a new persona for the given tenant.
   *
   * The `(tenant_id, title)` unique index is enforced at the database level.
   * If a duplicate title is detected, the PostgreSQL unique-constraint error
   * is caught and re-thrown as a `ValidationError` with a clear message.
   *
   * @param tenantId - Tenant UUID
   * @param data     - Title and description for the new persona
   * @returns The newly created persona record
   * @throws {ValidationError} If a persona with the same title already exists
   */
  const create = async (tenantId: string, data: CreatePersonaData): Promise<Persona> => {
    try {
      const results = await typedDb
        .insert(personasTable)
        .values({ ...data, tenantId })
        .returning();

      return results[0] as Persona;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ValidationError(
          'title',
          `A persona with the title "${data.title}" already exists for this tenant.`,
        );
      }
      throw error;
    }
  };

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  /**
   * Updates an existing persona's fields (title and/or description).
   *
   * Only the provided fields are overwritten; omitted fields remain unchanged.
   * The `updatedAt` timestamp is refreshed automatically.
   *
   * Title uniqueness is enforced at the database level. If the new title
   * collides with an existing persona in the same tenant, a `ValidationError`
   * is thrown.
   *
   * @param tenantId - Tenant UUID
   * @param id       - Persona UUID to update
   * @param data     - Partial fields to set
   * @returns The updated persona record, or null if not found
   * @throws {ValidationError} If the new title duplicates an existing persona
   */
  const update = async (
    tenantId: string,
    id: string,
    data: UpdatePersonaData,
  ): Promise<Persona | null> => {
    try {
      const results = await typedDb
        .update(personasTable)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(personasTable.id, id), tenantScope(tenantId)))
        .returning();

      return (results[0] as Persona | undefined) ?? null;
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ValidationError(
          'title',
          `A persona with the title "${data.title ?? ''}" already exists for this tenant.`,
        );
      }
      throw error;
    }
  };

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------

  /**
   * Finds a single persona by ID within the given tenant scope.
   *
   * @param tenantId - Tenant UUID
   * @param id       - Persona UUID
   * @returns The persona record, or null if not found
   */
  const findById = async (tenantId: string, id: string): Promise<Persona | null> => {
    const results = await typedDb
      .select()
      .from(personasTable)
      .where(and(eq(personasTable.id, id), tenantScope(tenantId)))
      .limit(1);

    return (results[0] as Persona | undefined) ?? null;
  };

  // -----------------------------------------------------------------------
  // findByTenant
  // -----------------------------------------------------------------------

  /**
   * Returns a paginated list of personas for the given tenant.
   *
   * Supports sorting by any column and optional additional WHERE filters
   * through the standard `FindManyOptions` interface.
   *
   * @param tenantId - Tenant UUID
   * @param options  - Pagination parameters and optional filters
   * @returns Paginated result with data array and pagination metadata
   */
  const findByTenant = async (
    tenantId: string,
    options: FindManyOptions = {},
  ): Promise<PaginatedResult<Persona>> => {
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

    const whereClause = filters ? and(tenantScope(tenantId), filters) : tenantScope(tenantId);

    const sortColumn = resolveColumn(sortBy) as Parameters<typeof asc>[0];
    const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const [countResult, data] = await Promise.all([
      typedDb.select({ total: count() }).from(personasTable).where(whereClause),
      typedDb
        .select()
        .from(personasTable)
        .where(whereClause)
        .orderBy(orderDirection)
        .limit(limit)
        .offset(offset),
    ]);

    const total = countResult[0]?.total ?? 0;
    const pagination = computePaginationMeta(total, page, limit);

    return { data: data as Persona[], pagination };
  };

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  /**
   * Physically deletes a persona after verifying no active tasks reference it.
   *
   * Active tasks are those whose `workStatus` is NOT in a terminal state
   * (`done`, `failed`, `skipped`) and that have not been soft-deleted.
   *
   * If active tasks exist, a `ValidationError` is thrown with a descriptive
   * message including the count, so callers can inform the user.
   *
   * @param tenantId - Tenant UUID
   * @param id       - Persona UUID to delete
   * @throws {ValidationError} If active tasks still reference this persona
   */
  const deletePersona = async (tenantId: string, id: string): Promise<void> => {
    // Check for active (non-terminal, non-deleted) tasks referencing this persona
    const activeTaskCount = await typedDb
      .select({ count: sql<number>`count(*)` })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          eq(tasksTable.personaId, id),
          isNull(tasksTable.deletedAt),
          notInArray(tasksTable.workStatus, [...TERMINAL_STATUSES]),
        ),
      );

    const activeCount = activeTaskCount[0]?.count ?? 0;
    if (activeCount > 0) {
      throw new ValidationError(
        'personaId',
        `Cannot delete persona: ${String(activeCount)} active task(s) reference it. ` +
          `Complete or reassign the tasks before deleting this persona.`,
      );
    }

    // Safe to delete — no active references
    await typedDb
      .delete(personasTable)
      .where(and(eq(personasTable.id, id), eq(personasTable.tenantId, tenantId)));
  };

  // -----------------------------------------------------------------------
  // findWithTaskCounts
  // -----------------------------------------------------------------------

  /**
   * Returns a persona enriched with aggregated task counts (active vs total).
   *
   * Uses a LEFT JOIN with conditional aggregation so that personas with zero
   * tasks still return counts of 0. Only non-deleted tasks are counted.
   *
   * @param tenantId - Tenant UUID
   * @param id       - Persona UUID
   * @returns The persona with task counts, or null if not found
   */
  const findWithTaskCounts = async (
    tenantId: string,
    id: string,
  ): Promise<PersonaWithTaskCounts | null> => {
    const results = await typedDb
      .select({
        persona: personasTable,
        activeCount: sql<number>`count(*) filter (where ${tasksTable.workStatus} not in ('done', 'failed', 'skipped') and ${tasksTable.deletedAt} is null)`,
        totalCount: sql<number>`count(${tasksTable.id})`,
      })
      .from(personasTable)
      .leftJoin(
        tasksTable,
        and(eq(tasksTable.personaId, personasTable.id), isNull(tasksTable.deletedAt)),
      )
      .where(and(eq(personasTable.id, id), eq(personasTable.tenantId, tenantId)))
      .groupBy(personasTable.id);

    if (results.length === 0) {
      return null;
    }

    const row = results[0] as {
      persona: Persona;
      activeCount: number;
      totalCount: number;
    };

    return {
      ...row.persona,
      taskCounts: {
        active: row.activeCount,
        total: row.totalCount,
      },
    };
  };

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    create,
    update,
    findById,
    findByTenant,
    delete: deletePersona,
    findWithTaskCounts,
  };
};

/**
 * Inferred return type of `createPersonaRepository` for use in
 * service-layer type declarations and dependency injection.
 */
export type PersonaRepository = ReturnType<typeof createPersonaRepository>;
