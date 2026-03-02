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
  inArray,
  notExists,
  aliasedTable,
  type InferSelectModel,
} from 'drizzle-orm';

import { taskDependencyEdgesTable } from '../schema/dependency-edges';
import { epicsTable } from '../schema/epics';
import { tasksTable } from '../schema/tasks';
import { userStoriesTable } from '../schema/user-stories';

import {
  createBaseRepository,
  asDrizzle,
  ValidationError,
  NotFoundError,
  type FindManyOptions,
} from './base-repository';

import type { Database, PoolDatabase } from '../client';

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
  references?: Array<{ type: string; url: string; title: string }>;
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
  const base = createBaseRepository(tasksTable, db);
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
    });
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
    return base.update(tenantId, id, data, expectedVersion);
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
  const findByStory = async (tenantId: string, storyId: string, options: FindManyOptions = {}) => {
    return base.findMany(tenantId, {
      ...options,
      filters: options.filters
        ? and(eq(tasksTable.userStoryId, storyId), options.filters)
        : eq(tasksTable.userStoryId, storyId),
    });
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

  return {
    // Base repository methods (passthrough)
    ...base,
    // Task-specific methods (overrides and extensions)
    create,
    update,
    findByStory,
    addDependency,
    removeDependency,
    getDependencies,
    getDependents,
    getTaskGraph,
    bulkUpdateStatus,
    findBlockedTasks,
  };
};

/** Inferred return type for the task repository. */
export type TaskRepository = ReturnType<typeof createTaskRepository>;
