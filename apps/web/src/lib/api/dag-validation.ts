/**
 * DAG validation utility for task dependency management.
 *
 * Integrates the pure domain DAG functions with the database layer.
 * Loads the current project DAG from the database within a transaction,
 * then validates proposed edges using the domain cycle detection function.
 *
 * SAFETY-CRITICAL: This module prevents dependency cycles that would
 * create deadlocks where tasks can never be started. All validation
 * runs within the same database transaction as edge insertion to
 * prevent TOCTOU (time-of-check to time-of-use) races.
 */

import { buildAdjacencyList, detectCycle } from '@laila/domain';
import { ValidationError, DomainErrorCode } from '@laila/shared';

import type { DrizzleDb, TaskRepository } from '@laila/database';
import type { DagEdge } from '@laila/domain';

/**
 * Validate that adding the proposed dependency edges does not create
 * a cycle in the project-wide DAG.
 *
 * Steps:
 * 1. Load all existing edges for the project from the database (within tx)
 * 2. Filter out existing edges for the task being modified (replace-all strategy)
 * 3. Build the adjacency list from remaining edges
 * 4. For each proposed new edge, check for cycles sequentially
 * 5. If any edge would create a cycle, throw ValidationError with cycle path
 *
 * Each validated edge is added to the adjacency list before checking the next,
 * so multi-edge cycles (e.g., adding [A, B] where B creates a cycle through A)
 * are caught.
 *
 * @param tenantId             - The tenant UUID for isolation
 * @param projectId            - The project containing the DAG
 * @param taskId               - The task being modified (the "from" node)
 * @param proposedDependencyIds - The new dependency IDs for the task
 * @param taskRepo             - Task repository instance
 * @param tx                   - The database transaction handle
 * @throws ValidationError with DAG_CYCLE_DETECTED if a cycle would be created
 */
export const validateDagEdges = async (
  tenantId: string,
  projectId: string,
  taskId: string,
  proposedDependencyIds: string[],
  taskRepo: TaskRepository,
  tx: DrizzleDb,
): Promise<void> => {
  // Load all edges in the project within the transaction
  const existingEdges = await taskRepo.getProjectEdgesInTx(tenantId, projectId, tx);

  // Convert to DagEdge format, filtering out existing edges for this task
  // (we are replacing the full list, so the old edges should not be considered)
  const filteredEdges: DagEdge[] = existingEdges
    .filter((e) => e.dependentTaskId !== taskId)
    .map((e) => ({ from: e.dependentTaskId, to: e.prerequisiteTaskId }));

  // Build adjacency list from remaining edges
  const adjacencyList = buildAdjacencyList(filteredEdges);

  // Validate each proposed edge sequentially
  for (const dependencyId of proposedDependencyIds) {
    const proposedEdge: DagEdge = { from: taskId, to: dependencyId };
    const result = detectCycle(adjacencyList, proposedEdge);

    if (result.hasCycle) {
      throw new ValidationError(
        DomainErrorCode.DAG_CYCLE_DETECTED,
        `Adding dependency would create a cycle: ${result.cyclePath.join(' -> ')}`,
        {
          cyclePath: result.cyclePath,
          proposedEdge: { from: taskId, to: dependencyId },
        },
      );
    }

    // Add the validated edge to the adjacency list for subsequent checks.
    // This ensures multi-edge cycles are caught: if adding edge A is fine
    // but adding edge B (after A) would create a cycle through A, the
    // sequential validation catches it.
    const existing = adjacencyList.get(taskId);
    if (existing) {
      existing.add(dependencyId);
    } else {
      adjacencyList.set(taskId, new Set([dependencyId]));
    }
  }
};
