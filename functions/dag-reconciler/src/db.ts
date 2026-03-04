/**
 * Database operations for the dag-reconciler Lambda function.
 *
 * Provides efficient batch queries for loading the complete project DAG
 * and transactional correction application. All queries use Drizzle ORM
 * with the Neon serverless driver.
 */

import {
  createDrizzleClient,
  projectsTable,
  epicsTable,
  userStoriesTable,
  tasksTable,
  taskDependencyEdgesTable,
  type Database,
  type PoolDatabase,
} from '@laila/database';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';

import type {
  ProjectRecord,
  EpicNode,
  StoryNode,
  TaskNode,
  DependencyEdge,
  ProjectDAG,
  CorrectionDetail,
} from './types';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Create a pool-mode Drizzle client (required for transaction support). */
export const createPoolClient = (url: string): Database | PoolDatabase =>
  createDrizzleClient({ mode: 'pool', url });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Find all active projects (lifecycleStatus in 'ready' or 'in_progress').
 *
 * These are the projects where work can happen, making them candidates
 * for DAG reconciliation checks.
 */
export const findActiveProjects = async (db: Database | PoolDatabase): Promise<ProjectRecord[]> => {
  const results = await db
    .select({
      id: projectsTable.id,
      tenantId: projectsTable.tenantId,
      name: projectsTable.name,
      lifecycleStatus: projectsTable.lifecycleStatus,
      workStatus: projectsTable.workStatus,
    })
    .from(projectsTable)
    .where(
      and(
        inArray(projectsTable.lifecycleStatus, ['ready', 'in_progress']),
        isNull(projectsTable.deletedAt),
      ),
    );

  return results;
};

/**
 * Load the complete DAG for a project in minimal queries.
 *
 * Uses four batch queries to avoid N+1 patterns:
 * 1. All epics for the project
 * 2. All stories for those epics
 * 3. All tasks for those stories
 * 4. All dependency edges for those tasks
 */
export const loadProjectDAG = async (
  db: Database | PoolDatabase,
  project: ProjectRecord,
): Promise<ProjectDAG> => {
  // Query 1: All epics for the project
  const epics: EpicNode[] = await db
    .select({
      id: epicsTable.id,
      tenantId: epicsTable.tenantId,
      projectId: epicsTable.projectId,
      name: epicsTable.name,
      workStatus: epicsTable.workStatus,
    })
    .from(epicsTable)
    .where(and(eq(epicsTable.projectId, project.id), isNull(epicsTable.deletedAt)));

  if (epics.length === 0) {
    return { project, epics, stories: [], tasks: [], edges: [] };
  }

  const epicIds = epics.map((e) => e.id);

  // Query 2: All stories for those epics
  const stories: StoryNode[] = await db
    .select({
      id: userStoriesTable.id,
      tenantId: userStoriesTable.tenantId,
      epicId: userStoriesTable.epicId,
      title: userStoriesTable.title,
      workStatus: userStoriesTable.workStatus,
      assignedWorkerId: userStoriesTable.assignedWorkerId,
    })
    .from(userStoriesTable)
    .where(and(inArray(userStoriesTable.epicId, epicIds), isNull(userStoriesTable.deletedAt)));

  if (stories.length === 0) {
    return { project, epics, stories, tasks: [], edges: [] };
  }

  const storyIds = stories.map((s) => s.id);

  // Query 3: All tasks for those stories
  const tasks: TaskNode[] = await db
    .select({
      id: tasksTable.id,
      tenantId: tasksTable.tenantId,
      userStoryId: tasksTable.userStoryId,
      title: tasksTable.title,
      workStatus: tasksTable.workStatus,
    })
    .from(tasksTable)
    .where(and(inArray(tasksTable.userStoryId, storyIds), isNull(tasksTable.deletedAt)));

  if (tasks.length === 0) {
    return { project, epics, stories, tasks, edges: [] };
  }

  const taskIds = tasks.map((t) => t.id);

  // Query 4: All dependency edges for those tasks
  const edges: DependencyEdge[] = await db
    .select({
      dependentTaskId: taskDependencyEdgesTable.dependentTaskId,
      prerequisiteTaskId: taskDependencyEdgesTable.prerequisiteTaskId,
    })
    .from(taskDependencyEdgesTable)
    .where(inArray(taskDependencyEdgesTable.dependentTaskId, taskIds));

  return { project, epics, stories, tasks, edges };
};

// ---------------------------------------------------------------------------
// Transactional corrections
// ---------------------------------------------------------------------------

/**
 * Apply all corrections for a project within a single transaction.
 *
 * Updates task, story, and epic statuses atomically. Each entity's
 * version is incremented and updatedAt is refreshed.
 */
export const applyCorrections = async (
  db: Database | PoolDatabase,
  corrections: CorrectionDetail[],
): Promise<void> => {
  if (corrections.length === 0) {
    return;
  }

  await (db as PoolDatabase).transaction(async (tx) => {
    for (const correction of corrections) {
      const now = new Date();

      if (correction.entityType === 'task') {
        await tx
          .update(tasksTable)
          .set({
            workStatus: correction.correctedStatus,
            version: sql`${tasksTable.version} + 1`,
            updatedAt: now,
          })
          .where(eq(tasksTable.id, correction.entityId));
      } else if (correction.entityType === 'story') {
        await tx
          .update(userStoriesTable)
          .set({
            workStatus: correction.correctedStatus,
            version: sql`${userStoriesTable.version} + 1`,
            updatedAt: now,
          })
          .where(eq(userStoriesTable.id, correction.entityId));
      } else {
        await tx
          .update(epicsTable)
          .set({
            workStatus: correction.correctedStatus,
            version: sql`${epicsTable.version} + 1`,
            updatedAt: now,
          })
          .where(eq(epicsTable.id, correction.entityId));
      }
    }
  });
};
