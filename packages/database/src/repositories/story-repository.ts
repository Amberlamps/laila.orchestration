/**
 * @module story-repository
 *
 * Repository for user story CRUD and assignment lifecycle management.
 *
 * User stories are the unit of work assignment in the orchestration hierarchy
 * (project > epic > story > task). This repository extends the base repository
 * with domain-specific operations for:
 *
 * - **Assignment lifecycle**: assign, complete, and release worker assignments
 *   using atomic transactions with optimistic locking to prevent race conditions
 * - **Attempt tracking**: every assignment creates an attempt_history record;
 *   completions and releases update the corresponding record
 * - **Read-only enforcement**: core fields (title, description, priority) are
 *   immutable while a story is `in_progress`
 * - **Priority-ordered retrieval**: `findReadyForAssignment` returns stories
 *   ordered by priority (critical > high > medium > low) for fair scheduling
 *
 * All methods enforce tenant scoping and soft-delete filtering via the base
 * repository's `tenantScope` helper.
 */

import {
  eq,
  and,
  isNull,
  inArray,
  sql,
  asc,
  type SQL,
  type InferSelectModel,
  type InferInsertModel,
} from 'drizzle-orm';

import { attemptHistoryTable } from '../schema/attempt-history';
import { epicsTable } from '../schema/epics';
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
import type { PaginationQuery } from '@laila/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Select model for user_stories rows */
export type UserStory = InferSelectModel<typeof userStoriesTable>;

/** Insert model for user_stories rows */
type UserStoryInsert = InferInsertModel<typeof userStoriesTable>;

/** Select model for attempt_history rows */
export type AttemptHistory = InferSelectModel<typeof attemptHistoryTable>;

/**
 * Data required to create a new user story.
 *
 * The `epicId` is passed separately as a method parameter, and system-managed
 * fields (id, tenantId, version, timestamps, workStatus, attempts) are
 * excluded because they are set automatically.
 */
export type CreateStoryData = Omit<
  UserStoryInsert,
  | 'id'
  | 'tenantId'
  | 'epicId'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
  | 'deletedAt'
  | 'workStatus'
  | 'attempts'
>;

/**
 * Fields that may be updated on a user story.
 *
 * Excludes system-managed columns and assignment lifecycle fields, which
 * are modified only through dedicated lifecycle methods.
 */
export type UpdateStoryData = Partial<
  Omit<
    UserStoryInsert,
    | 'id'
    | 'tenantId'
    | 'epicId'
    | 'version'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'assignedWorkerId'
    | 'assignedAt'
    | 'attempts'
  >
>;

/** Options for the `findByEpic` paginated query */
export interface FindByEpicOptions {
  pagination?: PaginationQuery;
  status?: string;
  priority?: string;
}

/**
 * Core fields that are read-only when a story is `in_progress`.
 *
 * Modifying these fields during execution could invalidate the worker's
 * current understanding of the story, leading to incorrect output.
 */
const PROTECTED_FIELDS_DURING_EXECUTION: ReadonlyArray<keyof UpdateStoryData> = [
  'title',
  'description',
  'priority',
];

// ---------------------------------------------------------------------------
// Priority ordering helper
// ---------------------------------------------------------------------------

/**
 * SQL CASE expression that maps priority text values to integers for sorting.
 *
 * critical(0) > high(1) > medium(2) > low(3)
 *
 * This enables ORDER BY priority with deterministic, urgency-based ordering
 * instead of alphabetical ordering.
 */
const priorityOrderExpression = sql`CASE ${userStoriesTable.priority}
  WHEN 'critical' THEN 0
  WHEN 'high' THEN 1
  WHEN 'medium' THEN 2
  WHEN 'low' THEN 3
  ELSE 4
END`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Union of both supported Drizzle client types */
type DatabaseClient = Database | PoolDatabase;

/**
 * Creates a story repository instance with CRUD and assignment lifecycle methods.
 *
 * Composes the base repository for standard operations (findById, findMany,
 * softDelete, hardDelete) and adds story-specific methods for the assignment
 * lifecycle, attempt tracking, and priority-based retrieval.
 *
 * @param db - A Drizzle database client (HTTP or pool mode). Pool mode is
 *   required for transactional methods (assignToWorker, completeAssignment,
 *   releaseAssignment).
 *
 * @example
 * ```typescript
 * import { createStoryRepository } from './story-repository';
 * import { createPoolClient } from '../client';
 *
 * const db = createPoolClient(process.env.DATABASE_URL!);
 * const storyRepo = createStoryRepository(db);
 *
 * const story = await storyRepo.create(tenantId, epicId, {
 *   title: 'Implement login form',
 *   priority: 'high',
 * });
 * ```
 */
export const createStoryRepository = (db: DatabaseClient) => {
  const base = createBaseRepository(userStoriesTable, db);
  const typedDb = asDrizzle(db);

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Creates a new user story within an epic.
   *
   * Initializes the story with `work_status = 'pending'` and `attempts = 0`
   * regardless of what the caller passes, enforcing the correct initial state.
   *
   * @param tenantId - The tenant UUID for data isolation
   * @param epicId   - The parent epic UUID
   * @param data     - Story fields (title, description, priority, etc.)
   * @returns The newly created user story
   */
  const create = async (
    tenantId: string,
    epicId: string,
    data: CreateStoryData,
  ): Promise<UserStory> => {
    const results = await typedDb
      .insert(userStoriesTable)
      .values({
        ...data,
        tenantId,
        epicId,
        workStatus: 'pending',
        attempts: 0,
      })
      .returning();

    return results[0] as UserStory;
  };

  // -------------------------------------------------------------------------
  // Update (with in_progress protection)
  // -------------------------------------------------------------------------

  /**
   * Updates a user story with optimistic locking and in_progress field protection.
   *
   * When the story's current `work_status` is `in_progress`, updates to core
   * fields (title, description, priority) are rejected with a `ValidationError`.
   * This prevents modifications that could invalidate a worker's current execution.
   *
   * @param tenantId        - The tenant UUID for data isolation
   * @param id              - The story UUID to update
   * @param data            - Partial story fields to update
   * @param expectedVersion - Optimistic lock version the caller expects
   * @returns The updated user story with incremented version
   * @throws {ValidationError} If attempting to modify protected fields while in_progress
   * @throws {ConflictError} If version mismatch (concurrent modification)
   * @throws {NotFoundError} If the story does not exist for this tenant
   */
  const update = async (
    tenantId: string,
    id: string,
    data: UpdateStoryData,
    expectedVersion: number,
  ): Promise<UserStory> => {
    // Check if the story exists and get its current status
    const existing = await base.findById(tenantId, id);

    if (!existing) {
      throw new NotFoundError('UserStory', id);
    }

    // Enforce read-only protection during execution
    if (existing.workStatus === 'in_progress') {
      for (const field of PROTECTED_FIELDS_DURING_EXECUTION) {
        if (data[field] !== undefined) {
          throw new ValidationError(
            field,
            `Cannot modify "${field}" while story is in_progress. ` +
              `Wait until the current assignment completes or is released.`,
          );
        }
      }
    }

    // Delegate to base repository for optimistic locking update
    return base.update(tenantId, id, data, expectedVersion);
  };

  // -------------------------------------------------------------------------
  // findByEpic (paginated with optional filters)
  // -------------------------------------------------------------------------

  /**
   * Returns paginated stories belonging to an epic, with optional status
   * and priority filters.
   *
   * @param tenantId - The tenant UUID for data isolation
   * @param epicId   - The parent epic UUID to filter by
   * @param options  - Pagination parameters and optional status/priority filters
   * @returns Paginated result with story data and pagination metadata
   */
  const findByEpic = async (
    tenantId: string,
    epicId: string,
    options: FindByEpicOptions = {},
  ): Promise<PaginatedResult<UserStory>> => {
    const conditions: SQL[] = [eq(userStoriesTable.epicId, epicId)];

    if (options.status) {
      conditions.push(eq(userStoriesTable.workStatus, options.status));
    }

    if (options.priority) {
      conditions.push(eq(userStoriesTable.priority, options.priority));
    }

    const combinedFilters = and(...conditions) as SQL;

    return base.findMany(tenantId, {
      pagination: options.pagination,
      filters: combinedFilters,
    });
  };

  // -------------------------------------------------------------------------
  // findAllByEpic (non-paginated, for validation)
  // -------------------------------------------------------------------------

  /**
   * Returns all non-deleted user stories for an epic without pagination.
   *
   * Intended for validation scenarios (e.g., epic publish checks) where all
   * stories must be examined. Returns the full story record so callers can
   * inspect `workStatus`, `title`, `id`, etc.
   *
   * @param tenantId - The tenant UUID for data isolation
   * @param epicId   - The parent epic UUID to list stories for
   * @returns Array of all non-deleted user story records for the epic
   */
  const findAllByEpic = async (tenantId: string, epicId: string): Promise<UserStory[]> => {
    const results = await typedDb
      .select()
      .from(userStoriesTable)
      .where(
        and(
          eq(userStoriesTable.tenantId, tenantId),
          eq(userStoriesTable.epicId, epicId),
          isNull(userStoriesTable.deletedAt),
        ),
      )
      .orderBy(asc(userStoriesTable.createdAt));

    return results as UserStory[];
  };

  // -------------------------------------------------------------------------
  // findReadyForAssignment
  // -------------------------------------------------------------------------

  /**
   * Finds stories that are ready for worker assignment within a project.
   *
   * Selection criteria:
   * - `work_status = 'ready'`
   * - `assigned_worker_id IS NULL` (not currently assigned)
   * - `attempts < max_attempts` (retry budget not exhausted)
   * - Story belongs to an epic within the specified project
   * - Not soft-deleted
   *
   * Results are ordered by priority (critical > high > medium > low) then
   * by creation time (oldest first) for FIFO fairness within each priority.
   *
   * This is one of the most performance-critical queries in the system as
   * it is called on every work assignment request. The composite index on
   * `(tenant_id, work_status)` supports efficient filtering.
   *
   * @param tenantId  - The tenant UUID for data isolation
   * @param projectId - The project UUID to scope the search to
   * @returns Array of stories ready for assignment, priority-ordered
   */
  const findReadyForAssignment = async (
    tenantId: string,
    projectId: string,
  ): Promise<UserStory[]> => {
    const results = await typedDb
      .select({
        // Select all user story columns
        id: userStoriesTable.id,
        tenantId: userStoriesTable.tenantId,
        epicId: userStoriesTable.epicId,
        title: userStoriesTable.title,
        description: userStoriesTable.description,
        priority: userStoriesTable.priority,
        workStatus: userStoriesTable.workStatus,
        costEstimate: userStoriesTable.costEstimate,
        actualCost: userStoriesTable.actualCost,
        assignedWorkerId: userStoriesTable.assignedWorkerId,
        assignedAt: userStoriesTable.assignedAt,
        attempts: userStoriesTable.attempts,
        maxAttempts: userStoriesTable.maxAttempts,
        version: userStoriesTable.version,
        createdAt: userStoriesTable.createdAt,
        updatedAt: userStoriesTable.updatedAt,
        deletedAt: userStoriesTable.deletedAt,
      })
      .from(userStoriesTable)
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(userStoriesTable.tenantId, tenantId),
          eq(epicsTable.projectId, projectId),
          eq(userStoriesTable.workStatus, 'ready'),
          isNull(userStoriesTable.assignedWorkerId),
          sql`${userStoriesTable.attempts} < ${userStoriesTable.maxAttempts}`,
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      )
      .orderBy(priorityOrderExpression, asc(userStoriesTable.createdAt));

    return results as UserStory[];
  };

  // -------------------------------------------------------------------------
  // assignToWorker (atomic transaction)
  // -------------------------------------------------------------------------

  /**
   * Atomically assigns a worker to a story.
   *
   * Within a single transaction:
   * 1. Updates the story: sets `assigned_worker_id`, `assigned_at`,
   *    `work_status = 'in_progress'`, increments `attempts` and `version`
   * 2. Creates an `attempt_history` record with `status = 'in_progress'`
   *
   * The UPDATE includes extra safety guards beyond optimistic locking:
   * - Only assigns if `work_status = 'ready'` (correct lifecycle state)
   * - Only assigns if `assigned_worker_id IS NULL` (prevents double-assignment)
   *
   * @param tenantId        - The tenant UUID for data isolation
   * @param storyId         - The story UUID to assign
   * @param workerId        - The worker UUID to assign
   * @param expectedVersion - Optimistic lock version the caller expects
   * @returns The updated user story with assignment fields set
   * @throws {ConflictError} If version mismatch, story not ready, or already assigned
   */
  const assignToWorker = async (
    tenantId: string,
    storyId: string,
    workerId: string,
    expectedVersion: number,
  ): Promise<UserStory> => {
    return await typedDb.transaction(async (tx: DrizzleDb) => {
      const now = new Date();

      // Atomically update story with optimistic lock + state guards
      const [updated] = await tx
        .update(userStoriesTable)
        .set({
          assignedWorkerId: workerId,
          assignedAt: now,
          workStatus: 'in_progress',
          attempts: sql`${userStoriesTable.attempts} + 1`,
          version: sql`${userStoriesTable.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStoriesTable.id, storyId),
            eq(userStoriesTable.tenantId, tenantId),
            eq(userStoriesTable.version, expectedVersion),
            eq(userStoriesTable.workStatus, 'ready'),
            isNull(userStoriesTable.assignedWorkerId),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictError('UserStory', storyId, expectedVersion);
      }

      // Log the attempt in history
      await tx.insert(attemptHistoryTable).values({
        tenantId,
        userStoryId: storyId,
        workerId,
        attemptNumber: updated.attempts,
        startedAt: now,
        status: 'in_progress',
      });

      return updated as UserStory;
    });
  };

  // -------------------------------------------------------------------------
  // completeAssignment (atomic transaction)
  // -------------------------------------------------------------------------

  /**
   * Atomically completes a worker assignment.
   *
   * Within a single transaction:
   * 1. Updates the story: sets `work_status` to the provided status
   *    (`done` or `failed`), records `actual_cost`, clears assignment fields,
   *    and increments `version`
   * 2. Updates the corresponding `attempt_history` record with completion
   *    timestamp, status, cost, duration, and optional reason
   *
   * @param tenantId        - The tenant UUID for data isolation
   * @param storyId         - The story UUID to complete
   * @param status          - Terminal status: `'done'` or `'failed'`
   * @param cost            - Actual execution cost (tokens, API calls, etc.)
   * @param reason          - Human-readable explanation (required for failures)
   * @param expectedVersion - Optimistic lock version the caller expects
   * @returns The updated user story with cleared assignment fields
   * @throws {ConflictError} If version mismatch or story not in_progress
   */
  const completeAssignment = async (
    tenantId: string,
    storyId: string,
    status: string,
    cost: string | null,
    reason: string | null,
    expectedVersion: number,
  ): Promise<UserStory> => {
    // Only terminal statuses are valid for completion
    if (status !== 'done' && status !== 'failed') {
      throw new ValidationError(
        'status',
        `Invalid completion status: '${status}'. Only 'done' or 'failed' are allowed.`,
      );
    }

    return await typedDb.transaction(async (tx: DrizzleDb) => {
      const now = new Date();

      // Update the story: set terminal status, record cost, clear assignment
      const [updated] = await tx
        .update(userStoriesTable)
        .set({
          workStatus: status,
          actualCost: cost,
          assignedWorkerId: null,
          assignedAt: null,
          version: sql`${userStoriesTable.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStoriesTable.id, storyId),
            eq(userStoriesTable.tenantId, tenantId),
            eq(userStoriesTable.version, expectedVersion),
            eq(userStoriesTable.workStatus, 'in_progress'),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictError('UserStory', storyId, expectedVersion);
      }

      // Update the corresponding attempt_history record
      await tx
        .update(attemptHistoryTable)
        .set({
          completedAt: now,
          status,
          reason,
          cost,
          durationMs: sql`EXTRACT(EPOCH FROM (${now}::timestamptz - ${attemptHistoryTable.startedAt})) * 1000`,
        })
        .where(
          and(
            eq(attemptHistoryTable.userStoryId, storyId),
            eq(attemptHistoryTable.tenantId, tenantId),
            eq(attemptHistoryTable.attemptNumber, updated.attempts),
            eq(attemptHistoryTable.status, 'in_progress'),
          ),
        );

      return updated as UserStory;
    });
  };

  // -------------------------------------------------------------------------
  // releaseAssignment (atomic transaction)
  // -------------------------------------------------------------------------

  /**
   * Releases a worker assignment due to timeout or failure.
   *
   * Within a single transaction:
   * 1. Reads the current story to determine its attempt count vs max_attempts
   * 2. Updates the story: clears assignment fields, sets status to `'ready'`
   *    (if retries remain) or `'failed'` (if max attempts reached),
   *    increments `version`
   * 3. Updates the corresponding `attempt_history` record with the release
   *    reason, completion timestamp, and appropriate status
   *
   * @param tenantId        - The tenant UUID for data isolation
   * @param storyId         - The story UUID to release
   * @param reason          - Human-readable explanation for the release
   * @param expectedVersion - Optimistic lock version the caller expects
   * @returns The updated user story with cleared assignment
   * @throws {ConflictError} If version mismatch or story not in_progress
   */
  const releaseAssignment = async (
    tenantId: string,
    storyId: string,
    reason: string,
    expectedVersion: number,
  ): Promise<UserStory> => {
    return await typedDb.transaction(async (tx: DrizzleDb) => {
      const now = new Date();

      // First, read the current story within the transaction to check attempt limits
      const [current] = await tx
        .select()
        .from(userStoriesTable)
        .where(
          and(
            eq(userStoriesTable.id, storyId),
            eq(userStoriesTable.tenantId, tenantId),
            eq(userStoriesTable.version, expectedVersion),
            eq(userStoriesTable.workStatus, 'in_progress'),
          ),
        )
        .limit(1);

      if (!current) {
        throw new ConflictError('UserStory', storyId, expectedVersion);
      }

      // Determine next status: ready if retries remain, failed if exhausted
      const nextStatus = current.attempts >= current.maxAttempts ? 'failed' : 'ready';

      // Determine attempt history status
      const attemptStatus = current.attempts >= current.maxAttempts ? 'failed' : 'timed_out';

      // Update the story: clear assignment, set appropriate status
      const [updated] = await tx
        .update(userStoriesTable)
        .set({
          workStatus: nextStatus,
          assignedWorkerId: null,
          assignedAt: null,
          version: sql`${userStoriesTable.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(userStoriesTable.id, storyId),
            eq(userStoriesTable.tenantId, tenantId),
            eq(userStoriesTable.version, expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictError('UserStory', storyId, expectedVersion);
      }

      // Update the corresponding attempt_history record
      await tx
        .update(attemptHistoryTable)
        .set({
          completedAt: now,
          status: attemptStatus,
          reason,
          durationMs: sql`EXTRACT(EPOCH FROM (${now}::timestamptz - ${attemptHistoryTable.startedAt})) * 1000`,
        })
        .where(
          and(
            eq(attemptHistoryTable.userStoryId, storyId),
            eq(attemptHistoryTable.tenantId, tenantId),
            eq(attemptHistoryTable.attemptNumber, current.attempts),
            eq(attemptHistoryTable.status, 'in_progress'),
          ),
        );

      return updated as UserStory;
    });
  };

  // -------------------------------------------------------------------------
  // getPreviousAttempts
  // -------------------------------------------------------------------------

  /**
   * Returns the full attempt history for a user story, ordered by attempt number.
   *
   * Useful for debugging failed assignments, reviewing execution costs, and
   * understanding why a story may have been retried multiple times.
   *
   * @param tenantId - The tenant UUID for data isolation
   * @param storyId  - The story UUID to retrieve attempts for
   * @returns Array of attempt history records, ordered by attempt number ascending
   */
  const getPreviousAttempts = async (
    tenantId: string,
    storyId: string,
  ): Promise<AttemptHistory[]> => {
    const results = await typedDb
      .select()
      .from(attemptHistoryTable)
      .where(
        and(
          eq(attemptHistoryTable.tenantId, tenantId),
          eq(attemptHistoryTable.userStoryId, storyId),
        ),
      )
      .orderBy(asc(attemptHistoryTable.attemptNumber));

    return results as AttemptHistory[];
  };

  // -------------------------------------------------------------------------
  // findActiveByProject (for revert validation)
  // -------------------------------------------------------------------------

  /**
   * Finds user stories within a project that have started or completed work.
   *
   * Returns stories with `work_status` in `['in_progress', 'done', 'failed']`.
   * These are the statuses that block a project revert from Ready to Draft,
   * because reverting would invalidate in-flight or completed work.
   *
   * The query joins through the epics table to scope stories to a specific
   * project, and excludes soft-deleted records from both tables.
   *
   * @param tenantId  - The tenant UUID for data isolation
   * @param projectId - The project UUID to scope the search to
   * @returns Array of stories with active/terminal work statuses
   */
  const findActiveByProject = async (tenantId: string, projectId: string): Promise<UserStory[]> => {
    const activeStatuses = ['in_progress', 'done', 'failed'];

    const results = await typedDb
      .select({
        id: userStoriesTable.id,
        tenantId: userStoriesTable.tenantId,
        epicId: userStoriesTable.epicId,
        title: userStoriesTable.title,
        description: userStoriesTable.description,
        priority: userStoriesTable.priority,
        workStatus: userStoriesTable.workStatus,
        costEstimate: userStoriesTable.costEstimate,
        actualCost: userStoriesTable.actualCost,
        assignedWorkerId: userStoriesTable.assignedWorkerId,
        assignedAt: userStoriesTable.assignedAt,
        attempts: userStoriesTable.attempts,
        maxAttempts: userStoriesTable.maxAttempts,
        version: userStoriesTable.version,
        createdAt: userStoriesTable.createdAt,
        updatedAt: userStoriesTable.updatedAt,
        deletedAt: userStoriesTable.deletedAt,
      })
      .from(userStoriesTable)
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(userStoriesTable.tenantId, tenantId),
          eq(epicsTable.projectId, projectId),
          inArray(userStoriesTable.workStatus, activeStatuses),
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      );

    return results as UserStory[];
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    // Base repository methods (findById, findMany, softDelete, hardDelete)
    ...base,

    // Override create and update with story-specific logic
    create,
    update,

    // Story-specific query methods
    findByEpic,
    findAllByEpic,
    findReadyForAssignment,
    findActiveByProject,

    // Assignment lifecycle methods (require pool mode for transactions)
    assignToWorker,
    completeAssignment,
    releaseAssignment,

    // Attempt history
    getPreviousAttempts,
  };
};

/**
 * Inferred return type of `createStoryRepository` for use in service layer
 * type declarations and dependency injection.
 */
export type StoryRepository = ReturnType<typeof createStoryRepository>;
