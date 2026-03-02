# Implement Dependency Validation

## Task Details

- **Title:** Implement Dependency Validation
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement DAG Operations](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Cycle Detection

## Description

Implement comprehensive dependency validation rules that must pass before a new dependency edge can be added to the task DAG. Cycle detection is one check; this task implements all the other structural and semantic validations.

Each validation function is pure — it takes the current graph state and proposed change as input and returns a validation result. The API layer will call these validators before persisting any dependency changes.

### Validation Rules

1. **Task existence:** Both the source and target task IDs must exist within the project
2. **Same-project constraint:** Both tasks must belong to the same project
3. **Finish-to-start semantics:** The dependency means "target must complete before source can start"
4. **No self-dependencies:** A task cannot depend on itself
5. **No duplicate edges:** The exact same dependency edge cannot be added twice
6. **Active work safety:** Adding a dependency to a task that is currently in-progress or complete must be rejected if it would invalidate the current state (e.g., making a completed task depend on an incomplete task)

```typescript
// packages/domain/src/dag/dependency-validation.ts
// Validates proposed dependency changes against structural and semantic rules.
// All functions are pure — no database calls, no side effects.
import type { AdjacencyList, DagEdge, CycleCheckResult } from "./types";
import { detectCycle } from "./cycle-detection";

/**
 * Complete result of dependency validation.
 * Contains the overall validity and a list of all validation errors.
 */
export interface DependencyValidationResult {
  valid: boolean;
  errors: DependencyValidationError[];
}

/**
 * Individual validation error with a machine-readable code
 * and a human-readable message.
 */
export interface DependencyValidationError {
  code:
    | "TASK_NOT_FOUND"
    | "CROSS_PROJECT"
    | "SELF_DEPENDENCY"
    | "DUPLICATE_EDGE"
    | "CYCLE_DETECTED"
    | "ACTIVE_WORK_CONFLICT";
  message: string;
  // Additional context for the error (e.g., task IDs, cycle path).
  details?: Record<string, unknown>;
}

/**
 * The task metadata needed for dependency validation.
 * This is a minimal subset of the full task record — only the
 * fields relevant to structural validation.
 */
export interface TaskValidationInfo {
  id: string;
  projectId: string;
  status: "not-started" | "in-progress" | "complete" | "blocked";
  userStoryId: string;
}

/**
 * Validate a proposed new dependency edge against all rules.
 * Runs all validators and collects all errors (does not short-circuit).
 *
 * @param adjacencyList - The current DAG edges
 * @param proposedEdge - The new edge to validate (from depends on to)
 * @param tasks - Map of task ID to task metadata for all tasks in the project
 * @returns Validation result with all errors (if any)
 */
export function validateDependency(
  adjacencyList: AdjacencyList,
  proposedEdge: DagEdge,
  tasks: Map<string, TaskValidationInfo>
): DependencyValidationResult {
  const errors: DependencyValidationError[] = [];

  // Rule 1: Both tasks must exist.
  const fromTask = tasks.get(proposedEdge.from);
  const toTask = tasks.get(proposedEdge.to);

  if (!fromTask) {
    errors.push({
      code: "TASK_NOT_FOUND",
      message: `Source task "${proposedEdge.from}" does not exist`,
      details: { taskId: proposedEdge.from },
    });
  }
  if (!toTask) {
    errors.push({
      code: "TASK_NOT_FOUND",
      message: `Target task "${proposedEdge.to}" does not exist`,
      details: { taskId: proposedEdge.to },
    });
  }

  // If either task doesn't exist, skip further checks
  // (they require task metadata).
  if (!fromTask || !toTask) {
    return { valid: false, errors };
  }

  // Rule 2: Same-project constraint.
  if (fromTask.projectId !== toTask.projectId) {
    errors.push({
      code: "CROSS_PROJECT",
      message: "Dependencies cannot cross project boundaries",
      details: {
        fromProject: fromTask.projectId,
        toProject: toTask.projectId,
      },
    });
  }

  // Rule 3: No self-dependencies.
  if (proposedEdge.from === proposedEdge.to) {
    errors.push({
      code: "SELF_DEPENDENCY",
      message: "A task cannot depend on itself",
      details: { taskId: proposedEdge.from },
    });
  }

  // Rule 4: No duplicate edges.
  const existingDeps = adjacencyList.get(proposedEdge.from);
  if (existingDeps?.has(proposedEdge.to)) {
    errors.push({
      code: "DUPLICATE_EDGE",
      message: "This dependency already exists",
      details: {
        from: proposedEdge.from,
        to: proposedEdge.to,
      },
    });
  }

  // Rule 5: Cycle detection (delegates to cycle-detection module).
  if (proposedEdge.from !== proposedEdge.to) {
    const cycleResult = detectCycle(adjacencyList, proposedEdge);
    if (cycleResult.hasCycle) {
      errors.push({
        code: "CYCLE_DETECTED",
        message: `Adding this dependency would create a cycle: ${cycleResult.cyclePath.join(" -> ")}`,
        details: { cyclePath: cycleResult.cyclePath },
      });
    }
  }

  // Rule 6: Active work safety.
  // If the source task (the one gaining a dependency) is already
  // in-progress or complete, adding a new dependency is dangerous.
  if (fromTask.status === "in-progress") {
    errors.push({
      code: "ACTIVE_WORK_CONFLICT",
      message: "Cannot add dependency to a task that is currently in progress",
      details: { taskId: fromTask.id, status: fromTask.status },
    });
  }
  if (fromTask.status === "complete") {
    errors.push({
      code: "ACTIVE_WORK_CONFLICT",
      message: "Cannot add dependency to a completed task",
      details: { taskId: fromTask.id, status: fromTask.status },
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate removal of a dependency edge.
 * Removing dependencies is generally safe, but should be
 * validated against active work state.
 *
 * @param proposedRemoval - The edge to remove
 * @param tasks - Map of task ID to task metadata
 * @returns Validation result
 */
export function validateDependencyRemoval(
  proposedRemoval: DagEdge,
  tasks: Map<string, TaskValidationInfo>
): DependencyValidationResult {
  const errors: DependencyValidationError[] = [];

  const fromTask = tasks.get(proposedRemoval.from);
  if (!fromTask) {
    errors.push({
      code: "TASK_NOT_FOUND",
      message: `Task "${proposedRemoval.from}" does not exist`,
    });
  }

  // Removing a dependency from an in-progress task could be
  // confusing but is generally safe (it makes the task "more free").
  // However, we log a warning for this case.

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

## Acceptance Criteria

- [ ] `validateDependency()` checks all six validation rules and collects all errors (no short-circuit)
- [ ] Non-existent task IDs are detected with `TASK_NOT_FOUND` error
- [ ] Cross-project dependencies are rejected with `CROSS_PROJECT` error
- [ ] Self-dependencies are rejected with `SELF_DEPENDENCY` error
- [ ] Duplicate edges are rejected with `DUPLICATE_EDGE` error
- [ ] Cycles are detected via delegation to the cycle detection module with `CYCLE_DETECTED` error
- [ ] Adding dependencies to in-progress or completed tasks is rejected with `ACTIVE_WORK_CONFLICT` error
- [ ] `validateDependencyRemoval()` validates edge removal safety
- [ ] All validation errors include descriptive messages and relevant details
- [ ] Error codes are machine-readable string literals (for API error responses)
- [ ] All functions are pure — no side effects, no database calls
- [ ] All types are properly exported for use by the API layer
- [ ] No `any` types used

## Technical Notes

- The validator collects ALL errors rather than short-circuiting on the first failure. This allows the UI to display all issues at once, improving the user experience.
- The `TaskValidationInfo` type is a minimal projection of the task record. The API layer is responsible for loading the full task records and extracting this subset.
- The `ACTIVE_WORK_CONFLICT` check prevents dangerous state transitions. A completed task gaining a new dependency would retroactively invalidate its completion. An in-progress task gaining a new dependency could block it when it was previously ready.
- Consider adding a `validateBulkDependencies()` function that validates multiple proposed edges at once, checking for mutual conflicts between the proposed edges themselves.
- The validation result type is designed for easy serialization to JSON API error responses.

## References

- **Functional Requirements:** FR-DAG-005 (dependency validation rules), FR-DAG-006 (error reporting)
- **Design Specification:** Section 5.1.4 (Dependency Validation), Section 5.1.5 (Active Work Safety)
- **Project Setup:** Domain package structure, error type conventions

## Estimated Complexity

Medium — The individual validation rules are straightforward, but combining them all into a non-short-circuiting validator with proper error types and detail extraction requires careful design. The active work safety rule introduces state-awareness that the other pure validators don't have.
