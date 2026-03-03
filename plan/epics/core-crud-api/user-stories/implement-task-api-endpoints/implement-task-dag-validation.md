# Implement Task DAG Validation

## Task Details

- **Title:** Implement Task DAG Validation
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Task API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Task CRUD Routes

## Description

Integrate the DAG cycle detection from `@laila/domain` into the task API routes. Every time a task is created or updated with dependency IDs, the API must validate that the proposed edges do not create a cycle in the project-wide DAG. On soft-delete, all dependency edges referencing the deleted task must be cleaned up, and downstream tasks should be re-evaluated for status changes.

**SAFETY-CRITICAL:** This is the API-layer integration point for the cycle detection algorithm. If this validation is skipped or bypassed, cycles can be introduced into the dependency graph, creating deadlocks where tasks can never be started.

### DAG Validation Integration

```typescript
// apps/web/src/lib/api/dag-validation.ts
// Integrates the pure domain DAG functions with the database layer.
// Loads the current project DAG from the database, then validates
// proposed edges using the domain cycle detection function.

import { detectCycle, buildAdjacencyList } from '@laila/domain';
import { dependencyEdgeRepository } from '@laila/database';
import { ValidationError, DomainErrorCode } from '@laila/shared';
import type { DagEdge } from '@laila/domain';

/**
 * Validate that adding the proposed dependency edges does not create
 * a cycle in the project-wide DAG.
 *
 * Steps:
 * 1. Load all existing edges for the project from the database
 * 2. Build the adjacency list from existing edges
 * 3. For each proposed new edge, check for cycles
 * 4. If any edge would create a cycle, throw ValidationError with cycle path
 *
 * @param projectId - The project containing the DAG
 * @param taskId - The task being modified (the "from" node)
 * @param proposedDependencyIds - The new dependency IDs for the task
 * @throws ValidationError with DAG_CYCLE_DETECTED if a cycle would be created
 */
export async function validateDagEdges(
  projectId: string,
  taskId: string,
  proposedDependencyIds: string[],
): Promise<void> {
  // Load all edges in the project
  const existingEdges = await dependencyEdgeRepository.findByProjectId(projectId);

  // Remove existing edges for this task (we are replacing the full list)
  const filteredEdges = existingEdges.filter((e) => e.from !== taskId);

  // Build adjacency list from remaining edges
  const adjacencyList = buildAdjacencyList(filteredEdges);

  // Validate each proposed edge
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

    // Add the validated edge to the adjacency list for subsequent checks
    // (multiple new edges might form a cycle with each other)
    if (!adjacencyList.has(taskId)) {
      adjacencyList.set(taskId, new Set());
    }
    adjacencyList.get(taskId)!.add(dependencyId);
  }
}
```

### Dependency Edge Cleanup on Delete

```typescript
// apps/web/src/lib/api/dag-cleanup.ts
// Cleans up dependency edges when a task is soft-deleted.
// Removes all edges where the deleted task is either the
// dependent (from) or the dependency (to).

import { dependencyEdgeRepository } from '@laila/database';

/**
 * Remove all dependency edges referencing a deleted task.
 * This must be called within the same transaction as the soft-delete.
 *
 * After edge removal, downstream tasks that were blocked by the deleted task
 * may become unblocked. A status re-evaluation should be triggered.
 *
 * @param taskId - The ID of the soft-deleted task
 * @param tx - The database transaction handle
 */
export async function cleanupDependencyEdges(
  taskId: string,
  tx: DatabaseTransaction,
): Promise<string[]> {
  // Find tasks that depend on the deleted task (they may become unblocked)
  const dependentTaskIds = await dependencyEdgeRepository.findDependents(taskId, tx);

  // Remove all edges referencing the deleted task
  await dependencyEdgeRepository.removeAllForTask(taskId, tx);

  return dependentTaskIds;
}
```

### Additional Validations

```typescript
// apps/web/src/lib/api/dependency-validation.ts
// Additional business rule validations for dependency edges.

/**
 * Validate that all dependency IDs reference:
 * 1. Existing, non-deleted tasks
 * 2. Tasks within the same project (cross-project deps forbidden)
 * 3. Not the task itself (self-dependency forbidden)
 *
 * These checks run before the cycle detection to provide clear error messages.
 */
export async function validateDependencyIds(
  taskId: string,
  projectId: string,
  dependencyIds: string[],
): Promise<void> {
  // Check for self-dependency
  if (dependencyIds.includes(taskId)) {
    throw new ValidationError(DomainErrorCode.INVALID_DEPENDENCY, 'A task cannot depend on itself');
  }

  // Verify all dependency tasks exist and are in the same project
  const tasks = await taskRepository.findByIds(dependencyIds);
  // ... validate existence, project membership, non-deleted status
}
```

## Acceptance Criteria

- [ ] DAG cycle detection is called on every task creation with non-empty `dependency_ids`
- [ ] DAG cycle detection is called on every task update that modifies `dependency_ids`
- [ ] Cycle detection loads the full project DAG from the database
- [ ] Cycle detection validates all proposed edges sequentially (catching multi-edge cycles)
- [ ] On cycle detection, a `ValidationError` is thrown with `DAG_CYCLE_DETECTED` code
- [ ] The error response includes the cycle path (list of task IDs) for debugging
- [ ] Self-dependency (task depends on itself) is rejected with `INVALID_DEPENDENCY` code
- [ ] Cross-project dependencies are rejected with a clear error message
- [ ] Dependencies on non-existent or soft-deleted tasks are rejected
- [ ] On task soft-delete, all dependency edges referencing the task are removed
- [ ] Edge cleanup is atomic with the soft-delete (same transaction)
- [ ] After edge cleanup, dependent task IDs are returned for status re-evaluation
- [ ] The validation is called within the same transaction as the edge insertion to prevent TOCTOU races
- [ ] No `any` types are used in the implementation

## Technical Notes

- The DAG validation loads ALL edges in the project for each validation call. For projects with many tasks (hundreds), this could be a performance concern. Consider caching the adjacency list per project with invalidation on edge changes. For v1, loading from the database on each call is acceptable.
- The "replace all" strategy for dependency updates means: delete all `from = taskId` edges, then insert new edges, then validate. The validation must happen AFTER the old edges are removed (in the adjacency list) but BEFORE the new edges are committed. This is handled by filtering out the old edges before building the adjacency list.
- The multi-edge cycle check is important: if a task adds dependencies [A, B], and adding A is fine but adding B (after A) would create a cycle through A, the sequential validation catches this because A is added to the adjacency list before checking B.
- TOCTOU (Time-of-check to time-of-use) risk: another request could modify the DAG between validation and insertion. Use a database transaction with at least READ COMMITTED isolation level, and perform the validation and insertion within the same transaction.

## References

- **Functional Requirements:** FR-DAG-001 (cycle detection integration), FR-TASK-002 (dependency management)
- **Design Specification:** Section 5.1 (DAG Architecture), Section 7.4.2 (DAG Validation in API)
- **Domain Logic:** `detectCycle()`, `buildAdjacencyList()` from `@laila/domain`
- **Database Schema:** dependency_edges table in `@laila/database`

## Estimated Complexity

High — This is the critical integration point between the pure domain DAG logic and the database-backed API. The TOCTOU concern, multi-edge validation, and transactional cleanup all add significant complexity. This is safety-critical code that must be correct.
