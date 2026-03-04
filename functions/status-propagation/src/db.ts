/**
 * Database operations for the status-propagation Lambda function.
 *
 * Provides query and mutation functions for dependency evaluation,
 * task status transitions, and parent-entity status propagation.
 * All database operations use Drizzle ORM with the Neon serverless driver.
 */

import {
  createDrizzleClient,
  tasksTable,
  taskDependencyEdgesTable,
  userStoriesTable,
  epicsTable,
  type Database,
  type PoolDatabase,
} from '@laila/database';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';

import type { TaskRow, StoryRow, EpicRow, DependencyEdgeRow } from './types';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Create a pool-mode Drizzle client (required for transaction support). */
export const createPoolClient = (url: string): Database | PoolDatabase =>
  createDrizzleClient({ mode: 'pool', url });

// ---------------------------------------------------------------------------
// Dependency evaluation queries
// ---------------------------------------------------------------------------

/**
 * Find all tasks that depend on a given prerequisite task within a tenant
 * and project.
 *
 * Joins through tasks → stories → epics to verify project membership,
 * ensuring cross-project edges are never returned.
 */
export const findDependentTaskIds = async (
  db: Database | PoolDatabase,
  completedTaskId: string,
  tenantId: string,
  projectId: string,
): Promise<DependencyEdgeRow[]> => {
  const results = await db
    .select({
      dependentTaskId: taskDependencyEdgesTable.dependentTaskId,
      prerequisiteTaskId: taskDependencyEdgesTable.prerequisiteTaskId,
    })
    .from(taskDependencyEdgesTable)
    .innerJoin(tasksTable, eq(tasksTable.id, taskDependencyEdgesTable.dependentTaskId))
    .innerJoin(userStoriesTable, eq(userStoriesTable.id, tasksTable.userStoryId))
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        eq(taskDependencyEdgesTable.prerequisiteTaskId, completedTaskId),
        eq(taskDependencyEdgesTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(tasksTable.deletedAt),
      ),
    );

  return results;
};

/**
 * Fetch a task by ID within a tenant and project.
 * Joins through story → epic to verify project membership.
 * Returns null if the task does not exist, is soft-deleted, or belongs
 * to a different tenant/project.
 */
export const findTaskById = async (
  db: Database | PoolDatabase,
  taskId: string,
  tenantId: string,
  projectId: string,
): Promise<TaskRow | null> => {
  const results = await db
    .select({
      id: tasksTable.id,
      tenantId: tasksTable.tenantId,
      userStoryId: tasksTable.userStoryId,
      title: tasksTable.title,
      workStatus: tasksTable.workStatus,
    })
    .from(tasksTable)
    .innerJoin(userStoriesTable, eq(userStoriesTable.id, tasksTable.userStoryId))
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        eq(tasksTable.id, taskId),
        eq(tasksTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(tasksTable.deletedAt),
      ),
    );

  return results[0] ?? null;
};

/**
 * Find ALL prerequisites for a given dependent task within a tenant and
 * project, and check whether every prerequisite is in a "done" status.
 *
 * Returns true only when every prerequisite task has workStatus = "done".
 * Returns true if the task has no prerequisites (vacuously true).
 */
export const areAllPrerequisitesComplete = async (
  db: Database | PoolDatabase,
  dependentTaskId: string,
  tenantId: string,
  projectId: string,
): Promise<boolean> => {
  // Find all prerequisite task IDs for this dependent task within the tenant
  const edges = await db
    .select({
      prerequisiteTaskId: taskDependencyEdgesTable.prerequisiteTaskId,
    })
    .from(taskDependencyEdgesTable)
    .where(
      and(
        eq(taskDependencyEdgesTable.dependentTaskId, dependentTaskId),
        eq(taskDependencyEdgesTable.tenantId, tenantId),
      ),
    );

  if (edges.length === 0) {
    return true; // No prerequisites -- vacuously complete
  }

  const prerequisiteIds = edges.map((e) => e.prerequisiteTaskId);

  // Fetch the status of all prerequisite tasks within the tenant and project
  const prerequisites = await db
    .select({
      id: tasksTable.id,
      workStatus: tasksTable.workStatus,
    })
    .from(tasksTable)
    .innerJoin(userStoriesTable, eq(userStoriesTable.id, tasksTable.userStoryId))
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        inArray(tasksTable.id, prerequisiteIds),
        eq(tasksTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(tasksTable.deletedAt),
      ),
    );

  // All prerequisites must exist and have "done" status
  return (
    prerequisites.length === prerequisiteIds.length &&
    prerequisites.every((t) => t.workStatus === 'done')
  );
};

// ---------------------------------------------------------------------------
// Task status transitions (transactional)
// ---------------------------------------------------------------------------

/**
 * Transition a task from "blocked" to "pending" within a transaction.
 *
 * When all of a blocked task's prerequisites are complete, the task moves
 * to "pending" status, making it available for assignment. This follows
 * the same convention as the dag-reconciler's correction logic.
 *
 * Uses the transaction handle to ensure atomicity with other updates
 * in the same batch. Increments the version and updates the timestamp.
 *
 * @returns true if the update affected a row, false if the task was
 *          no longer in "blocked" status (race condition -- skip safely).
 */
export const transitionTaskToPending = async (
  tx: PoolDatabase,
  taskId: string,
  tenantId: string,
): Promise<boolean> => {
  const now = new Date();

  const result = await tx
    .update(tasksTable)
    .set({
      workStatus: 'pending',
      version: sql`${tasksTable.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(tasksTable.id, taskId),
        eq(tasksTable.tenantId, tenantId),
        eq(tasksTable.workStatus, 'blocked'),
        isNull(tasksTable.deletedAt),
      ),
    )
    .returning({ id: tasksTable.id });

  return result.length > 0;
};

// ---------------------------------------------------------------------------
// Story propagation queries
// ---------------------------------------------------------------------------

/**
 * Find the parent story for a given task within a tenant and project.
 * Joins through epic to verify project membership.
 * Returns null if the task does not exist, is soft-deleted, or belongs
 * to a different tenant/project.
 */
export const findStoryForTask = async (
  db: Database | PoolDatabase,
  taskId: string,
  tenantId: string,
  projectId: string,
): Promise<StoryRow | null> => {
  const results = await db
    .select({
      id: userStoriesTable.id,
      tenantId: userStoriesTable.tenantId,
      epicId: userStoriesTable.epicId,
      title: userStoriesTable.title,
      workStatus: userStoriesTable.workStatus,
      assignedWorkerId: userStoriesTable.assignedWorkerId,
    })
    .from(userStoriesTable)
    .innerJoin(tasksTable, eq(tasksTable.userStoryId, userStoriesTable.id))
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        eq(tasksTable.id, taskId),
        eq(userStoriesTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(userStoriesTable.deletedAt),
      ),
    );

  return results[0] ?? null;
};

/**
 * Fetch a story by ID within a tenant and project.
 * Joins through epic to verify project membership.
 * Returns null if the story does not exist, is soft-deleted, or belongs
 * to a different tenant/project.
 */
export const findStoryById = async (
  db: Database | PoolDatabase,
  storyId: string,
  tenantId: string,
  projectId: string,
): Promise<StoryRow | null> => {
  const results = await db
    .select({
      id: userStoriesTable.id,
      tenantId: userStoriesTable.tenantId,
      epicId: userStoriesTable.epicId,
      title: userStoriesTable.title,
      workStatus: userStoriesTable.workStatus,
      assignedWorkerId: userStoriesTable.assignedWorkerId,
    })
    .from(userStoriesTable)
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        eq(userStoriesTable.id, storyId),
        eq(userStoriesTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(userStoriesTable.deletedAt),
      ),
    );

  return results[0] ?? null;
};

/**
 * Fetch all non-deleted tasks for a given story within a tenant and project.
 * Joins through story → epic to verify project membership.
 * Used to aggregate task statuses for story-level status derivation.
 */
export const findTasksByStoryId = async (
  db: Database | PoolDatabase,
  storyId: string,
  tenantId: string,
  projectId: string,
): Promise<TaskRow[]> => {
  const results = await db
    .select({
      id: tasksTable.id,
      tenantId: tasksTable.tenantId,
      userStoryId: tasksTable.userStoryId,
      title: tasksTable.title,
      workStatus: tasksTable.workStatus,
    })
    .from(tasksTable)
    .innerJoin(userStoriesTable, eq(userStoriesTable.id, tasksTable.userStoryId))
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        eq(tasksTable.userStoryId, storyId),
        eq(tasksTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(tasksTable.deletedAt),
      ),
    );

  return results;
};

/**
 * Update a story's workStatus within a transaction.
 *
 * @returns true if the update affected a row, false otherwise.
 */
export const updateStoryStatus = async (
  tx: PoolDatabase,
  storyId: string,
  tenantId: string,
  newStatus: string,
): Promise<boolean> => {
  const now = new Date();

  const result = await tx
    .update(userStoriesTable)
    .set({
      workStatus: newStatus,
      version: sql`${userStoriesTable.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(userStoriesTable.id, storyId),
        eq(userStoriesTable.tenantId, tenantId),
        isNull(userStoriesTable.deletedAt),
      ),
    )
    .returning({ id: userStoriesTable.id });

  return result.length > 0;
};

// ---------------------------------------------------------------------------
// Epic propagation queries
// ---------------------------------------------------------------------------

/**
 * Fetch an epic by ID within a tenant and project.
 * Epics have a direct projectId column, so no join is needed.
 * Returns null if the epic does not exist, is soft-deleted, or belongs
 * to a different tenant/project.
 */
export const findEpicById = async (
  db: Database | PoolDatabase,
  epicId: string,
  tenantId: string,
  projectId: string,
): Promise<EpicRow | null> => {
  const results = await db
    .select({
      id: epicsTable.id,
      tenantId: epicsTable.tenantId,
      projectId: epicsTable.projectId,
      name: epicsTable.name,
      workStatus: epicsTable.workStatus,
    })
    .from(epicsTable)
    .where(
      and(
        eq(epicsTable.id, epicId),
        eq(epicsTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(epicsTable.deletedAt),
      ),
    );

  return results[0] ?? null;
};

/**
 * Fetch all non-deleted stories for a given epic within a tenant and project.
 * Joins through epic to verify project membership.
 * Used to aggregate story statuses for epic-level status derivation.
 */
export const findStoriesByEpicId = async (
  db: Database | PoolDatabase,
  epicId: string,
  tenantId: string,
  projectId: string,
): Promise<StoryRow[]> => {
  const results = await db
    .select({
      id: userStoriesTable.id,
      tenantId: userStoriesTable.tenantId,
      epicId: userStoriesTable.epicId,
      title: userStoriesTable.title,
      workStatus: userStoriesTable.workStatus,
      assignedWorkerId: userStoriesTable.assignedWorkerId,
    })
    .from(userStoriesTable)
    .innerJoin(epicsTable, eq(epicsTable.id, userStoriesTable.epicId))
    .where(
      and(
        eq(userStoriesTable.epicId, epicId),
        eq(userStoriesTable.tenantId, tenantId),
        eq(epicsTable.projectId, projectId),
        isNull(userStoriesTable.deletedAt),
      ),
    );

  return results;
};

/**
 * Update an epic's workStatus within a transaction.
 *
 * @returns true if the update affected a row, false otherwise.
 */
export const updateEpicStatus = async (
  tx: PoolDatabase,
  epicId: string,
  tenantId: string,
  newStatus: string,
): Promise<boolean> => {
  const now = new Date();

  const result = await tx
    .update(epicsTable)
    .set({
      workStatus: newStatus,
      version: sql`${epicsTable.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(epicsTable.id, epicId),
        eq(epicsTable.tenantId, tenantId),
        isNull(epicsTable.deletedAt),
      ),
    )
    .returning({ id: epicsTable.id });

  return result.length > 0;
};

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

/**
 * Execute a function within a database transaction.
 *
 * Wraps the pool client's transaction method for use by the evaluator
 * and propagator modules.
 */
export const withTransaction = async <T>(
  db: Database | PoolDatabase,
  fn: (tx: PoolDatabase) => Promise<T>,
): Promise<T> => {
  return (db as PoolDatabase).transaction(async (tx) => {
    return fn(tx as unknown as PoolDatabase);
  });
};
