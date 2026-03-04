/**
 * @module worker-repository
 *
 * Repository for managing worker (AI agent) entities with secure API key
 * authentication and project access control.
 *
 * This is a standalone repository that does NOT extend the base repository
 * because the `workers` table lacks the `version` and `deletedAt` columns
 * required by `createBaseRepository`. Instead, it implements tenant-scoped
 * CRUD, pagination, and optimistic locking directly against the workers
 * schema.
 *
 * **API key authentication** uses a prefix+hash pattern:
 *
 * 1. A cryptographically secure random key is generated with the `lw_` prefix
 * 2. Only the SHA-256 hash and a short prefix (first 12 chars) are stored
 * 3. Authentication performs a two-step lookup: prefix index scan, then
 *    timing-safe full hash comparison
 * 4. The raw key is returned exactly once at creation/regeneration time
 *
 * **Optimistic locking** uses the `updatedAt` timestamp as a concurrency
 * guard. Methods that mutate worker state accept an `expectedVersion` (Date)
 * parameter and include it in the WHERE clause. If another process has
 * modified the record, the timestamp will differ and no rows will be
 * updated, triggering a `ConflictError`.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  eq,
  and,
  count,
  asc,
  desc,
  isNull,
  inArray,
  type SQL,
  type InferSelectModel,
} from 'drizzle-orm';

import { workersTable, workerProjectAccessTable, userStoriesTable } from '../schema';

import { asDrizzle, ConflictError, NotFoundError } from './base-repository';

import type { Database, PoolDatabase } from '../client';
import type { PaginationQuery, PaginationMeta } from '@laila/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix prepended to every generated API key */
const API_KEY_PREFIX = 'lw_';

/** Number of random bytes used for API key entropy (192 bits → 48 hex chars) */
const API_KEY_RANDOM_BYTES = 24;

/** Number of characters stored as the key prefix for index-based lookup (lw_ + 8 hex = 11) */
const PREFIX_LENGTH = 11;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Full worker record as returned by SELECT queries */
export type Worker = InferSelectModel<typeof workersTable>;

/** Full worker_project_access record as returned by SELECT queries */
export type WorkerProjectAccess = InferSelectModel<typeof workerProjectAccessTable>;

/** Data required to create a new worker (excluding generated fields) */
export interface CreateWorkerData {
  name: string;
  description?: string | undefined;
}

/** Return type for create/regenerate operations that expose the raw API key */
export interface WorkerWithApiKey {
  worker: Worker;
  /** The raw API key. This is the ONLY time it is available in plaintext. */
  rawApiKey: string;
}

/** Pagination and filter options for the `findByTenant` method */
export interface FindWorkersOptions {
  pagination?: PaginationQuery;
  isActive?: boolean;
}

/** Paginated result envelope matching the shared pagination schema */
export interface PaginatedWorkers {
  data: Worker[];
  pagination: PaginationMeta;
}

/** Data for updating a worker's mutable fields */
export interface UpdateWorkerData {
  name?: string;
  description?: string | null;
}

/** Summary of worker activity for the detail endpoint */
export interface WorkerActivitySummary {
  assignedStories: number;
  completedStories: number;
  projectAccessCount: number;
}

/** A worker record combined with its activity summary */
export interface WorkerWithActivity {
  worker: Worker;
  activity: WorkerActivitySummary;
}

/** Minimal story info for deletion guard responses */
export interface AssignedStoryInfo {
  id: string;
  title: string;
  workStatus: string;
}

/** Union of supported Drizzle client types */
type DatabaseClient = Database | PoolDatabase;

// ---------------------------------------------------------------------------
// API key helpers
// ---------------------------------------------------------------------------

/**
 * Generates a new API key with the `lw_` prefix.
 *
 * @returns The raw key (for the caller), its SHA-256 hex hash, and the
 *          stored prefix (first 11 characters: `lw_` + 8 hex)
 */
const generateApiKey = (): { rawKey: string; hash: string; prefix: string } => {
  const randomPart = randomBytes(API_KEY_RANDOM_BYTES).toString('hex');
  const rawKey = `${API_KEY_PREFIX}${randomPart}`;
  const hash = createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.substring(0, PREFIX_LENGTH);
  return { rawKey, hash, prefix };
};

/**
 * Hashes a raw API key with SHA-256 for comparison against stored hashes.
 */
const hashApiKey = (rawKey: string): string => createHash('sha256').update(rawKey).digest('hex');

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

/**
 * Computes pagination metadata from total count and page parameters.
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

// ---------------------------------------------------------------------------
// Repository factory
// ---------------------------------------------------------------------------

/**
 * Creates a worker repository bound to the given database client.
 *
 * All methods (except `authenticateByApiKey`) enforce tenant scoping to
 * guarantee data isolation in a multi-tenant environment.
 *
 * @param db - A Drizzle database client (HTTP or pool mode)
 *
 * @example
 * ```typescript
 * import { createWorkerRepository } from '@laila/database';
 * import type { Database } from '@laila/database';
 *
 * const workerRepo = createWorkerRepository(db);
 * const { worker, rawApiKey } = await workerRepo.create(tenantId, { name: 'Agent-1' });
 * ```
 */
export const createWorkerRepository = (db: DatabaseClient) => {
  const typedDb = asDrizzle(db);

  // -----------------------------------------------------------------------
  // Column resolver for dynamic sort
  // -----------------------------------------------------------------------

  const resolveColumn = (fieldName: string): SQL => {
    const columns = workersTable as unknown as Record<string, unknown>;
    const column = columns[fieldName];
    if (column && typeof column === 'object' && 'sql' in column) {
      return column as unknown as SQL;
    }
    return workersTable.createdAt as unknown as SQL;
  };

  // -----------------------------------------------------------------------
  // Core CRUD
  // -----------------------------------------------------------------------

  /**
   * Creates a new worker with a freshly generated API key.
   *
   * The raw API key is returned in the response and is never stored.
   * Callers must present this key to the end user immediately -- it
   * cannot be retrieved again.
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param data     - Worker name and optional description
   * @returns The persisted worker record and the one-time raw API key
   */
  const create = async (tenantId: string, data: CreateWorkerData): Promise<WorkerWithApiKey> => {
    const { rawKey, hash, prefix } = generateApiKey();

    const results = await typedDb
      .insert(workersTable)
      .values({
        tenantId,
        name: data.name,
        description: data.description,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
      })
      .returning();

    const worker = results[0] as Worker;
    return { worker, rawApiKey: rawKey };
  };

  /**
   * Finds a single worker by ID within a tenant scope.
   *
   * @returns The worker record, or `null` if not found
   */
  const findById = async (tenantId: string, id: string): Promise<Worker | null> => {
    const results = await typedDb
      .select()
      .from(workersTable)
      .where(and(eq(workersTable.id, id), eq(workersTable.tenantId, tenantId)))
      .limit(1);

    return (results[0] as Worker | undefined) ?? null;
  };

  /**
   * Returns a paginated list of workers for a tenant, with optional
   * `isActive` filtering.
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param options  - Pagination parameters and optional isActive filter
   */
  const findByTenant = async (
    tenantId: string,
    options: FindWorkersOptions = {},
  ): Promise<PaginatedWorkers> => {
    const {
      pagination: paginationParams = {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      },
      isActive,
    } = options;

    const { page, limit, sortBy, sortOrder } = paginationParams;
    const offset = (page - 1) * limit;

    // Build WHERE clause: always scope to tenant, optionally filter isActive
    const conditions: SQL[] = [eq(workersTable.tenantId, tenantId)];

    if (isActive !== undefined) {
      conditions.push(eq(workersTable.isActive, isActive));
    }

    const whereClause = and(...conditions) as SQL;

    // Resolve sort column and direction
    const sortColumn = resolveColumn(sortBy);
    const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Execute count and data queries in parallel
    const [countResult, data] = await Promise.all([
      typedDb.select({ total: count() }).from(workersTable).where(whereClause),
      typedDb
        .select()
        .from(workersTable)
        .where(whereClause)
        .orderBy(orderDirection)
        .limit(limit)
        .offset(offset),
    ]);

    const total = countResult[0]?.total ?? 0;
    const pagination = computePaginationMeta(total, page, limit);

    return { data: data as Worker[], pagination };
  };

  // -----------------------------------------------------------------------
  // API key authentication
  // -----------------------------------------------------------------------

  /**
   * Authenticates a worker by raw API key using the two-step
   * prefix+hash pattern.
   *
   * This method does NOT require a tenantId because authentication
   * happens before tenant context is established. The returned worker
   * record contains the `tenantId` for downstream authorization.
   *
   * Steps:
   * 1. Extract the prefix (first 12 chars) from the raw key
   * 2. Query by prefix using the unique index (O(1) lookup)
   * 3. Verify the full SHA-256 hash with timing-safe comparison
   * 4. Update `last_seen_at` for health monitoring
   *
   * @param rawApiKey - The full API key as provided by the worker
   * @returns The authenticated worker record, or `null` if invalid
   */
  const authenticateByApiKey = async (rawApiKey: string): Promise<Worker | null> => {
    const prefix = rawApiKey.substring(0, PREFIX_LENGTH);
    const expectedHash = hashApiKey(rawApiKey);

    // Step 1: Efficient prefix-based index lookup (active workers only)
    const results = await typedDb
      .select()
      .from(workersTable)
      .where(and(eq(workersTable.apiKeyPrefix, prefix), eq(workersTable.isActive, true)))
      .limit(1);

    const worker = results[0] as Worker | undefined;
    if (!worker) return null;

    // Step 2: Timing-safe full hash verification
    const storedHashBuffer = Buffer.from(worker.apiKeyHash);
    const expectedHashBuffer = Buffer.from(expectedHash);

    if (storedHashBuffer.length !== expectedHashBuffer.length) return null;

    const hashMatches = timingSafeEqual(storedHashBuffer, expectedHashBuffer);
    if (!hashMatches) return null;

    // Step 3: Update last_seen_at for monitoring
    await typedDb
      .update(workersTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(workersTable.id, worker.id));

    return worker;
  };

  // -----------------------------------------------------------------------
  // API key regeneration
  // -----------------------------------------------------------------------

  /**
   * Regenerates the API key for a worker, immediately invalidating the
   * previous key.
   *
   * Uses optimistic locking via the `updatedAt` timestamp to prevent
   * concurrent regeneration races. If the record has been modified since
   * the caller last read it, a `ConflictError` is thrown.
   *
   * @param tenantId        - Tenant UUID for data isolation
   * @param workerId        - The worker UUID whose key should be regenerated
   * @param expectedVersion - The `updatedAt` value the caller expects
   * @returns The updated worker record and the new one-time raw API key
   * @throws {ConflictError} If `updatedAt` does not match (concurrent modification)
   * @throws {NotFoundError} If the worker does not exist for this tenant
   */
  const regenerateApiKey = async (
    tenantId: string,
    workerId: string,
    expectedVersion: Date,
  ): Promise<WorkerWithApiKey> => {
    const { rawKey, hash, prefix } = generateApiKey();

    const results = await typedDb
      .update(workersTable)
      .set({
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workersTable.id, workerId),
          eq(workersTable.tenantId, tenantId),
          eq(workersTable.updatedAt, expectedVersion),
        ),
      )
      .returning();

    if (results.length === 0) {
      // Determine whether it's a not-found or a conflict
      const existing = await findById(tenantId, workerId);
      if (!existing) {
        throw new NotFoundError('workers', workerId);
      }
      throw new ConflictError('workers', workerId, 0);
    }

    return { worker: results[0] as Worker, rawApiKey: rawKey };
  };

  // -----------------------------------------------------------------------
  // Activation / deactivation
  // -----------------------------------------------------------------------

  /**
   * Deactivates a worker, preventing it from authenticating.
   *
   * Uses optimistic locking via `updatedAt` to prevent concurrent
   * modification races.
   *
   * @param tenantId        - Tenant UUID for data isolation
   * @param workerId        - The worker UUID to deactivate
   * @param expectedVersion - The `updatedAt` value the caller expects
   * @returns The updated worker record
   * @throws {ConflictError} If `updatedAt` does not match
   * @throws {NotFoundError} If the worker does not exist for this tenant
   */
  const deactivate = async (
    tenantId: string,
    workerId: string,
    expectedVersion: Date,
  ): Promise<Worker> => {
    const results = await typedDb
      .update(workersTable)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workersTable.id, workerId),
          eq(workersTable.tenantId, tenantId),
          eq(workersTable.updatedAt, expectedVersion),
        ),
      )
      .returning();

    if (results.length === 0) {
      const existing = await findById(tenantId, workerId);
      if (!existing) {
        throw new NotFoundError('workers', workerId);
      }
      throw new ConflictError('workers', workerId, 0);
    }

    return results[0] as Worker;
  };

  /**
   * Activates a previously deactivated worker, allowing it to
   * authenticate again.
   *
   * Uses optimistic locking via `updatedAt` to prevent concurrent
   * modification races.
   *
   * @param tenantId        - Tenant UUID for data isolation
   * @param workerId        - The worker UUID to activate
   * @param expectedVersion - The `updatedAt` value the caller expects
   * @returns The updated worker record
   * @throws {ConflictError} If `updatedAt` does not match
   * @throws {NotFoundError} If the worker does not exist for this tenant
   */
  const activate = async (
    tenantId: string,
    workerId: string,
    expectedVersion: Date,
  ): Promise<Worker> => {
    const results = await typedDb
      .update(workersTable)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workersTable.id, workerId),
          eq(workersTable.tenantId, tenantId),
          eq(workersTable.updatedAt, expectedVersion),
        ),
      )
      .returning();

    if (results.length === 0) {
      const existing = await findById(tenantId, workerId);
      if (!existing) {
        throw new NotFoundError('workers', workerId);
      }
      throw new ConflictError('workers', workerId, 0);
    }

    return results[0] as Worker;
  };

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  /**
   * Updates a worker's mutable fields (name and/or description).
   *
   * Uses optimistic locking via `updatedAt` timestamp to prevent
   * concurrent modification. If the record has been modified since the
   * caller last read it, a `ConflictError` is thrown.
   *
   * @param tenantId        - Tenant UUID for data isolation
   * @param workerId        - The worker UUID to update
   * @param data            - Fields to update (name and/or description)
   * @param expectedVersion - The `updatedAt` value the caller expects
   * @returns The updated worker record
   * @throws {ConflictError} If `updatedAt` does not match (concurrent modification)
   * @throws {NotFoundError} If the worker does not exist for this tenant
   */
  const update = async (
    tenantId: string,
    workerId: string,
    data: UpdateWorkerData,
    expectedVersion: Date,
  ): Promise<Worker> => {
    const updatePayload: Record<string, string | null | Date> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updatePayload.name = data.name;
    }
    if (data.description !== undefined) {
      updatePayload.description = data.description;
    }

    const results = await typedDb
      .update(workersTable)
      .set(updatePayload)
      .where(
        and(
          eq(workersTable.id, workerId),
          eq(workersTable.tenantId, tenantId),
          eq(workersTable.updatedAt, expectedVersion),
        ),
      )
      .returning();

    if (results.length === 0) {
      const existing = await findById(tenantId, workerId);
      if (!existing) {
        throw new NotFoundError('workers', workerId);
      }
      throw new ConflictError('workers', workerId, 0);
    }

    return results[0] as Worker;
  };

  // -----------------------------------------------------------------------
  // Hard delete
  // -----------------------------------------------------------------------

  /**
   * Hard-deletes a worker record from the database.
   *
   * This permanently removes the worker and invalidates its API key
   * (since the key hash is stored on the worker record). The
   * `worker_project_access` records are cascade-deleted by the FK.
   * Stories assigned to this worker have `assigned_worker_id` set to
   * NULL by the FK `ON DELETE SET NULL` action.
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param workerId - The worker UUID to delete
   * @throws {NotFoundError} If the worker does not exist for this tenant
   */
  const hardDelete = async (tenantId: string, workerId: string): Promise<void> => {
    const results = await typedDb
      .delete(workersTable)
      .where(and(eq(workersTable.id, workerId), eq(workersTable.tenantId, tenantId)))
      .returning({ id: workersTable.id });

    if (results.length === 0) {
      throw new NotFoundError('workers', workerId);
    }
  };

  // -----------------------------------------------------------------------
  // Story assignment queries (for deletion guards)
  // -----------------------------------------------------------------------

  /**
   * Finds all non-deleted stories currently assigned to a worker that
   * are in the `in_progress` or `assigned` status.
   *
   * Used by the deletion guard to determine if a worker can be safely
   * removed without disrupting active work.
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param workerId - The worker UUID to check assignments for
   * @returns Array of minimal story info for in-progress assignments
   */
  const findInProgressStories = async (
    tenantId: string,
    workerId: string,
  ): Promise<AssignedStoryInfo[]> => {
    const results = await typedDb
      .select({
        id: userStoriesTable.id,
        title: userStoriesTable.title,
        workStatus: userStoriesTable.workStatus,
      })
      .from(userStoriesTable)
      .where(
        and(
          eq(userStoriesTable.tenantId, tenantId),
          eq(userStoriesTable.assignedWorkerId, workerId),
          inArray(userStoriesTable.workStatus, ['in_progress', 'assigned']),
          isNull(userStoriesTable.deletedAt),
        ),
      );

    return results as AssignedStoryInfo[];
  };

  /**
   * Unassigns all stories from a worker by setting `assigned_worker_id`
   * to NULL and reverting their status to `pending`.
   *
   * Used during force-deletion to cleanly detach all story assignments
   * before removing the worker record.
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param workerId - The worker UUID to unassign stories from
   * @returns The number of stories that were unassigned
   */
  const unassignAllStories = async (tenantId: string, workerId: string): Promise<number> => {
    const results = await typedDb
      .update(userStoriesTable)
      .set({
        assignedWorkerId: null,
        assignedAt: null,
        workStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userStoriesTable.tenantId, tenantId),
          eq(userStoriesTable.assignedWorkerId, workerId),
          isNull(userStoriesTable.deletedAt),
        ),
      )
      .returning({ id: userStoriesTable.id });

    return results.length;
  };

  // -----------------------------------------------------------------------
  // Activity summary (for detail endpoint)
  // -----------------------------------------------------------------------

  /**
   * Returns a worker combined with its activity summary.
   *
   * The activity summary includes:
   * - Number of currently assigned stories
   * - Number of completed stories (historical)
   * - Number of projects the worker has access to
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param workerId - The worker UUID to get details for
   * @returns The worker with activity summary, or null if not found
   */
  const findWithActivity = async (
    tenantId: string,
    workerId: string,
  ): Promise<WorkerWithActivity | null> => {
    const worker = await findById(tenantId, workerId);
    if (!worker) return null;

    // Run all count queries in parallel for performance
    const [assignedResult, completedResult, projectAccessResult] = await Promise.all([
      typedDb
        .select({ total: count() })
        .from(userStoriesTable)
        .where(
          and(
            eq(userStoriesTable.tenantId, tenantId),
            eq(userStoriesTable.assignedWorkerId, workerId),
            inArray(userStoriesTable.workStatus, ['in_progress', 'assigned']),
            isNull(userStoriesTable.deletedAt),
          ),
        ),
      typedDb
        .select({ total: count() })
        .from(userStoriesTable)
        .where(
          and(
            eq(userStoriesTable.tenantId, tenantId),
            eq(userStoriesTable.assignedWorkerId, workerId),
            eq(userStoriesTable.workStatus, 'done'),
            isNull(userStoriesTable.deletedAt),
          ),
        ),
      typedDb
        .select({ total: count() })
        .from(workerProjectAccessTable)
        .where(
          and(
            eq(workerProjectAccessTable.tenantId, tenantId),
            eq(workerProjectAccessTable.workerId, workerId),
          ),
        ),
    ]);

    return {
      worker,
      activity: {
        assignedStories: assignedResult[0]?.total ?? 0,
        completedStories: completedResult[0]?.total ?? 0,
        projectAccessCount: projectAccessResult[0]?.total ?? 0,
      },
    };
  };

  // -----------------------------------------------------------------------
  // Project access management
  // -----------------------------------------------------------------------

  /**
   * Grants a worker access to a specific project.
   *
   * Creates a record in the `worker_project_access` junction table.
   * If the access grant already exists, the database unique constraint
   * will prevent duplication (callers should handle the unique violation).
   *
   * @param tenantId  - Tenant UUID for data isolation
   * @param workerId  - The worker UUID to grant access to
   * @param projectId - The project UUID to grant access for
   * @returns The created worker_project_access record
   */
  const grantProjectAccess = async (
    tenantId: string,
    workerId: string,
    projectId: string,
  ): Promise<WorkerProjectAccess> => {
    const results = await typedDb
      .insert(workerProjectAccessTable)
      .values({
        tenantId,
        workerId,
        projectId,
      })
      .returning();

    return results[0] as WorkerProjectAccess;
  };

  /**
   * Revokes a worker's access to a specific project.
   *
   * Deletes the corresponding record from the `worker_project_access`
   * junction table. Returns the deleted record, or `null` if no such
   * access grant existed.
   *
   * @param tenantId  - Tenant UUID for data isolation
   * @param workerId  - The worker UUID to revoke access from
   * @param projectId - The project UUID to revoke access for
   * @returns The deleted record, or `null` if not found
   */
  const revokeProjectAccess = async (
    tenantId: string,
    workerId: string,
    projectId: string,
  ): Promise<WorkerProjectAccess | null> => {
    const results = await typedDb
      .delete(workerProjectAccessTable)
      .where(
        and(
          eq(workerProjectAccessTable.tenantId, tenantId),
          eq(workerProjectAccessTable.workerId, workerId),
          eq(workerProjectAccessTable.projectId, projectId),
        ),
      )
      .returning();

    return (results[0] as WorkerProjectAccess | undefined) ?? null;
  };

  /**
   * Returns all project access records for a worker within a tenant.
   *
   * @param tenantId - Tenant UUID for data isolation
   * @param workerId - The worker UUID to query access for
   * @returns Array of worker_project_access records
   */
  const getProjectAccess = async (
    tenantId: string,
    workerId: string,
  ): Promise<WorkerProjectAccess[]> => {
    const results = await typedDb
      .select()
      .from(workerProjectAccessTable)
      .where(
        and(
          eq(workerProjectAccessTable.tenantId, tenantId),
          eq(workerProjectAccessTable.workerId, workerId),
        ),
      );

    return results as WorkerProjectAccess[];
  };

  /**
   * Checks whether a worker has access to a specific project.
   *
   * @param tenantId  - Tenant UUID for data isolation
   * @param workerId  - The worker UUID to check
   * @param projectId - The project UUID to check access for
   * @returns `true` if the worker has access, `false` otherwise
   */
  const hasProjectAccess = async (
    tenantId: string,
    workerId: string,
    projectId: string,
  ): Promise<boolean> => {
    const results = await typedDb
      .select({ total: count() })
      .from(workerProjectAccessTable)
      .where(
        and(
          eq(workerProjectAccessTable.tenantId, tenantId),
          eq(workerProjectAccessTable.workerId, workerId),
          eq(workerProjectAccessTable.projectId, projectId),
        ),
      );

    return (results[0]?.total ?? 0) > 0;
  };

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  return {
    create,
    findById,
    findByTenant,
    update,
    hardDelete,
    findInProgressStories,
    unassignAllStories,
    findWithActivity,
    authenticateByApiKey,
    regenerateApiKey,
    deactivate,
    activate,
    grantProjectAccess,
    revokeProjectAccess,
    getProjectAccess,
    hasProjectAccess,
  };
};

/**
 * Inferred return type of `createWorkerRepository` for use in
 * service-layer type declarations.
 */
export type WorkerRepository = ReturnType<typeof createWorkerRepository>;
