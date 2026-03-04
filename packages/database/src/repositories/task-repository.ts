/**
 * @module task-repository
 *
 * Task repository providing CRUD operations for tasks within user stories,
 * dependency edge management for DAG construction, and bulk status updates
 * for cascading status changes.
 *
 * Tasks are the atomic units of work in the hierarchy:
 *   project > epic > story > task
 *
 * Each task can have dependency edges forming a DAG. Cycle detection is NOT
 * handled here — it is the responsibility of the domain layer's DAG module.
 * This repository only manages CRUD for tasks and their dependency edges.
 *
 * All methods enforce:
 * - **Tenant scoping** — every query requires a `tenantId` parameter
 * - **Soft-delete filtering** — reads exclude rows where `deleted_at IS NOT NULL`
 * - **Optimistic locking** — updates require `expectedVersion` (where applicable)
 */

import {
  eq,
  and,
  isNull,
  sql,
  count,
  asc,
  desc,
  inArray,
  or,
  notExists,
  aliasedTable,
  type SQL,
  type InferSelectModel,
} from 'drizzle-orm';

import { taskDependencyEdgesTable } from '../schema/dependency-edges';
import { epicsTable } from '../schema/epics';
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
import type { PaginationQuery } from '@laila/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A fully hydrated task row from the database. */
export type Task = InferSelectModel<typeof tasksTable>;

/** A fully hydrated dependency edge row from the database. */
export type TaskDependencyEdge = InferSelectModel<typeof taskDependencyEdgesTable>;

/** The shape returned by `getTaskGraph` — all data needed for DAG construction. */
export interface TaskGraph {
  tasks: Task[];
  edges: TaskDependencyEdge[];
}

/** Fields accepted when creating a new task. */
export interface CreateTaskData {
  title: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  technicalNotes?: string | null;
  personaId?: string | null;
  references?: Array<{ type: string; url: string; title: string }>;
}

/** Fields accepted when updating an existing task. */
export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  acceptanceCriteria?: string[];
  technicalNotes?: string | null;
  personaId?: string | null;
  workStatus?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
  references?: Array<{ type: string; url: string; title: string }>;
}

/** Summary of a task used in dependency/dependent resolution. */
export interface TaskSummary {
  id: string;
  title: string;
  workStatus: string;
}

/** Options for finding tasks with cross-entity filters. */
export interface FindTasksOptions {
  pagination?: PaginationQuery;
  projectId?: string;
  storyId?: string;
  status?: string;
  personaId?: string;
}

/** A task with its dependency IDs attached. */
export interface TaskWithDependencyIds extends Task {
  dependencyIds: string[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a task repository instance with dependency edge management.
 *
 * Composes the base repository (tenant-scoped CRUD) with task-specific
 * methods for dependency management, graph queries, and bulk operations.
 *
 * @param db - A Drizzle database client (HTTP or pool mode)
 * @returns A task repository with all CRUD and graph methods
 */
export const createTaskRepository = (db: Database | PoolDatabase) => {
  const base = createBaseRepository(tasksTable as unknown as BaseTable, db);
  const typedDb = asDrizzle(db);

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Creates a new task within a user story with `work_status = 'pending'`.
   *
   * @param tenantId    - The tenant UUID for isolation
   * @param userStoryId - The parent user story UUID
   * @param data        - Task fields (title, description, etc.)
   * @returns The newly created task record
   */
  const create = async (
    tenantId: string,
    userStoryId: string,
    data: CreateTaskData,
  ): Promise<Task> => {
    return base.create(tenantId, {
      userStoryId,
      title: data.title,
      description: data.description ?? null,
      acceptanceCriteria: data.acceptanceCriteria ?? [],
      technicalNotes: data.technicalNotes ?? null,
      personaId: data.personaId ?? null,
      workStatus: 'pending',
      references: data.references ?? [],
    }) as Promise<Task>;
  };

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * Updates task fields with optimistic locking.
   *
   * @param tenantId        - The tenant UUID for isolation
   * @param id              - The task UUID to update
   * @param data            - Partial task fields to update
   * @param expectedVersion - The version the caller expects (for optimistic locking)
   * @returns The updated task record
   * @throws {ConflictError} If the version does not match
   */
  const update = async (
    tenantId: string,
    id: string,
    data: UpdateTaskData,
    expectedVersion: number,
  ): Promise<Task> => {
    return base.update(tenantId, id, data, expectedVersion) as Promise<Task>;
  };

  // -------------------------------------------------------------------------
  // Query: findByStory
  // -------------------------------------------------------------------------

  /**
   * Returns paginated tasks for a given user story.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param storyId  - The user story UUID to filter by
   * @param options  - Pagination and sorting options
   * @returns Paginated result with tasks and metadata
   */
  const findByStory = async (
    tenantId: string,
    storyId: string,
    options: FindManyOptions = {},
  ): Promise<PaginatedResult<Task>> => {
    return base.findMany(tenantId, {
      ...options,
      filters: options.filters
        ? and(eq(tasksTable.userStoryId, storyId), options.filters)
        : eq(tasksTable.userStoryId, storyId),
    }) as Promise<PaginatedResult<Task>>;
  };

  // -------------------------------------------------------------------------
  // Dependency edge management
  // -------------------------------------------------------------------------

  /**
   * Creates a dependency edge between two tasks.
   *
   * Validates:
   * - No self-loop (dependent !== prerequisite)
   * - Both tasks exist and belong to the specified tenant
   *
   * The database-level unique constraint prevents duplicate edges.
   * Cycle detection is NOT performed here — that is the domain layer's
   * responsibility.
   *
   * @param tenantId           - The tenant UUID for isolation
   * @param dependentTaskId    - The task that depends on the prerequisite
   * @param prerequisiteTaskId - The task that must complete first
   * @returns The created dependency edge record
   * @throws {ValidationError} If the task would depend on itself
   * @throws {NotFoundError} If either task does not exist for this tenant
   */
  const addDependency = async (
    tenantId: string,
    dependentTaskId: string,
    prerequisiteTaskId: string,
  ): Promise<TaskDependencyEdge> => {
    if (dependentTaskId === prerequisiteTaskId) {
      throw new ValidationError('dependentTaskId', 'A task cannot depend on itself');
    }

    // Validate both tasks exist and belong to the same tenant
    const [dependent, prerequisite] = await Promise.all([
      base.findById(tenantId, dependentTaskId),
      base.findById(tenantId, prerequisiteTaskId),
    ]);

    if (!dependent) {
      throw new NotFoundError('Task', dependentTaskId);
    }

    if (!prerequisite) {
      throw new NotFoundError('Task', prerequisiteTaskId);
    }

    // Insert the edge (unique constraint prevents duplicates)
    const results = await typedDb
      .insert(taskDependencyEdgesTable)
      .values({
        tenantId,
        dependentTaskId,
        prerequisiteTaskId,
      })
      .returning();

    return results[0] as TaskDependencyEdge;
  };

  /**
   * Removes a dependency edge between two tasks.
   *
   * @param tenantId           - The tenant UUID for isolation
   * @param dependentTaskId    - The dependent task UUID
   * @param prerequisiteTaskId - The prerequisite task UUID
   * @returns The removed edge, or `null` if no matching edge existed
   */
  const removeDependency = async (
    tenantId: string,
    dependentTaskId: string,
    prerequisiteTaskId: string,
  ): Promise<TaskDependencyEdge | null> => {
    const results = await typedDb
      .delete(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          eq(taskDependencyEdgesTable.dependentTaskId, dependentTaskId),
          eq(taskDependencyEdgesTable.prerequisiteTaskId, prerequisiteTaskId),
        ),
      )
      .returning();

    return results[0] ?? null;
  };

  /**
   * Returns all prerequisite tasks for a given task.
   *
   * These are the tasks that must complete before `taskId` can start.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID whose prerequisites to find
   * @returns Array of prerequisite task records
   */
  const getDependencies = async (tenantId: string, taskId: string): Promise<Task[]> => {
    const edges = await typedDb
      .select()
      .from(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          eq(taskDependencyEdgesTable.dependentTaskId, taskId),
        ),
      );

    if (edges.length === 0) {
      return [];
    }

    const prerequisiteIds = edges.map((edge: TaskDependencyEdge) => edge.prerequisiteTaskId);

    const tasks = await typedDb
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          inArray(tasksTable.id, prerequisiteIds),
        ),
      );

    return tasks as Task[];
  };

  /**
   * Returns all tasks that depend on a given task.
   *
   * These are the tasks that are waiting for `taskId` to complete.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID whose dependents to find
   * @returns Array of dependent task records
   */
  const getDependents = async (tenantId: string, taskId: string): Promise<Task[]> => {
    const edges = await typedDb
      .select()
      .from(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          eq(taskDependencyEdgesTable.prerequisiteTaskId, taskId),
        ),
      );

    if (edges.length === 0) {
      return [];
    }

    const dependentIds = edges.map((edge: TaskDependencyEdge) => edge.dependentTaskId);

    const tasks = await typedDb
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          inArray(tasksTable.id, dependentIds),
        ),
      );

    return tasks as Task[];
  };

  // -------------------------------------------------------------------------
  // Graph queries
  // -------------------------------------------------------------------------

  /**
   * Returns all tasks and dependency edges for a project.
   *
   * Joins through stories and epics to filter tasks by project. Returns
   * the full dataset needed by the domain layer to construct and validate
   * the DAG.
   *
   * @param tenantId  - The tenant UUID for isolation
   * @param projectId - The project UUID to scope the graph to
   * @returns All tasks and edges for DAG construction
   */
  const getTaskGraph = async (tenantId: string, projectId: string): Promise<TaskGraph> => {
    // Get all tasks for the project by joining through stories and epics
    const tasks = await typedDb
      .select({
        id: tasksTable.id,
        tenantId: tasksTable.tenantId,
        userStoryId: tasksTable.userStoryId,
        title: tasksTable.title,
        description: tasksTable.description,
        acceptanceCriteria: tasksTable.acceptanceCriteria,
        technicalNotes: tasksTable.technicalNotes,
        personaId: tasksTable.personaId,
        workStatus: tasksTable.workStatus,
        startedAt: tasksTable.startedAt,
        completedAt: tasksTable.completedAt,
        references: tasksTable.references,
        version: tasksTable.version,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
        deletedAt: tasksTable.deletedAt,
      })
      .from(tasksTable)
      .innerJoin(userStoriesTable, eq(tasksTable.userStoryId, userStoriesTable.id))
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          eq(epicsTable.projectId, projectId),
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      );

    // Get all task IDs in this project to filter edges
    const taskIds = (tasks as Task[]).map((t) => t.id);

    // If there are no tasks, return early with empty edges
    if (taskIds.length === 0) {
      return { tasks: tasks as Task[], edges: [] };
    }

    // Get all dependency edges where BOTH tasks belong to this project
    const edges = await typedDb
      .select()
      .from(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          inArray(taskDependencyEdgesTable.dependentTaskId, taskIds),
          inArray(taskDependencyEdgesTable.prerequisiteTaskId, taskIds),
        ),
      );

    return { tasks: tasks as Task[], edges: edges as TaskDependencyEdge[] };
  };

  // -------------------------------------------------------------------------
  // Bulk operations
  // -------------------------------------------------------------------------

  /**
   * Updates the work status for multiple tasks in a single query.
   *
   * Used for cascading status changes when a story is assigned or completed.
   * Enforces tenant scoping and soft-delete filtering. Also increments
   * the version and updates `updatedAt` for each affected row.
   *
   * @param tenantId  - The tenant UUID for isolation
   * @param taskIds   - Array of task UUIDs to update
   * @param newStatus - The new work status to set
   * @returns The number of rows affected
   */
  const bulkUpdateStatus = async (
    tenantId: string,
    taskIds: string[],
    newStatus: string,
  ): Promise<number> => {
    if (taskIds.length === 0) {
      return 0;
    }

    const results = await typedDb
      .update(tasksTable)
      .set({
        workStatus: newStatus,
        version: sql`${tasksTable.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          inArray(tasksTable.id, taskIds),
        ),
      )
      .returning();

    return results.length;
  };

  // -------------------------------------------------------------------------
  // resetInProgressTasksByStory (transactional, for timeout reclamation)
  // -------------------------------------------------------------------------

  /**
   * Resets all in-progress tasks within a story to 'not_started' (DB: 'pending').
   *
   * Completed tasks ('done') are preserved. Only tasks with `work_status =
   * 'in_progress'` are reset. This is used during timeout reclamation to
   * return partially-executed story tasks to an assignable state.
   *
   * @param tenantId - The tenant UUID for data isolation
   * @param storyId  - The story UUID whose in-progress tasks should be reset
   * @param tx       - The database transaction handle
   * @returns The number of tasks that were reset
   */
  const resetInProgressTasksByStory = async (
    tenantId: string,
    storyId: string,
    tx: DrizzleDb,
  ): Promise<number> => {
    const now = new Date();

    const results = await tx
      .update(tasksTable)
      .set({
        workStatus: 'pending',
        startedAt: null,
        completedAt: null,
        version: sql`${tasksTable.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          eq(tasksTable.userStoryId, storyId),
          eq(tasksTable.workStatus, 'in_progress'),
          isNull(tasksTable.deletedAt),
        ),
      )
      .returning();

    return results.length;
  };

  // -------------------------------------------------------------------------
  // getTaskStatusSnapshot (transactional, for attempt history)
  // -------------------------------------------------------------------------

  /**
   * Captures a snapshot of all task statuses within a story.
   *
   * Returns a record mapping task IDs to their current work status.
   * Used when creating attempt history records to preserve the state
   * of tasks at the time of timeout or failure.
   *
   * @param tenantId - The tenant UUID for data isolation
   * @param storyId  - The story UUID to capture task statuses for
   * @param tx       - The database transaction handle
   * @returns A record mapping task IDs to their work status strings
   */
  const getTaskStatusSnapshot = async (
    tenantId: string,
    storyId: string,
    tx: DrizzleDb,
  ): Promise<Record<string, string>> => {
    const tasks = await tx
      .select({
        id: tasksTable.id,
        workStatus: tasksTable.workStatus,
      })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          eq(tasksTable.userStoryId, storyId),
          isNull(tasksTable.deletedAt),
        ),
      );

    const snapshot: Record<string, string> = {};
    for (const task of tasks) {
      snapshot[task.id] = task.workStatus;
    }
    return snapshot;
  };

  // -------------------------------------------------------------------------
  // Reconciler query
  // -------------------------------------------------------------------------

  /**
   * Finds tasks that are currently `blocked` but whose prerequisites are
   * all complete (work_status = 'done').
   *
   * Used by the DAG reconciler to discover tasks that should be unblocked.
   * Implements a NOT EXISTS subquery pattern:
   *
   * ```sql
   * SELECT t.* FROM tasks t
   * WHERE t.work_status = 'blocked'
   *   AND t.tenant_id = $1
   *   AND t.deleted_at IS NULL
   *   AND NOT EXISTS (
   *     SELECT 1 FROM task_dependency_edges e
   *     JOIN tasks prereq ON prereq.id = e.prerequisite_task_id
   *     WHERE e.dependent_task_id = t.id
   *       AND prereq.work_status != 'done'
   *   )
   * ```
   *
   * @param tenantId  - The tenant UUID for isolation
   * @param projectId - The project UUID to scope the search to
   * @returns Array of tasks ready to be unblocked
   */
  const findBlockedTasks = async (tenantId: string, projectId: string): Promise<Task[]> => {
    // First, get all task IDs in this project to scope the query
    const projectTaskIds = await typedDb
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .innerJoin(userStoriesTable, eq(tasksTable.userStoryId, userStoriesTable.id))
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          eq(epicsTable.projectId, projectId),
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      );

    const taskIds = projectTaskIds.map((r: { id: string }) => r.id);

    if (taskIds.length === 0) {
      return [];
    }

    // Alias the tasks table for the inner subquery to avoid ambiguity
    // with the outer query's reference to tasksTable
    const prereqTasks = aliasedTable(tasksTable, 'prereq');

    // Find blocked tasks whose ALL prerequisites are 'done'
    // using NOT EXISTS subquery pattern:
    //
    //   SELECT t.* FROM tasks t
    //   WHERE t.work_status = 'blocked'
    //     AND t.tenant_id = $tenantId
    //     AND t.deleted_at IS NULL
    //     AND t.id IN ($taskIds)
    //     AND NOT EXISTS (
    //       SELECT 1 FROM task_dependency_edges e
    //       JOIN tasks prereq ON prereq.id = e.prerequisite_task_id
    //       WHERE e.dependent_task_id = t.id
    //         AND prereq.work_status != 'done'
    //     )
    const blockedTasks = await typedDb
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          eq(tasksTable.workStatus, 'blocked'),
          inArray(tasksTable.id, taskIds),
          notExists(
            typedDb
              .select({ one: sql`1` })
              .from(taskDependencyEdgesTable)
              .innerJoin(
                prereqTasks,
                eq(prereqTasks.id, taskDependencyEdgesTable.prerequisiteTaskId),
              )
              .where(
                and(
                  eq(taskDependencyEdgesTable.dependentTaskId, tasksTable.id),
                  sql`${prereqTasks.workStatus} != 'done'`,
                ),
              ),
          ),
        ),
      );

    return blockedTasks as Task[];
  };

  // -------------------------------------------------------------------------
  // Filtered list query (for GET /api/v1/tasks)
  // -------------------------------------------------------------------------

  /**
   * Returns paginated tasks with optional cross-entity filters.
   *
   * Supports filtering by project (joins through stories and epics),
   * story, status, and persona. Each task includes its dependency IDs
   * for display in list views.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param options  - Filters and pagination parameters
   * @returns Paginated result with tasks and dependency IDs
   */
  const findWithFilters = async (
    tenantId: string,
    options: FindTasksOptions = {},
  ): Promise<PaginatedResult<TaskWithDependencyIds>> => {
    const {
      pagination: paginationParams = {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      },
      projectId,
      storyId,
      status,
      personaId,
    } = options;

    const { page, limit, sortBy, sortOrder } = paginationParams;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions: SQL[] = [eq(tasksTable.tenantId, tenantId), isNull(tasksTable.deletedAt)];

    // If filtering by project, we need to join through stories and epics
    const needsProjectJoin = projectId !== undefined;

    if (storyId) {
      conditions.push(eq(tasksTable.userStoryId, storyId));
    }
    if (status) {
      conditions.push(eq(tasksTable.workStatus, status));
    }
    if (personaId) {
      conditions.push(eq(tasksTable.personaId, personaId));
    }

    if (needsProjectJoin) {
      conditions.push(isNull(userStoriesTable.deletedAt));
      conditions.push(isNull(epicsTable.deletedAt));
      conditions.push(eq(epicsTable.projectId, projectId));
    }

    const whereClause = and(...conditions) as SQL;

    // Resolve sort column on the tasks table
    const sortColumnMap = {
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
      title: tasksTable.title,
      workStatus: tasksTable.workStatus,
    } as unknown as Record<string, typeof tasksTable.createdAt>;
    const sortColumn = sortColumnMap[sortBy] ?? tasksTable.createdAt;
    const orderDirection = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    // Build queries based on whether project join is needed
    if (needsProjectJoin) {
      const [countResult, data] = await Promise.all([
        typedDb
          .select({ total: count() })
          .from(tasksTable)
          .innerJoin(userStoriesTable, eq(tasksTable.userStoryId, userStoriesTable.id))
          .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
          .where(whereClause) as Promise<{ total: number }[]>,
        typedDb
          .select({
            id: tasksTable.id,
            tenantId: tasksTable.tenantId,
            userStoryId: tasksTable.userStoryId,
            title: tasksTable.title,
            description: tasksTable.description,
            acceptanceCriteria: tasksTable.acceptanceCriteria,
            technicalNotes: tasksTable.technicalNotes,
            personaId: tasksTable.personaId,
            workStatus: tasksTable.workStatus,
            startedAt: tasksTable.startedAt,
            completedAt: tasksTable.completedAt,
            references: tasksTable.references,
            version: tasksTable.version,
            createdAt: tasksTable.createdAt,
            updatedAt: tasksTable.updatedAt,
            deletedAt: tasksTable.deletedAt,
          })
          .from(tasksTable)
          .innerJoin(userStoriesTable, eq(tasksTable.userStoryId, userStoriesTable.id))
          .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
          .where(whereClause)
          .orderBy(orderDirection)
          .limit(limit)
          .offset(offset) as Promise<Task[]>,
      ]);

      const total = countResult[0]?.total ?? 0;
      const pagination = base.computePaginationMeta(total, page, limit);

      // Attach dependency IDs to each task
      const tasksWithDeps = await attachDependencyIds(tenantId, data);

      return { data: tasksWithDeps, pagination };
    }

    // Simple query without project join
    const [countResult, data] = await Promise.all([
      typedDb.select({ total: count() }).from(tasksTable).where(whereClause) as Promise<
        { total: number }[]
      >,
      typedDb
        .select()
        .from(tasksTable)
        .where(whereClause)
        .orderBy(orderDirection)
        .limit(limit)
        .offset(offset) as Promise<Task[]>,
    ]);

    const total = countResult[0]?.total ?? 0;
    const pagination = base.computePaginationMeta(total, page, limit);

    // Attach dependency IDs to each task
    const tasksWithDeps = await attachDependencyIds(tenantId, data);

    return { data: tasksWithDeps, pagination };
  };

  /**
   * Attaches dependency IDs (prerequisite task IDs) to an array of tasks.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param tasks    - Array of task records
   * @returns Tasks with dependencyIds attached
   */
  const attachDependencyIds = async (
    tenantId: string,
    tasks: Task[],
  ): Promise<TaskWithDependencyIds[]> => {
    if (tasks.length === 0) {
      return [];
    }

    const taskIds = tasks.map((t) => t.id);

    const edges = await typedDb
      .select({
        dependentTaskId: taskDependencyEdgesTable.dependentTaskId,
        prerequisiteTaskId: taskDependencyEdgesTable.prerequisiteTaskId,
      })
      .from(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          inArray(taskDependencyEdgesTable.dependentTaskId, taskIds),
        ),
      );

    // Group prerequisite IDs by dependent task ID
    const depMap = new Map<string, string[]>();
    for (const edge of edges) {
      const existing = depMap.get(edge.dependentTaskId);
      if (existing) {
        existing.push(edge.prerequisiteTaskId);
      } else {
        depMap.set(edge.dependentTaskId, [edge.prerequisiteTaskId]);
      }
    }

    return tasks.map((task) => ({
      ...task,
      dependencyIds: depMap.get(task.id) ?? [],
    }));
  };

  // -------------------------------------------------------------------------
  // Detail query (for GET /api/v1/tasks/:id)
  // -------------------------------------------------------------------------

  /**
   * Returns a task with resolved dependency and dependent summaries.
   *
   * Dependencies are tasks this task depends on (prerequisites).
   * Dependents are tasks that depend on this task (downstream).
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID to look up
   * @returns Task with dependency/dependent summaries, or null if not found
   */
  const findDetailById = async (
    tenantId: string,
    taskId: string,
  ): Promise<{ task: Task; dependencies: TaskSummary[]; dependents: TaskSummary[] } | null> => {
    const result = await base.findById(tenantId, taskId);
    if (!result) {
      return null;
    }

    const task = result as Task;

    // Fetch dependencies and dependents in parallel
    const [dependencies, dependents] = await Promise.all([
      getDependencies(tenantId, taskId),
      getDependents(tenantId, taskId),
    ]);

    const toSummary = (t: Task): TaskSummary => ({
      id: t.id,
      title: t.title,
      workStatus: t.workStatus,
    });

    return {
      task,
      dependencies: dependencies.map(toSummary),
      dependents: dependents.map(toSummary),
    };
  };

  // -------------------------------------------------------------------------
  // Dependency replacement (for POST/PATCH with dependency_ids)
  // -------------------------------------------------------------------------

  /**
   * Atomically replaces all dependency edges for a task.
   *
   * Implements the "replace all" strategy:
   * 1. Delete all existing edges where this task is the dependent
   * 2. Insert new edges for each prerequisite task ID
   *
   * Does NOT perform cycle detection -- that is the caller's responsibility
   * (using the domain layer's DAG module after this method succeeds).
   *
   * @param tenantId          - The tenant UUID for isolation
   * @param dependentTaskId   - The task whose dependencies are being replaced
   * @param prerequisiteIds   - Array of prerequisite task UUIDs
   */
  const replaceDependencies = async (
    tenantId: string,
    dependentTaskId: string,
    prerequisiteIds: string[],
  ): Promise<void> => {
    // Step 1: Delete all existing outgoing dependency edges for this task
    await typedDb
      .delete(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          eq(taskDependencyEdgesTable.dependentTaskId, dependentTaskId),
        ),
      );

    // Step 2: Insert new edges (if any)
    if (prerequisiteIds.length > 0) {
      const edgeValues = prerequisiteIds.map((prerequisiteTaskId) => ({
        tenantId,
        dependentTaskId,
        prerequisiteTaskId,
      }));

      await typedDb.insert(taskDependencyEdgesTable).values(edgeValues);
    }
  };

  // -------------------------------------------------------------------------
  // Dependency cleanup (for DELETE soft-delete)
  // -------------------------------------------------------------------------

  /**
   * Removes all dependency edges where the specified task is either
   * a dependent or a prerequisite. Used during soft-delete cleanup.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID whose edges should be removed
   */
  const removeAllEdges = async (tenantId: string, taskId: string): Promise<void> => {
    await typedDb
      .delete(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          or(
            eq(taskDependencyEdgesTable.dependentTaskId, taskId),
            eq(taskDependencyEdgesTable.prerequisiteTaskId, taskId),
          ),
        ),
      );
  };

  // -------------------------------------------------------------------------
  // Story lookup helper (for read-only enforcement)
  // -------------------------------------------------------------------------

  /**
   * Returns the parent story record for a given task.
   * Used to check the story's work status for read-only enforcement.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID
   * @returns The parent story, or null if the task or story is not found
   */
  const getParentStory = async (
    tenantId: string,
    taskId: string,
  ): Promise<InferSelectModel<typeof userStoriesTable> | null> => {
    const result = await base.findById(tenantId, taskId);
    if (!result) {
      return null;
    }

    const task = result as Task;

    const stories = await typedDb
      .select()
      .from(userStoriesTable)
      .where(
        and(
          eq(userStoriesTable.id, task.userStoryId),
          eq(userStoriesTable.tenantId, tenantId),
          isNull(userStoriesTable.deletedAt),
        ),
      )
      .limit(1);

    const story = stories[0];
    if (!story) {
      return null;
    }
    return story as InferSelectModel<typeof userStoriesTable>;
  };

  /**
   * Returns the project ID for a given story by joining through epics.
   * Used for cross-project dependency validation.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param storyId  - The story UUID
   * @returns The project ID, or null if the story is not found
   */
  const getProjectIdForStory = async (
    tenantId: string,
    storyId: string,
  ): Promise<string | null> => {
    const result = await typedDb
      .select({ projectId: epicsTable.projectId })
      .from(userStoriesTable)
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(userStoriesTable.id, storyId),
          eq(userStoriesTable.tenantId, tenantId),
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      )
      .limit(1);

    const row = result[0];
    if (!row) {
      return null;
    }
    return row.projectId;
  };

  /**
   * Returns the project ID for a given task by joining through stories and epics.
   * Used for cross-project dependency validation.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID
   * @returns The project ID, or null if the task is not found
   */
  const getProjectIdForTask = async (tenantId: string, taskId: string): Promise<string | null> => {
    const result = await typedDb
      .select({ projectId: epicsTable.projectId })
      .from(tasksTable)
      .innerJoin(userStoriesTable, eq(tasksTable.userStoryId, userStoriesTable.id))
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      )
      .limit(1);

    const row = result[0];
    if (!row) {
      return null;
    }
    return row.projectId;
  };

  // -------------------------------------------------------------------------
  // Transaction support
  // -------------------------------------------------------------------------

  /**
   * Executes a callback within a database transaction.
   *
   * The callback receives a `DrizzleDb` transaction handle that has the
   * same query builder API as the main database client. All queries issued
   * through `tx` are part of the transaction and will be rolled back on error.
   *
   * @param fn - Async callback receiving the transaction handle
   * @returns The return value of the callback
   */
  const withTransaction = <T>(fn: (tx: DrizzleDb) => Promise<T>): Promise<T> => {
    return typedDb.transaction(async (tx: DrizzleDb) => fn(tx));
  };

  /**
   * Creates a new task within a transaction.
   *
   * Same logic as `create` but uses the provided transaction handle
   * so the task insert can be part of a larger atomic operation.
   *
   * @param tenantId    - The tenant UUID for isolation
   * @param userStoryId - The parent user story UUID
   * @param data        - Task fields (title, description, etc.)
   * @param tx          - The database transaction handle
   * @returns The newly created task record
   */
  const createInTx = async (
    tenantId: string,
    userStoryId: string,
    data: CreateTaskData,
    tx: DrizzleDb,
  ): Promise<Task> => {
    const results = await tx
      .insert(tasksTable)
      .values({
        tenantId,
        userStoryId,
        title: data.title,
        description: data.description ?? null,
        acceptanceCriteria: data.acceptanceCriteria ?? [],
        technicalNotes: data.technicalNotes ?? null,
        personaId: data.personaId ?? null,
        workStatus: 'pending',
        references: data.references ?? [],
      })
      .returning();

    return results[0] as Task;
  };

  /**
   * Updates task fields with optimistic locking within a transaction.
   *
   * Same logic as `update` but uses the provided transaction handle
   * so the task update can be part of a larger atomic operation.
   *
   * @param tenantId        - The tenant UUID for isolation
   * @param id              - The task UUID to update
   * @param data            - Partial task fields to update
   * @param expectedVersion - The version the caller expects (for optimistic locking)
   * @param tx              - The database transaction handle
   * @returns The updated task record
   * @throws {ConflictError} If the version does not match
   */
  const updateInTx = async (
    tenantId: string,
    id: string,
    data: UpdateTaskData,
    expectedVersion: number,
    tx: DrizzleDb,
  ): Promise<Task> => {
    const results = await tx
      .update(tasksTable)
      .set({
        ...data,
        version: sql`${tasksTable.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasksTable.id, id),
          eq(tasksTable.tenantId, tenantId),
          eq(tasksTable.version, expectedVersion),
          isNull(tasksTable.deletedAt),
        ),
      )
      .returning();

    if (results.length === 0) {
      throw new ConflictError(base.entityName, id, expectedVersion);
    }

    return results[0] as Task;
  };

  /**
   * Returns all dependency edges for a project within a transaction.
   *
   * Loads the full set of edges needed for DAG cycle detection.
   * Must be called within a transaction to prevent TOCTOU races.
   *
   * @param tenantId  - The tenant UUID for isolation
   * @param projectId - The project UUID to scope the graph to
   * @param tx        - The database transaction handle
   * @returns All dependency edges for the project
   */
  const getProjectEdgesInTx = async (
    tenantId: string,
    projectId: string,
    tx: DrizzleDb,
  ): Promise<TaskDependencyEdge[]> => {
    // Get all task IDs for the project
    const tasks = await tx
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .innerJoin(userStoriesTable, eq(tasksTable.userStoryId, userStoriesTable.id))
      .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
      .where(
        and(
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
          eq(epicsTable.projectId, projectId),
          isNull(userStoriesTable.deletedAt),
          isNull(epicsTable.deletedAt),
        ),
      );

    const taskIds = tasks.map((t: { id: string }) => t.id);

    if (taskIds.length === 0) {
      return [];
    }

    const edges = await tx
      .select()
      .from(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          inArray(taskDependencyEdgesTable.dependentTaskId, taskIds),
          inArray(taskDependencyEdgesTable.prerequisiteTaskId, taskIds),
        ),
      );

    return edges as TaskDependencyEdge[];
  };

  /**
   * Atomically replaces all dependency edges for a task within a transaction.
   *
   * Same logic as `replaceDependencies` but operates on a transaction handle
   * to ensure TOCTOU safety when combined with cycle detection.
   *
   * @param tenantId          - The tenant UUID for isolation
   * @param dependentTaskId   - The task whose dependencies are being replaced
   * @param prerequisiteIds   - Array of prerequisite task UUIDs
   * @param tx                - The database transaction handle
   */
  const replaceDependenciesInTx = async (
    tenantId: string,
    dependentTaskId: string,
    prerequisiteIds: string[],
    tx: DrizzleDb,
  ): Promise<void> => {
    // Delete all existing outgoing dependency edges for this task
    await tx
      .delete(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          eq(taskDependencyEdgesTable.dependentTaskId, dependentTaskId),
        ),
      );

    // Insert new edges (if any)
    if (prerequisiteIds.length > 0) {
      const edgeValues = prerequisiteIds.map((prerequisiteTaskId) => ({
        tenantId,
        dependentTaskId,
        prerequisiteTaskId,
      }));

      await tx.insert(taskDependencyEdgesTable).values(edgeValues);
    }
  };

  /**
   * Finds tasks that depend on a given task (i.e., the task is their prerequisite).
   * Returns only the task IDs, not full records.
   *
   * Used during soft-delete cleanup to identify tasks that may need
   * status re-evaluation after their prerequisite is removed.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID whose dependents to find
   * @param tx       - The database transaction handle
   * @returns Array of dependent task IDs
   */
  const getDependentIdsInTx = async (
    tenantId: string,
    taskId: string,
    tx: DrizzleDb,
  ): Promise<string[]> => {
    const edges = await tx
      .select({ dependentTaskId: taskDependencyEdgesTable.dependentTaskId })
      .from(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          eq(taskDependencyEdgesTable.prerequisiteTaskId, taskId),
        ),
      );

    return edges.map((e: { dependentTaskId: string }) => e.dependentTaskId);
  };

  /**
   * Removes all dependency edges referencing a task within a transaction.
   *
   * Used during soft-delete to atomically clean up all edges where the
   * deleted task is either a dependent or a prerequisite.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID whose edges should be removed
   * @param tx       - The database transaction handle
   */
  const removeAllEdgesInTx = async (
    tenantId: string,
    taskId: string,
    tx: DrizzleDb,
  ): Promise<void> => {
    await tx
      .delete(taskDependencyEdgesTable)
      .where(
        and(
          eq(taskDependencyEdgesTable.tenantId, tenantId),
          or(
            eq(taskDependencyEdgesTable.dependentTaskId, taskId),
            eq(taskDependencyEdgesTable.prerequisiteTaskId, taskId),
          ),
        ),
      );
  };

  /**
   * Soft-deletes a task within a transaction.
   *
   * Sets the `deleted_at` timestamp, increments version, and updates
   * `updated_at`. Used in conjunction with `removeAllEdgesInTx` to
   * atomically clean up edges and soft-delete the task.
   *
   * @param tenantId - The tenant UUID for isolation
   * @param taskId   - The task UUID to soft-delete
   * @param tx       - The database transaction handle
   * @returns The soft-deleted task record, or null if not found
   */
  const softDeleteInTx = async (
    tenantId: string,
    taskId: string,
    tx: DrizzleDb,
  ): Promise<Task | null> => {
    const results = await tx
      .update(tasksTable)
      .set({
        deletedAt: new Date(),
        version: sql`${tasksTable.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasksTable.id, taskId),
          eq(tasksTable.tenantId, tenantId),
          isNull(tasksTable.deletedAt),
        ),
      )
      .returning();

    return (results[0] as Task | undefined) ?? null;
  };

  return {
    // Base repository methods — explicitly typed to ensure correct .d.ts emission with --noCheck.
    // The `as` casts are needed because the generic SelectModel inside createBaseRepository
    // resolves to `{ [x: string]: unknown }` due to Drizzle's complex mapped types.
    findById: (tenantId: string, id: string): Promise<Task | null> =>
      base.findById(tenantId, id) as Promise<Task | null>,
    findMany: (tenantId: string, options?: FindManyOptions): Promise<PaginatedResult<Task>> =>
      base.findMany(tenantId, options) as Promise<PaginatedResult<Task>>,
    softDelete: (tenantId: string, id: string): Promise<Task | null> =>
      base.softDelete(tenantId, id) as Promise<Task | null>,
    hardDelete: (tenantId: string, id: string): Promise<Task | null> =>
      base.hardDelete(tenantId, id) as Promise<Task | null>,
    table: base.table,
    entityName: base.entityName,
    db: base.db,
    tenantScope: base.tenantScope,
    computePaginationMeta: base.computePaginationMeta,
    // Task-specific methods (overrides and extensions)
    create,
    update,
    findByStory,
    findWithFilters,
    findDetailById,
    addDependency,
    removeDependency,
    replaceDependencies,
    removeAllEdges,
    getDependencies,
    getDependents,
    getTaskGraph,
    bulkUpdateStatus,
    findBlockedTasks,
    getParentStory,
    getProjectIdForStory,
    getProjectIdForTask,
    // Transaction-aware methods
    withTransaction,
    createInTx,
    updateInTx,
    getProjectEdgesInTx,
    replaceDependenciesInTx,
    getDependentIdsInTx,
    removeAllEdgesInTx,
    softDeleteInTx,
    resetInProgressTasksByStory,
    getTaskStatusSnapshot,
  };
};

/** Inferred return type for the task repository. */
export type TaskRepository = ReturnType<typeof createTaskRepository>;
