# Implement Task Status Determination

## Task Details

- **Title:** Implement Task Status Determination
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Status Transition Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Define Valid Status Transitions

## Description

Implement a pure function that determines what a task's status should be based on the current state of the dependency graph. Given the set of completed tasks and the task's dependencies, determine whether the task is `not-started` (all deps complete, ready to begin), `blocked` (some deps incomplete), or retains its current status.

This function is used in two contexts:
1. **Initial status computation:** When tasks are first created, determine their initial status based on existing dependencies
2. **Re-evaluation after changes:** When the dependency graph changes (edges added/removed), recalculate affected tasks' statuses

```typescript
// packages/domain/src/status/task-status-determination.ts
// Determine a task's status from the DAG state and completed tasks set.
// Pure function: no database calls, no side effects.
import type { AdjacencyList } from "../dag/types";
import type { TaskStatus } from "./transition-definitions";

/**
 * The current state of a task for status determination purposes.
 */
export interface TaskCurrentState {
  id: string;
  status: TaskStatus;
}

/**
 * Result of a task status determination.
 * Either the status should change, or it should remain the same.
 */
export type TaskStatusDetermination =
  | { shouldChange: false; currentStatus: TaskStatus }
  | { shouldChange: true; currentStatus: TaskStatus; newStatus: TaskStatus; reason: string };

/**
 * Determine what a task's status should be based on its dependencies.
 *
 * Logic:
 * - If the task has no dependencies: it is "not-started" (ready to work).
 * - If all dependencies are in the completed set: it is "not-started".
 * - If any dependency is NOT in the completed set: it is "blocked".
 * - If the task is already "in-progress" or "complete", do not change it
 *   (these states are only changed by explicit actions, not by dependency changes).
 *
 * @param taskId - The task to evaluate
 * @param currentStatus - The task's current status
 * @param adjacencyList - The task-level DAG
 * @param completedTaskIds - Set of task IDs that are currently complete
 * @returns Whether the task's status should change
 */
export function determineTaskStatus(
  taskId: string,
  currentStatus: TaskStatus,
  adjacencyList: AdjacencyList,
  completedTaskIds: Set<string>
): TaskStatusDetermination {
  // Tasks that are in-progress or complete are not affected by
  // dependency changes. Their status is controlled by explicit
  // actions (start work, complete work).
  if (currentStatus === "in-progress" || currentStatus === "complete") {
    return { shouldChange: false, currentStatus };
  }

  // Get this task's dependencies from the DAG.
  const dependencies = adjacencyList.get(taskId) ?? new Set<string>();

  // If the task has no dependencies, it should be not-started.
  if (dependencies.size === 0) {
    if (currentStatus === "not-started") {
      return { shouldChange: false, currentStatus };
    }
    return {
      shouldChange: true,
      currentStatus,
      newStatus: "not-started",
      reason: "Task has no dependencies",
    };
  }

  // Check if ALL dependencies are complete.
  const allDepsComplete = Array.from(dependencies).every((depId) =>
    completedTaskIds.has(depId)
  );

  if (allDepsComplete) {
    // All deps satisfied — task should be not-started (ready).
    if (currentStatus === "not-started") {
      return { shouldChange: false, currentStatus };
    }
    return {
      shouldChange: true,
      currentStatus,
      newStatus: "not-started",
      reason: "All dependencies are now complete",
    };
  }

  // Some deps are still incomplete — task should be blocked.
  if (currentStatus === "blocked") {
    return { shouldChange: false, currentStatus };
  }
  return {
    shouldChange: true,
    currentStatus,
    newStatus: "blocked",
    reason: "Some dependencies are still incomplete",
  };
}

/**
 * Determine the initial status for a newly created task based on
 * its dependencies at creation time.
 *
 * @param taskId - The new task's ID
 * @param adjacencyList - The current DAG (may include edges for this task)
 * @param completedTaskIds - Set of currently completed task IDs
 * @returns The initial status for the task
 */
export function determineInitialTaskStatus(
  taskId: string,
  adjacencyList: AdjacencyList,
  completedTaskIds: Set<string>
): TaskStatus {
  const dependencies = adjacencyList.get(taskId) ?? new Set<string>();

  if (dependencies.size === 0) {
    return "not-started";
  }

  const allDepsComplete = Array.from(dependencies).every((depId) =>
    completedTaskIds.has(depId)
  );

  return allDepsComplete ? "not-started" : "blocked";
}

/**
 * Batch-evaluate multiple tasks and return all that need status changes.
 * Used after bulk dependency graph modifications.
 *
 * @param taskIds - Tasks to evaluate
 * @param currentStatuses - Map of task ID to current status
 * @param adjacencyList - The task-level DAG
 * @param completedTaskIds - Set of completed task IDs
 * @returns Array of tasks that need status changes
 */
export function batchDetermineTaskStatuses(
  taskIds: string[],
  currentStatuses: Map<string, TaskStatus>,
  adjacencyList: AdjacencyList,
  completedTaskIds: Set<string>
): TaskStatusDetermination[] {
  return taskIds
    .map((taskId) => {
      const currentStatus = currentStatuses.get(taskId);
      if (!currentStatus) return null;
      return determineTaskStatus(taskId, currentStatus, adjacencyList, completedTaskIds);
    })
    .filter((result): result is TaskStatusDetermination =>
      result !== null && result.shouldChange
    );
}
```

## Acceptance Criteria

- [ ] `determineTaskStatus()` returns `not-started` when a task has no dependencies
- [ ] `determineTaskStatus()` returns `not-started` when all dependencies are in the completed set
- [ ] `determineTaskStatus()` returns `blocked` when any dependency is not in the completed set
- [ ] `determineTaskStatus()` does not change `in-progress` tasks (returns `shouldChange: false`)
- [ ] `determineTaskStatus()` does not change `complete` tasks (returns `shouldChange: false`)
- [ ] `determineTaskStatus()` returns `shouldChange: false` when current status already matches computed status
- [ ] `determineInitialTaskStatus()` returns correct initial status for new tasks
- [ ] `batchDetermineTaskStatuses()` evaluates multiple tasks and returns only those needing changes
- [ ] All determination results include a human-readable reason when status changes
- [ ] All functions are pure — no side effects, no database calls
- [ ] All types are properly exported
- [ ] No `any` types used

## Technical Notes

- The key design decision is that `in-progress` and `complete` statuses are immune to dependency-based re-evaluation. Only `not-started` and `blocked` are computed from the DAG. This prevents a race condition where a completed task could be retroactively blocked.
- The `completedTaskIds` set is a snapshot of the current state. The caller (API layer) is responsible for providing an accurate snapshot.
- The `batchDetermineTaskStatuses()` function filters out tasks with no changes, reducing the number of database writes the API layer needs to perform.
- Consider adding a `getBlockingDependencies()` helper that returns the specific incomplete dependency IDs for a blocked task. This is useful for UI messages like "Blocked by: Task A, Task C."
- The `reason` field in the determination result is useful for audit logging and debugging.

## References

- **Functional Requirements:** FR-STATUS-012 (task status determination), FR-STATUS-013 (initial status computation)
- **Design Specification:** Section 5.2.4 (Task Status Determination), Section 5.2.5 (Batch Evaluation)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Small — The logic is straightforward: check dependencies, determine if blocked or not-started. The main nuance is handling the "immune" statuses (in-progress, complete) and the batch evaluation. The function signatures and types require more design effort than the logic itself.
