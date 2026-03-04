/**
 * Dependency evaluation logic for the status-propagation Lambda function.
 *
 * Core logic: a blocked task becomes "pending" when ALL of its
 * dependencies have status "done". This module queries the dependency
 * graph to find reverse dependencies of a completed task and checks
 * each one individually.
 *
 * Transitions are applied atomically within a database transaction.
 */

import {
  findDependentTaskIds,
  findTaskById,
  areAllPrerequisitesComplete,
  transitionTaskToPending,
  withTransaction,
} from './db';

import type { StatusPropagationLogger } from './logger';
import type { DependentEvaluation } from './types';
import type { Database, PoolDatabase } from '@laila/database';

/**
 * Find all tasks that depend on the completed task and evaluate
 * whether they should be unblocked.
 *
 * A dependent task transitions from "blocked" to "pending" when:
 * 1. The dependent task's current status is "blocked"
 * 2. ALL of the dependent task's dependencies (not just this one) have status "done"
 *
 * This function queries the dependency graph to find reverse dependencies
 * and checks each one individually. Transitions are applied within a
 * single database transaction for atomicity.
 *
 * @param db - Database client (pool mode for transaction support)
 * @param completedTaskId - The task that just completed
 * @param projectId - The project scope for the evaluation
 * @param tenantId - The tenant scope for the evaluation
 * @param log - Logger for structured output
 * @returns Array of evaluations describing each transition made
 */
export const evaluateDependents = async (
  db: Database | PoolDatabase,
  completedTaskId: string,
  projectId: string,
  tenantId: string,
  log: StatusPropagationLogger,
): Promise<DependentEvaluation[]> => {
  // Step 1: Find all tasks that depend on the completed task (tenant+project scoped)
  const edges = await findDependentTaskIds(db, completedTaskId, tenantId, projectId);

  if (edges.length === 0) {
    log.debug(
      { completedTaskId, projectId },
      'No downstream dependencies found for completed task',
    );
    return [];
  }

  const dependentTaskIds = edges.map((e) => e.dependentTaskId);

  log.info(
    {
      completedTaskId,
      projectId,
      dependentCount: dependentTaskIds.length,
    },
    'Evaluating downstream dependencies',
  );

  // Step 2: Evaluate each dependent task
  const candidates: Array<{ taskId: string; taskName: string; storyId: string }> = [];

  for (const dependentTaskId of dependentTaskIds) {
    const task = await findTaskById(db, dependentTaskId, tenantId, projectId);

    if (!task) {
      log.debug({ dependentTaskId }, 'Dependent task not found or deleted -- skipping');
      continue;
    }

    // Only evaluate tasks that are currently blocked
    if (task.workStatus !== 'blocked') {
      log.debug(
        { dependentTaskId, currentStatus: task.workStatus },
        'Dependent task is not blocked -- skipping',
      );
      continue;
    }

    // Check if ALL prerequisites of this dependent task are complete
    const allComplete = await areAllPrerequisitesComplete(db, dependentTaskId, tenantId, projectId);

    if (!allComplete) {
      log.debug({ dependentTaskId }, 'Not all prerequisites are complete -- task remains blocked');
      continue;
    }

    candidates.push({
      taskId: task.id,
      taskName: task.title,
      storyId: task.userStoryId,
    });
  }

  if (candidates.length === 0) {
    log.debug({ completedTaskId, projectId }, 'No blocked tasks eligible for unblocking');
    return [];
  }

  // Step 3: Apply transitions within a transaction
  const evaluations: DependentEvaluation[] = [];

  await withTransaction(db, async (tx) => {
    for (const candidate of candidates) {
      const transitioned = await transitionTaskToPending(tx, candidate.taskId, tenantId);

      if (transitioned) {
        evaluations.push({
          taskId: candidate.taskId,
          taskName: candidate.taskName,
          storyId: candidate.storyId,
          previousStatus: 'blocked',
          newStatus: 'pending',
          reason: `All prerequisites complete after task ${completedTaskId} finished`,
        });

        log.info(
          {
            taskId: candidate.taskId,
            taskName: candidate.taskName,
            previousStatus: 'blocked',
            newStatus: 'pending',
          },
          'Task unblocked -- transitioned from blocked to pending',
        );
      } else {
        log.debug(
          { taskId: candidate.taskId },
          'Task transition skipped -- no longer blocked (race condition)',
        );
      }
    }
  });

  return evaluations;
};
