/**
 * DAG cleanup utility for task soft-deletion.
 *
 * Cleans up dependency edges when a task is soft-deleted. Removes all
 * edges where the deleted task is either the dependent (from) or the
 * dependency (to). All operations run within the same transaction as
 * the soft-delete to ensure atomicity.
 *
 * After edge removal, returns the IDs of tasks that were depending on
 * the deleted task, so their status can be re-evaluated (they may
 * become unblocked).
 */

import type { DrizzleDb, TaskRepository } from '@laila/database';

/**
 * Result of the soft-delete with edge cleanup operation.
 *
 * - `dependentTaskIds`: IDs of tasks that had the deleted task as a
 *   prerequisite. These tasks may need status re-evaluation since
 *   their blocker has been removed.
 */
export interface DeleteCleanupResult {
  dependentTaskIds: string[];
}

/**
 * Atomically soft-deletes a task and removes all its dependency edges.
 *
 * This function runs within a database transaction to ensure that:
 * 1. The dependent task IDs are captured before edge removal
 * 2. All edges (both incoming and outgoing) are removed
 * 3. The task is soft-deleted
 *
 * All three operations succeed or fail together (atomic).
 *
 * @param tenantId  - The tenant UUID for isolation
 * @param taskId    - The ID of the task to soft-delete
 * @param taskRepo  - Task repository instance
 * @param tx        - The database transaction handle
 * @returns The IDs of tasks that depended on the deleted task
 */
export const cleanupAndSoftDelete = async (
  tenantId: string,
  taskId: string,
  taskRepo: TaskRepository,
  tx: DrizzleDb,
): Promise<DeleteCleanupResult> => {
  // 1. Capture dependent task IDs before removing edges
  //    (tasks that had this task as a prerequisite)
  const dependentTaskIds = await taskRepo.getDependentIdsInTx(tenantId, taskId, tx);

  // 2. Remove all dependency edges referencing this task (both directions)
  await taskRepo.removeAllEdgesInTx(tenantId, taskId, tx);

  // 3. Soft-delete the task itself
  await taskRepo.softDeleteInTx(tenantId, taskId, tx);

  return { dependentTaskIds };
};
