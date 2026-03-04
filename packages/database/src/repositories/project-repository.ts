/**
 * @module project-repository
 *
 * Project repository providing tenant-scoped CRUD operations with
 * project-specific business logic:
 *
 * - **Lifecycle status transitions** -- Validates that projects follow
 *   the allowed state machine: draft -> planning -> ready -> active ->
 *   completed, with any state able to transition to archived.
 *
 * - **Cascade soft-delete** -- When a project is soft-deleted, all child
 *   epics, user stories, and tasks are soft-deleted in a single transaction
 *   to maintain referential consistency.
 *
 * - **Epic count aggregation** -- Returns a project with aggregated counts
 *   of child epics grouped by work status, avoiding N+1 queries.
 *
 * - **Work status updates** -- Allows the derived work status to be updated
 *   when child epic statuses change (called by upstream orchestration logic).
 *
 * Built on the base repository factory which provides findById, findMany,
 * optimistic locking, and tenant scoping out of the box.
 */

import { eq, and, isNull, sql, count, inArray, type InferSelectModel } from 'drizzle-orm';

import { taskDependencyEdgesTable } from '../schema/dependency-edges';
import { epicsTable } from '../schema/epics';
import { projectsTable } from '../schema/projects';
import { tasksTable } from '../schema/tasks';
import { userStoriesTable } from '../schema/user-stories';

import {
  createBaseRepository,
  asDrizzle,
  ConflictError,
  ValidationError,
  NotFoundError,
  type BaseTable,
  type DrizzleDb,
  type FindManyOptions,
  type PaginatedResult,
} from './base-repository';

import type { Database, PoolDatabase } from '../client';
import type { ProjectLifecycleStatus, WorkStatus, PaginationQuery } from '@laila/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Database client type alias (HTTP or pool mode) */
type DatabaseClient = Database | PoolDatabase;

/** Select model for the projects table */
type ProjectRecord = InferSelectModel<typeof projectsTable>;

/** Data required to create a new project (name and optional description) */
export type CreateProjectData = {
  name: string;
  description?: string | null;
  workerInactivityTimeoutMinutes?: number;
};

/** Data allowed when updating a project */
export type UpdateProjectData = {
  name?: string;
  description?: string | null;
  lifecycleStatus?: string;
  workerInactivityTimeoutMinutes?: number;
};

/** Options for filtering projects in findByTenant */
export interface FindProjectsOptions {
  pagination?: PaginationQuery;
  lifecycleStatus?: ProjectLifecycleStatus;
  workStatus?: WorkStatus;
}

/** A single status count entry for epic aggregation */
export interface EpicStatusCount {
  status: string;
  count: number;
}

/** Project record enriched with aggregated epic counts by status */
export interface ProjectWithEpicCounts extends ProjectRecord {
  epicCounts: EpicStatusCount[];
}

/** A single status count entry for story aggregation */
export interface StoryStatusCount {
  status: string;
  count: number;
}

/** Project record enriched with summary statistics for the detail endpoint */
export interface ProjectWithStats extends ProjectRecord {
  epicCounts: EpicStatusCount[];
  storyCounts: StoryStatusCount[];
  totalEpics: number;
  totalStories: number;
  completionPercentage: number;
}

// ---------------------------------------------------------------------------
// Lifecycle transition validation
// ---------------------------------------------------------------------------

/**
 * Valid lifecycle transitions -- defined as a map for O(1) lookup.
 *
 * Projects follow the domain state machine:
 *   draft -> ready (publish)
 *   ready -> draft (revert), ready -> in-progress (first story assigned)
 *   in-progress -> complete (all stories complete)
 *   complete is terminal.
 */
const VALID_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  draft: ['ready'],
  ready: ['draft', 'in-progress'],
  'in-progress': ['complete'],
  complete: [],
};

/**
 * Validates that a lifecycle status transition is allowed.
 *
 * @throws {ValidationError} If the transition is not in the allowed set
 */
const validateLifecycleTransition = (current: string, next: string): void => {
  const allowed = VALID_LIFECYCLE_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new ValidationError(
      'lifecycleStatus',
      `Invalid lifecycle transition: '${current}' -> '${next}'. ` +
        `Allowed transitions from '${current}': [${allowed?.join(', ') ?? 'none'}]`,
    );
  }
};

// ---------------------------------------------------------------------------
// Repository factory
// ---------------------------------------------------------------------------

/**
 * Creates a project repository instance with tenant-scoped CRUD operations
 * and project-specific business logic.
 *
 * Requires a PoolDatabase client because the cascade soft-delete operation
 * uses multi-statement transactions (not supported by HTTP-only clients).
 *
 * @param db - A Drizzle database client (pool mode for transaction support)
 * @returns A project repository object with all CRUD and domain methods
 *
 * @example
 * ```typescript
 * import { createProjectRepository } from './project-repository';
 * import { createDrizzleClient } from '../client';
 *
 * const db = createDrizzleClient({ mode: 'pool', url: DATABASE_URL });
 * const projectRepo = createProjectRepository(db);
 *
 * const project = await projectRepo.create(tenantId, { name: 'My Project' });
 * ```
 */
export const createProjectRepository = (db: DatabaseClient) => {
  const base = createBaseRepository(projectsTable as unknown as BaseTable, db);
  const typedDb = asDrizzle(db);

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Creates a new project with default lifecycle_status='draft' and
   * work_status='pending'.
   *
   * The tenant ID is enforced by the base repository and cannot be
   * overridden by the caller.
   *
   * @param tenantId - The tenant UUID that owns this project
   * @param data     - Project name and optional description
   * @returns The newly created project record
   */
  const create = async (tenantId: string, data: CreateProjectData): Promise<ProjectRecord> => {
    return base.create(tenantId, {
      name: data.name,
      description: data.description ?? null,
      lifecycleStatus: 'draft',
      workStatus: 'pending',
      ...(data.workerInactivityTimeoutMinutes !== undefined && {
        workerInactivityTimeoutMinutes: data.workerInactivityTimeoutMinutes,
      }),
    }) as Promise<ProjectRecord>;
  };

  // -------------------------------------------------------------------------
  // Update with lifecycle validation
  // -------------------------------------------------------------------------

  /**
   * Updates a project with optimistic locking and lifecycle status validation.
   *
   * If `lifecycleStatus` is included in the update data, the transition from
   * the current status to the new status is validated against the allowed
   * state machine. Invalid transitions throw a ValidationError.
   *
   * @param tenantId        - The tenant UUID to scope the update to
   * @param id              - The project UUID to update
   * @param data            - Partial project data to update
   * @param expectedVersion - The version number for optimistic locking
   * @returns The updated project record
   * @throws {ValidationError} If the lifecycle status transition is invalid
   * @throws {NotFoundError}   If the project does not exist for this tenant
   * @throws {ConflictError}   If the version does not match (concurrent edit)
   */
  const update = async (
    tenantId: string,
    id: string,
    data: UpdateProjectData,
    expectedVersion: number,
  ): Promise<ProjectRecord> => {
    // If lifecycle status is being changed, validate the transition
    if (data.lifecycleStatus) {
      const existing = await base.findById(tenantId, id);
      if (!existing) {
        throw new NotFoundError(base.entityName, id);
      }
      validateLifecycleTransition(existing.lifecycleStatus as string, data.lifecycleStatus);
    }

    return base.update(tenantId, id, data, expectedVersion) as Promise<ProjectRecord>;
  };

  // -------------------------------------------------------------------------
  // Find by tenant with filtering
  // -------------------------------------------------------------------------

  /**
   * Returns paginated projects for a tenant, optionally filtered by
   * lifecycle status and/or work status.
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param options  - Pagination and optional status filters
   * @returns Paginated result with project data and pagination metadata
   */
  const findByTenant = async (
    tenantId: string,
    options: FindProjectsOptions = {},
  ): Promise<PaginatedResult<ProjectRecord>> => {
    const { pagination, lifecycleStatus, workStatus } = options;

    // Build additional filter conditions
    const filterConditions: ReturnType<typeof eq>[] = [];

    if (lifecycleStatus) {
      filterConditions.push(eq(projectsTable.lifecycleStatus, lifecycleStatus));
    }

    if (workStatus) {
      filterConditions.push(eq(projectsTable.workStatus, workStatus));
    }

    const filters = filterConditions.length > 0 ? and(...filterConditions) : undefined;

    return base.findMany(tenantId, { pagination, filters }) as Promise<
      PaginatedResult<ProjectRecord>
    >;
  };

  // -------------------------------------------------------------------------
  // Cascade soft-delete
  // -------------------------------------------------------------------------

  /**
   * Soft-deletes a project and cascades to all child entities in a
   * single transaction.
   *
   * The cascade order is:
   * 1. Tasks (belonging to stories of epics in this project)
   * 2. User Stories (belonging to epics in this project)
   * 3. Epics (belonging to this project)
   * 4. The project itself
   *
   * All entities receive the same `deleted_at` timestamp for consistency.
   * Only non-deleted children are affected (already-deleted entities are
   * left untouched).
   *
   * @param tenantId - The tenant UUID to scope the operation to
   * @param id       - The project UUID to soft-delete
   * @returns The soft-deleted project record
   * @throws {NotFoundError} If the project does not exist for this tenant
   */
  const softDelete = async (tenantId: string, id: string): Promise<ProjectRecord> => {
    const existing = await base.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError(base.entityName, id);
    }

    const now = new Date();

    const result = await typedDb.transaction(async (tx: DrizzleDb) => {
      // Find epic IDs belonging to this project (non-deleted, same tenant)
      const epicRows = await tx
        .select({ id: epicsTable.id })
        .from(epicsTable)
        .where(
          and(
            eq(epicsTable.projectId, id),
            eq(epicsTable.tenantId, tenantId),
            isNull(epicsTable.deletedAt),
          ),
        );

      const epicIds = epicRows.map((row: { id: string }) => row.id);

      if (epicIds.length > 0) {
        // Find story IDs belonging to the affected epics
        const storyRows = await tx
          .select({ id: userStoriesTable.id })
          .from(userStoriesTable)
          .where(
            and(
              inArray(userStoriesTable.epicId, epicIds),
              eq(userStoriesTable.tenantId, tenantId),
              isNull(userStoriesTable.deletedAt),
            ),
          );

        const storyIds = storyRows.map((row: { id: string }) => row.id);

        // Cascade to tasks
        if (storyIds.length > 0) {
          await tx
            .update(tasksTable)
            .set({ deletedAt: now, updatedAt: now, version: sql`${tasksTable.version} + 1` })
            .where(
              and(
                inArray(tasksTable.userStoryId, storyIds),
                eq(tasksTable.tenantId, tenantId),
                isNull(tasksTable.deletedAt),
              ),
            );
        }

        // Cascade to user stories
        await tx
          .update(userStoriesTable)
          .set({ deletedAt: now, updatedAt: now, version: sql`${userStoriesTable.version} + 1` })
          .where(
            and(
              inArray(userStoriesTable.epicId, epicIds),
              eq(userStoriesTable.tenantId, tenantId),
              isNull(userStoriesTable.deletedAt),
            ),
          );

        // Cascade to epics
        await tx
          .update(epicsTable)
          .set({ deletedAt: now, updatedAt: now, version: sql`${epicsTable.version} + 1` })
          .where(
            and(
              eq(epicsTable.projectId, id),
              eq(epicsTable.tenantId, tenantId),
              isNull(epicsTable.deletedAt),
            ),
          );
      }

      // Soft-delete the project itself with optimistic locking
      const existingVersion = existing.version as number;
      const projectResults = await tx
        .update(projectsTable)
        .set({
          deletedAt: now,
          updatedAt: now,
          version: sql`${projectsTable.version} + 1`,
        })
        .where(
          and(
            eq(projectsTable.id, id),
            eq(projectsTable.tenantId, tenantId),
            eq(projectsTable.version, existingVersion),
            isNull(projectsTable.deletedAt),
          ),
        )
        .returning();

      if (projectResults.length === 0) {
        throw new ConflictError(base.entityName, id, existingVersion);
      }

      return projectResults[0] as ProjectRecord;
    });

    return result;
  };

  // -------------------------------------------------------------------------
  // Find with epic counts
  // -------------------------------------------------------------------------

  /**
   * Returns a project with aggregated epic counts grouped by work status.
   *
   * Uses a SQL aggregation query to efficiently count epics without loading
   * all epic records. The result includes the full project record plus an
   * `epicCounts` array with `{ status, count }` entries.
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param id       - The project UUID to look up
   * @returns The project with epic count aggregation
   * @throws {NotFoundError} If the project does not exist for this tenant
   */
  const findWithEpicCounts = async (
    tenantId: string,
    id: string,
  ): Promise<ProjectWithEpicCounts> => {
    const project = await base.findById(tenantId, id);
    if (!project) {
      throw new NotFoundError(base.entityName, id);
    }

    // Aggregate epic counts by work status
    const epicCountRows = await typedDb
      .select({
        status: epicsTable.workStatus,
        count: count(),
      })
      .from(epicsTable)
      .where(
        and(
          eq(epicsTable.projectId, id),
          eq(epicsTable.tenantId, tenantId),
          isNull(epicsTable.deletedAt),
        ),
      )
      .groupBy(epicsTable.workStatus);

    const epicCounts: EpicStatusCount[] = epicCountRows.map(
      (row: { status: string; count: number }) => ({
        status: row.status,
        count: row.count,
      }),
    );

    return {
      ...(project as ProjectRecord),
      epicCounts,
    };
  };

  // -------------------------------------------------------------------------
  // Find with full stats (for detail endpoint)
  // -------------------------------------------------------------------------

  /**
   * Returns a project with summary statistics: epic counts, story counts,
   * and overall completion percentage.
   *
   * The completion percentage is calculated as the ratio of stories in
   * terminal states ('done', 'skipped') to the total number of stories.
   * If there are no stories, the completion percentage is 0.
   *
   * @param tenantId - The tenant UUID to scope the query to
   * @param id       - The project UUID to look up
   * @returns The project with full statistics
   * @throws {NotFoundError} If the project does not exist for this tenant
   */
  const findWithStats = async (tenantId: string, id: string): Promise<ProjectWithStats> => {
    const project = await base.findById(tenantId, id);
    if (!project) {
      throw new NotFoundError(base.entityName, id);
    }

    // Aggregate epic counts by work status
    const epicCountRows = await typedDb
      .select({
        status: epicsTable.workStatus,
        count: count(),
      })
      .from(epicsTable)
      .where(
        and(
          eq(epicsTable.projectId, id),
          eq(epicsTable.tenantId, tenantId),
          isNull(epicsTable.deletedAt),
        ),
      )
      .groupBy(epicsTable.workStatus);

    const epicCounts: EpicStatusCount[] = epicCountRows.map(
      (row: { status: string; count: number }) => ({
        status: row.status,
        count: row.count,
      }),
    );

    // Aggregate story counts by work status (stories belonging to epics in this project)
    const storyCountRows = await typedDb
      .select({
        status: userStoriesTable.workStatus,
        count: count(),
      })
      .from(userStoriesTable)
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(epicsTable.projectId, id),
          eq(epicsTable.tenantId, tenantId),
          isNull(epicsTable.deletedAt),
          isNull(userStoriesTable.deletedAt),
        ),
      )
      .groupBy(userStoriesTable.workStatus);

    const storyCounts: StoryStatusCount[] = storyCountRows.map(
      (row: { status: string; count: number }) => ({
        status: row.status,
        count: row.count,
      }),
    );

    const totalEpics = epicCounts.reduce((sum, entry) => sum + entry.count, 0);
    const totalStories = storyCounts.reduce((sum, entry) => sum + entry.count, 0);

    // Completion = (done + skipped) / total stories
    const completedStories = storyCounts
      .filter((entry) => entry.status === 'done' || entry.status === 'skipped')
      .reduce((sum, entry) => sum + entry.count, 0);

    const completionPercentage =
      totalStories > 0 ? Math.round((completedStories / totalStories) * 10000) / 100 : 0;

    return {
      ...(project as ProjectRecord),
      epicCounts,
      storyCounts,
      totalEpics,
      totalStories,
      completionPercentage,
    };
  };

  // -------------------------------------------------------------------------
  // Cascade hard-delete
  // -------------------------------------------------------------------------

  /**
   * Hard-deletes a project and cascades to all child entities in a
   * single transaction. Physically removes rows from the database.
   *
   * The cascade order is:
   * 1. Dependency edges (belonging to tasks of stories of epics in this project)
   * 2. Tasks (belonging to stories of epics in this project)
   * 3. User Stories (belonging to epics in this project)
   * 4. Epics (belonging to this project)
   * 5. The project itself
   *
   * @param tenantId - The tenant UUID to scope the operation to
   * @param id       - The project UUID to hard-delete
   * @returns The deleted project record
   * @throws {NotFoundError} If the project does not exist for this tenant
   */
  const hardDeleteCascade = async (tenantId: string, id: string): Promise<ProjectRecord> => {
    const existing = await base.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError(base.entityName, id);
    }

    const result = await typedDb.transaction(async (tx: DrizzleDb) => {
      // Find epic IDs belonging to this project
      const epicRows = await tx
        .select({ id: epicsTable.id })
        .from(epicsTable)
        .where(and(eq(epicsTable.projectId, id), eq(epicsTable.tenantId, tenantId)));

      const epicIds = epicRows.map((row: { id: string }) => row.id);

      if (epicIds.length > 0) {
        // Find story IDs belonging to the affected epics
        const storyRows = await tx
          .select({ id: userStoriesTable.id })
          .from(userStoriesTable)
          .where(
            and(inArray(userStoriesTable.epicId, epicIds), eq(userStoriesTable.tenantId, tenantId)),
          );

        const storyIds = storyRows.map((row: { id: string }) => row.id);

        if (storyIds.length > 0) {
          // Find task IDs belonging to the affected stories
          const taskRows = await tx
            .select({ id: tasksTable.id })
            .from(tasksTable)
            .where(
              and(inArray(tasksTable.userStoryId, storyIds), eq(tasksTable.tenantId, tenantId)),
            );

          const taskIds = taskRows.map((row: { id: string }) => row.id);

          // Delete dependency edges for these tasks
          if (taskIds.length > 0) {
            await tx
              .delete(taskDependencyEdgesTable)
              .where(
                and(
                  eq(taskDependencyEdgesTable.tenantId, tenantId),
                  sql`(${taskDependencyEdgesTable.dependentTaskId} = ANY(${taskIds}) OR ${taskDependencyEdgesTable.prerequisiteTaskId} = ANY(${taskIds}))`,
                ),
              );
          }

          // Delete tasks
          await tx
            .delete(tasksTable)
            .where(
              and(inArray(tasksTable.userStoryId, storyIds), eq(tasksTable.tenantId, tenantId)),
            );
        }

        // Delete user stories
        await tx
          .delete(userStoriesTable)
          .where(
            and(inArray(userStoriesTable.epicId, epicIds), eq(userStoriesTable.tenantId, tenantId)),
          );

        // Delete epics
        await tx
          .delete(epicsTable)
          .where(and(eq(epicsTable.projectId, id), eq(epicsTable.tenantId, tenantId)));
      }

      // Delete the project itself
      const projectResults = await tx
        .delete(projectsTable)
        .where(and(eq(projectsTable.id, id), eq(projectsTable.tenantId, tenantId)))
        .returning();

      if (projectResults.length === 0) {
        throw new NotFoundError(base.entityName, id);
      }

      return projectResults[0] as ProjectRecord;
    });

    return result;
  };

  // -------------------------------------------------------------------------
  // Update work status
  // -------------------------------------------------------------------------

  /**
   * Updates the derived work status of a project.
   *
   * This method is called by upstream orchestration logic when child epic
   * statuses change, triggering a recalculation of the project's aggregate
   * work status.
   *
   * Uses optimistic locking internally -- reads the current version, then
   * updates with that version as the expected value.
   *
   * @param tenantId  - The tenant UUID to scope the update to
   * @param id        - The project UUID to update
   * @param newStatus - The new work status value
   * @returns The updated project record
   * @throws {NotFoundError} If the project does not exist for this tenant
   * @throws {ConflictError} If a concurrent modification occurred
   */
  const updateWorkStatus = async (
    tenantId: string,
    id: string,
    newStatus: WorkStatus,
  ): Promise<ProjectRecord> => {
    const existing = await base.findById(tenantId, id);
    if (!existing) {
      throw new NotFoundError(base.entityName, id);
    }

    return base.update(
      tenantId,
      id,
      { workStatus: newStatus },
      existing.version as number,
    ) as Promise<ProjectRecord>;
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    /** Find a project by ID within a tenant scope — explicitly typed for correct .d.ts emission */
    findById: (tenantId: string, id: string): Promise<ProjectRecord | null> =>
      base.findById(tenantId, id) as Promise<ProjectRecord | null>,
    /** Find multiple projects with pagination (base, no status filters) — explicitly typed */
    findMany: (
      tenantId: string,
      options?: FindManyOptions,
    ): Promise<PaginatedResult<ProjectRecord>> =>
      base.findMany(tenantId, options) as Promise<PaginatedResult<ProjectRecord>>,
    /** Create a new project with draft/pending defaults */
    create,
    /** Update a project with lifecycle status validation */
    update,
    /** Find paginated projects with optional status filters */
    findByTenant,
    /** Cascade soft-delete project and all children */
    softDelete,
    /** Find a project with aggregated epic counts by status */
    findWithEpicCounts,
    /** Find a project with full summary statistics (epic counts, story counts, completion) */
    findWithStats,
    /** Update the derived work status */
    updateWorkStatus,
    /** Hard-delete for testing/cleanup — explicitly typed for correct .d.ts emission */
    hardDelete: (tenantId: string, id: string): Promise<ProjectRecord | null> =>
      base.hardDelete(tenantId, id) as Promise<ProjectRecord | null>,
    /** Cascade hard-delete project and all children in a transaction */
    hardDeleteCascade,
    /** The underlying database client */
    db: base.db,
    /** The Drizzle table definition */
    table: base.table,
    /** The entity name for error messages */
    entityName: base.entityName,
  };
};

/** Inferred return type of the project repository factory */
export type ProjectRepository = ReturnType<typeof createProjectRepository>;
