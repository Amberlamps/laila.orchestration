/**
 * Dependency validation utility for task dependency management.
 *
 * Validates business rules for dependency edges before cycle detection:
 * - Self-dependency rejection (a task cannot depend on itself)
 * - Cross-project dependency rejection
 * - Non-existent or soft-deleted task rejection
 *
 * These checks run before DAG cycle detection to provide clear,
 * specific error messages for common validation failures.
 */

import { ValidationError, DomainErrorCode } from '@laila/shared';

import type { TaskRepository } from '@laila/database';

/**
 * Validate that all dependency IDs satisfy business rules:
 * 1. No self-dependency (task depending on itself)
 * 2. All referenced tasks exist and are not soft-deleted
 * 3. All referenced tasks belong to the same project (no cross-project deps)
 *
 * @param tenantId      - The tenant UUID for isolation
 * @param taskId        - The task being modified (to check for self-loops)
 * @param projectId     - The project the dependent task belongs to
 * @param dependencyIds - Array of prerequisite task UUIDs to validate
 * @param taskRepo      - Task repository instance
 * @throws ValidationError with INVALID_DEPENDENCY for self-dependency or cross-project
 * @throws ValidationError with VALIDATION_FAILED for non-existent tasks
 */
export const validateDependencyIds = async (
  tenantId: string,
  taskId: string,
  projectId: string,
  dependencyIds: string[],
  taskRepo: TaskRepository,
): Promise<void> => {
  // 1. Check for self-dependency
  if (dependencyIds.includes(taskId)) {
    throw new ValidationError(
      DomainErrorCode.INVALID_DEPENDENCY,
      'A task cannot depend on itself',
      { taskId },
    );
  }

  // 2. Validate each dependency exists and is in the same project
  // Run validations sequentially to provide clear error messages per dependency
  for (const depId of dependencyIds) {
    const depTask = await taskRepo.findById(tenantId, depId);
    if (!depTask) {
      throw new ValidationError(
        DomainErrorCode.INVALID_DEPENDENCY,
        `Dependency task with id ${depId} not found or has been deleted`,
        { dependencyId: depId },
      );
    }

    const depProjectId = await taskRepo.getProjectIdForTask(tenantId, depId);
    if (depProjectId !== projectId) {
      throw new ValidationError(
        DomainErrorCode.INVALID_DEPENDENCY,
        `Cross-project dependencies are not allowed. Task ${depId} belongs to a different project.`,
        {
          dependencyId: depId,
          dependencyProjectId: depProjectId,
          taskProjectId: projectId,
        },
      );
    }
  }
};
