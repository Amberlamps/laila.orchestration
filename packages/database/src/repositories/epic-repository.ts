/**
 * @module epic-repository
 *
 * Repository for the Epic entity providing CRUD operations with tenant scoping,
 * optimistic locking, derived status computation, bulk reordering, and cascade
 * soft-delete.
 *
 * Epics sit at the second level of the work hierarchy (project > epic > story > task).
 * Their `work_status` is **derived** from the aggregate status of child user stories
 * rather than being set directly. The `computeDerivedStatus` method implements this
 * derivation algorithm.
 *
 * This module follows the factory composition pattern established by
 * `createBaseRepository` — the base provides standard CRUD while this module
 * adds epic-specific domain operations.
 */

import { eq, and, isNull, sql, count, asc, type SQL, type InferSelectModel } from 'drizzle-orm';

import { epicsTable } from '../schema/epics';
import { tasksTable } from '../schema/tasks';
import { userStoriesTable } from '../schema/user-stories';

import {
  createBaseRepository,
  asDrizzle,
  ConflictError,
  NotFoundError,
  ValidationError,
  type DrizzleDb,
  type PaginatedResult,
} from './base-repository';

import type { Database, PoolDatabase } from '../client';
import type { PaginationQuery, WorkStatus } from '@laila/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The full epic record as returned from the database */
export type EpicRecord = InferSelectModel<typeof epicsTable>;

/** Options for querying epics within a project */
export interface FindByProjectOptions {
  /** Pagination parameters (page, limit, sortBy, sortOrder) */
  pagination?: PaginationQuery;
  /** Optional work status filter */
  status?: string;
}

/** Aggregated story counts by status for a single epic */
export interface StoryCounts {
  [status: string]: number;
}

/** An epic record augmented with aggregated story count data */
export interface EpicWithStoryCounts extends EpicRecord {
  storyCounts: StoryCounts;
}

/** Database client type alias (HTTP or pool mode) */
type DatabaseClient = Database | PoolDatabase;

// ---------------------------------------------------------------------------
// Status derivation logic
// ---------------------------------------------------------------------------

/**
 * Derives an epic's work status from the distribution of its child stories'
 * statuses.
 *
 * Derivation rules (evaluated in priority order):
 *   1. No stories at all          -> 'pending' (nothing to derive from)
 *   2. All stories are 'pending'  -> 'pending'
 *   3. All stories are 'done'     -> 'done'
 *   4. All stories are 'blocked'  -> 'blocked'
 *   5. Any story is 'in_progress' -> 'in_progress'
 *   6. Mix of done/pending/ready  -> 'in_progress' (work has started)
 *
 * @param statusCounts - Array of { status, count } aggregates from the DB
 * @returns The derived work status string
 */
const deriveEpicStatus = (statusCounts: Array<{ status: string; count: number }>): WorkStatus => {
  if (statusCounts.length === 0) {
    return 'pending';
  }

  const statusMap = new Map<string, number>();
  let totalStories = 0;

  for (const { status, count: cnt } of statusCounts) {
    statusMap.set(status, cnt);
    totalStories += cnt;
  }

  const pendingCount = statusMap.get('pending') ?? 0;
  const doneCount = statusMap.get('done') ?? 0;
  const blockedCount = statusMap.get('blocked') ?? 0;
  const inProgressCount = statusMap.get('in_progress') ?? 0;

  // All stories share a single status
  if (pendingCount === totalStories) return 'pending';
  if (doneCount === totalStories) return 'done';
  if (blockedCount === totalStories) return 'blocked';

  // Any story explicitly in progress
  if (inProgressCount > 0) return 'in_progress';

  // Mix of statuses (e.g., done + pending, ready + pending) -> in_progress
  return 'in_progress';
};

// ---------------------------------------------------------------------------
// Epic repository factory
// ---------------------------------------------------------------------------

/**
 * Creates an epic repository instance with domain-specific operations.
 *
 * Composes the base repository (standard CRUD with tenant scoping, optimistic
 * locking, soft-delete, and pagination) with epic-specific methods for:
 *
 * - Creating epics with auto-assigned sort order
 * - Listing epics by project with sort_order ordering
 * - Bulk reordering epics within a project (transactional)
 * - Computing derived work status from child story statuses
 * - Cascade soft-delete to child stories and their tasks
 * - Fetching an epic with aggregated story counts by status
 *
 * @param db - A Drizzle database client (HTTP or pool mode)
 * @returns An epic repository with base CRUD and domain-specific methods
 *
 * @example
 * ```typescript
 * import { createEpicRepository } from './epic-repository';
 * import type { PoolDatabase } from '../client';
 *
 * const epicRepo = createEpicRepository(poolDb);
 * const epic = await epicRepo.create(tenantId, projectId, { name: 'MVP' });
 * ```
 */
export const createEpicRepository = (db: DatabaseClient) => {
  const base = createBaseRepository(epicsTable, db);
  const typedDb = asDrizzle(db);

  // -------------------------------------------------------------------------
  // Create with auto-assigned sort order
  // -------------------------------------------------------------------------

  /**
   * Creates a new epic within a project.
   *
   * The epic is initialized with `work_status = 'pending'` and its
   * `sort_order` is set to `MAX(sort_order) + 1` among existing epics
   * in the same project, placing it at the end of the list.
   *
   * @param tenantId  - The tenant UUID to scope the operation to
   * @param projectId - The project UUID the epic belongs to
   * @param data      - Epic creation data (name, optional description)
   * @returns The newly created epic record
   */
  const create = async (
    tenantId: string,
    projectId: string,
    data: { name: string; description?: string | null },
  ): Promise<EpicRecord> => {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('name', 'Epic name must not be empty');
    }

    // Compute the next sort_order for this project
    const maxResult = await typedDb
      .select({
        maxSort: sql<number>`coalesce(max(${epicsTable.sortOrder}), -1)`,
      })
      .from(epicsTable)
      .where(
        and(
          eq(epicsTable.tenantId, tenantId),
          eq(epicsTable.projectId, projectId),
          isNull(epicsTable.deletedAt),
        ),
      );

    const nextSortOrder = (maxResult[0]?.maxSort ?? -1) + 1;

    const results = await typedDb
      .insert(epicsTable)
      .values({
        tenantId,
        projectId,
        name: data.name.trim(),
        description: data.description ?? null,
        workStatus: 'pending',
        sortOrder: nextSortOrder,
      })
      .returning();

    return results[0] as EpicRecord;
  };

  // -------------------------------------------------------------------------
  // Find by project with pagination
  // -------------------------------------------------------------------------

  /**
   * Returns paginated epics for a project, ordered by `sort_order` ascending.
   *
   * Enforces tenant scoping and excludes soft-deleted records. Optionally
   * filters by work status.
   *
   * @param tenantId  - The tenant UUID to scope the query to
   * @param projectId - The project UUID to list epics for
   * @param options   - Pagination and optional status filter
   * @returns Paginated result with epic records and navigation metadata
   */
  const findByProject = async (
    tenantId: string,
    projectId: string,
    options: FindByProjectOptions = {},
  ): Promise<PaginatedResult<EpicRecord>> => {
    const {
      pagination: paginationParams = {
        page: 1,
        limit: 20,
        sortBy: 'sortOrder',
        sortOrder: 'asc' as const,
      },
      status,
    } = options;

    const { page, limit } = paginationParams;
    const offset = (page - 1) * limit;

    // Build WHERE clause: tenant + project + not deleted + optional status
    let whereClause = and(base.tenantScope(tenantId), eq(epicsTable.projectId, projectId)) as SQL;

    if (status) {
      whereClause = and(whereClause, eq(epicsTable.workStatus, status)) as SQL;
    }

    // Execute count and data queries in parallel
    const [countResult, data] = await Promise.all([
      typedDb.select({ total: count() }).from(epicsTable).where(whereClause),
      typedDb
        .select()
        .from(epicsTable)
        .where(whereClause)
        .orderBy(asc(epicsTable.sortOrder))
        .limit(limit)
        .offset(offset),
    ]);

    const total = countResult[0]?.total ?? 0;
    const pagination = base.computePaginationMeta(total, page, limit);

    return { data: data as EpicRecord[], pagination };
  };

  // -------------------------------------------------------------------------
  // Update with optimistic locking
  // -------------------------------------------------------------------------

  /**
   * Updates epic fields with optimistic locking.
   *
   * Delegates to the base repository's `update` method which enforces
   * the `WHERE version = expectedVersion` clause and increments the
   * version atomically.
   *
   * @param tenantId        - The tenant UUID to scope the update to
   * @param id              - The epic UUID to update
   * @param data            - Partial epic data to set (name, description)
   * @param expectedVersion - The version number the caller expects
   * @returns The updated epic record
   * @throws {ConflictError} If the version does not match
   */
  const update = async (
    tenantId: string,
    id: string,
    data: Partial<{ name: string; description: string | null }>,
    expectedVersion: number,
  ): Promise<EpicRecord> => {
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new ValidationError('name', 'Epic name must not be empty');
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;

    return base.update(tenantId, id, updateData, expectedVersion);
  };

  // -------------------------------------------------------------------------
  // Reorder epics within a project (transactional)
  // -------------------------------------------------------------------------

  /**
   * Updates `sort_order` for multiple epics in a single transaction.
   *
   * The array index determines the new sort order: `epicIds[0]` gets
   * `sort_order = 0`, `epicIds[1]` gets `sort_order = 1`, etc.
   *
   * All updates are wrapped in a transaction for atomicity. Each epic's
   * `updated_at` timestamp is refreshed.
   *
   * @param tenantId - The tenant UUID to scope the operation to
   * @param epicIds  - Ordered array of epic UUIDs defining the new sort order
   * @throws {ValidationError} If the epicIds array is empty
   */
  const reorder = async (tenantId: string, epicIds: string[]): Promise<void> => {
    if (epicIds.length === 0) {
      throw new ValidationError('epicIds', 'Epic IDs array must not be empty');
    }

    await typedDb.transaction(async (tx: DrizzleDb) => {
      for (let i = 0; i < epicIds.length; i++) {
        const epicId = epicIds[i] as string;

        // Read the current epic to capture its version for optimistic locking
        const existing = await tx
          .select()
          .from(epicsTable)
          .where(
            and(
              eq(epicsTable.id, epicId),
              eq(epicsTable.tenantId, tenantId),
              isNull(epicsTable.deletedAt),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          throw new NotFoundError(base.entityName, epicId);
        }

        const currentVersion = existing[0].version;

        // Update with optimistic locking: version must match what we just read
        const results = await tx
          .update(epicsTable)
          .set({
            sortOrder: i,
            version: sql`${epicsTable.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(epicsTable.id, epicId),
              eq(epicsTable.tenantId, tenantId),
              eq(epicsTable.version, currentVersion),
              isNull(epicsTable.deletedAt),
            ),
          )
          .returning();

        if (results.length === 0) {
          throw new ConflictError(base.entityName, epicId, currentVersion);
        }
      }
    });
  };

  // -------------------------------------------------------------------------
  // Compute derived status from child stories
  // -------------------------------------------------------------------------

  /**
   * Calculates the epic's work status from the aggregate of its child
   * story statuses and persists the result.
   *
   * Derivation rules:
   * - No stories                    -> 'pending'
   * - All stories pending           -> 'pending'
   * - All stories done              -> 'done'
   * - All remaining stories blocked -> 'blocked'
   * - Any story in_progress         -> 'in_progress'
   * - Mix of done and pending/ready -> 'in_progress'
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param epicId   - The epic UUID to compute the derived status for
   * @returns The computed work status string
   * @throws {NotFoundError} If the epic does not exist for the tenant
   */
  const computeDerivedStatus = async (tenantId: string, epicId: string): Promise<WorkStatus> => {
    // Verify the epic exists
    const epic = await base.findById(tenantId, epicId);
    if (!epic) {
      throw new NotFoundError(base.entityName, epicId);
    }

    // Query aggregate story statuses for this epic
    const statusCounts = await typedDb
      .select({
        status: userStoriesTable.workStatus,
        count: sql<number>`count(*)`,
      })
      .from(userStoriesTable)
      .where(
        and(
          eq(userStoriesTable.epicId, epicId),
          eq(userStoriesTable.tenantId, tenantId),
          isNull(userStoriesTable.deletedAt),
        ),
      )
      .groupBy(userStoriesTable.workStatus);

    const derivedStatus = deriveEpicStatus(statusCounts);

    // Persist the derived status on the epic with optimistic locking
    const currentVersion = epic.version as number;
    const updateResults = await typedDb
      .update(epicsTable)
      .set({
        workStatus: derivedStatus,
        version: sql`${epicsTable.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(epicsTable.id, epicId),
          eq(epicsTable.tenantId, tenantId),
          eq(epicsTable.version, currentVersion),
          isNull(epicsTable.deletedAt),
        ),
      )
      .returning();

    if (updateResults.length === 0) {
      throw new ConflictError(base.entityName, epicId, currentVersion);
    }

    return derivedStatus;
  };

  // -------------------------------------------------------------------------
  // Cascade soft-delete (epic -> stories -> tasks)
  // -------------------------------------------------------------------------

  /**
   * Soft-deletes an epic and cascades to all child user stories and their
   * tasks within a single transaction.
   *
   * The cascade order is:
   * 1. Soft-delete all tasks belonging to the epic's stories
   * 2. Soft-delete all user stories belonging to the epic
   * 3. Soft-delete the epic itself
   *
   * Each record's `deleted_at` and `updated_at` timestamps are set, and
   * the `version` is incremented for audit trail consistency.
   *
   * @param tenantId - The tenant UUID to scope the operation to
   * @param id       - The epic UUID to soft-delete
   * @returns The soft-deleted epic record, or null if not found
   */
  const softDelete = async (tenantId: string, id: string): Promise<EpicRecord | null> => {
    // Read the current epic to obtain its version for optimistic locking
    const existing = await base.findById(tenantId, id);
    if (!existing) {
      return null;
    }

    const now = new Date();

    const result = await typedDb.transaction(async (tx: DrizzleDb) => {
      // 1. Find all non-deleted stories belonging to this epic
      const stories = await tx
        .select({ id: userStoriesTable.id })
        .from(userStoriesTable)
        .where(
          and(
            eq(userStoriesTable.epicId, id),
            eq(userStoriesTable.tenantId, tenantId),
            isNull(userStoriesTable.deletedAt),
          ),
        );

      // 2. Soft-delete tasks belonging to those stories
      if (stories.length > 0) {
        const storyIds = stories.map((s: { id: string }) => s.id);

        for (const storyId of storyIds) {
          await tx
            .update(tasksTable)
            .set({
              deletedAt: now,
              updatedAt: now,
              version: sql`${tasksTable.version} + 1`,
            })
            .where(
              and(
                eq(tasksTable.userStoryId, storyId),
                eq(tasksTable.tenantId, tenantId),
                isNull(tasksTable.deletedAt),
              ),
            );
        }
      }

      // 3. Soft-delete all stories belonging to this epic
      await tx
        .update(userStoriesTable)
        .set({
          deletedAt: now,
          updatedAt: now,
          version: sql`${userStoriesTable.version} + 1`,
        })
        .where(
          and(
            eq(userStoriesTable.epicId, id),
            eq(userStoriesTable.tenantId, tenantId),
            isNull(userStoriesTable.deletedAt),
          ),
        );

      // 4. Soft-delete the epic itself with optimistic locking
      const existingVersion = existing.version as number;
      const deletedEpics = await tx
        .update(epicsTable)
        .set({
          deletedAt: now,
          updatedAt: now,
          version: sql`${epicsTable.version} + 1`,
        })
        .where(
          and(
            eq(epicsTable.id, id),
            eq(epicsTable.tenantId, tenantId),
            eq(epicsTable.version, existingVersion),
            isNull(epicsTable.deletedAt),
          ),
        )
        .returning();

      if (deletedEpics.length === 0) {
        throw new ConflictError(base.entityName, id, existingVersion);
      }

      return deletedEpics[0] as EpicRecord;
    });

    return result;
  };

  // -------------------------------------------------------------------------
  // Find epic with aggregated story counts by status
  // -------------------------------------------------------------------------

  /**
   * Returns an epic augmented with aggregated story counts grouped by
   * work status.
   *
   * The `storyCounts` field is an object where keys are work status strings
   * and values are the number of non-deleted stories with that status.
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param epicId   - The epic UUID to retrieve
   * @returns The epic record with story counts, or null if not found
   */
  const findWithStoryCounts = async (
    tenantId: string,
    epicId: string,
  ): Promise<EpicWithStoryCounts | null> => {
    const epic = await base.findById(tenantId, epicId);
    if (!epic) {
      return null;
    }

    const statusCounts = await typedDb
      .select({
        status: userStoriesTable.workStatus,
        count: sql<number>`count(*)`,
      })
      .from(userStoriesTable)
      .where(
        and(
          eq(userStoriesTable.epicId, epicId),
          eq(userStoriesTable.tenantId, tenantId),
          isNull(userStoriesTable.deletedAt),
        ),
      )
      .groupBy(userStoriesTable.workStatus);

    const storyCounts: StoryCounts = {};
    for (const row of statusCounts) {
      storyCounts[row.status] = row.count;
    }

    return { ...epic, storyCounts } as EpicWithStoryCounts;
  };

  // -------------------------------------------------------------------------
  // Batch status reconciliation
  // -------------------------------------------------------------------------

  /**
   * Recalculates derived work status for all epics in a project.
   *
   * Useful for batch reconciliation (e.g., invoked by the dag-reconciler
   * Lambda) to ensure all epic statuses are consistent with their child
   * story statuses.
   *
   * @param tenantId  - The tenant UUID to scope the operation to
   * @param projectId - The project UUID whose epics should be reconciled
   * @returns Array of { epicId, status } with the updated statuses
   */
  const recalculateAllStatuses = async (
    tenantId: string,
    projectId: string,
  ): Promise<Array<{ epicId: string; status: WorkStatus }>> => {
    // Fetch all non-deleted epics in this project
    const epics = await typedDb
      .select({ id: epicsTable.id })
      .from(epicsTable)
      .where(
        and(
          eq(epicsTable.tenantId, tenantId),
          eq(epicsTable.projectId, projectId),
          isNull(epicsTable.deletedAt),
        ),
      )
      .orderBy(asc(epicsTable.sortOrder));

    const results: Array<{ epicId: string; status: WorkStatus }> = [];

    for (const epic of epics) {
      const status = await computeDerivedStatus(tenantId, epic.id);
      results.push({ epicId: epic.id, status });
    }

    return results;
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    // Base repository methods (findById, findMany, hardDelete)
    findById: base.findById,
    findMany: base.findMany,
    hardDelete: base.hardDelete,

    // Expose internals for advanced composition
    table: base.table,
    entityName: base.entityName,
    db: base.db,
    tenantScope: base.tenantScope,
    computePaginationMeta: base.computePaginationMeta,

    // Epic-specific methods
    create,
    findByProject,
    update,
    reorder,
    computeDerivedStatus,
    softDelete,
    findWithStoryCounts,
    recalculateAllStatuses,
  };
};

/** Inferred type for the epic repository instance */
export type EpicRepository = ReturnType<typeof createEpicRepository>;
