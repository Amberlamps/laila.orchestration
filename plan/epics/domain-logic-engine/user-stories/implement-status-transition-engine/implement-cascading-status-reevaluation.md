# Implement Cascading Status Re-evaluation

## Task Details

- **Title:** Implement Cascading Status Re-evaluation
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Status Transition Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Define Valid Status Transitions

## Description

Implement the cascading status re-evaluation engine. When a task completes, its dependents may become unblocked. This function computes all the status changes that should cascade through the dependency graph — from tasks to user stories to epics — without performing any database writes. It returns a list of status change commands that the API layer will execute.

### Cascade Logic

When a task transitions to `complete`:

1. Find all tasks that depend on this task (reverse edges in the DAG)
2. For each dependent task: check if ALL its dependencies are now complete
3. If yes: the dependent should transition from `blocked` -> `not-started`
4. Propagate to user story level: re-evaluate the story's status based on its tasks
5. Propagate to epic level: re-evaluate the epic's status based on its stories

The cascade is a pure computation: given the current state and the triggering event, produce the list of all status changes that should occur.

```typescript
// packages/domain/src/status/cascading-reevaluation.ts
// Computes cascading status changes when a task completes.
// Pure function: takes current state, returns list of status commands.
// The API layer executes the commands against the database.
import type { AdjacencyList } from '../dag/types';
import type { TaskStatus, UserStoryStatus, EpicStatus } from './transition-definitions';

/**
 * Minimal task state needed for cascading re-evaluation.
 */
export interface TaskState {
  id: string;
  status: TaskStatus;
  userStoryId: string;
}

/**
 * Minimal user story state needed for cascading re-evaluation.
 */
export interface UserStoryState {
  id: string;
  status: UserStoryStatus;
  epicId: string;
  taskIds: string[];
}

/**
 * Minimal epic state needed for cascading re-evaluation.
 */
export interface EpicState {
  id: string;
  status: EpicStatus;
  userStoryIds: string[];
}

/**
 * A status change command produced by the cascade computation.
 * The API layer executes these commands against the database.
 */
export type StatusChangeCommand =
  | { entity: 'task'; id: string; from: TaskStatus; to: TaskStatus; reason: string }
  | { entity: 'user-story'; id: string; from: UserStoryStatus; to: UserStoryStatus; reason: string }
  | { entity: 'epic'; id: string; from: EpicStatus; to: EpicStatus; reason: string };

/**
 * Compute all cascading status changes triggered by a task completing.
 *
 * Algorithm:
 * 1. Find all direct dependents of the completed task.
 * 2. For each dependent: check if all its dependencies are now complete.
 *    If yes, emit a blocked->not-started transition command.
 * 3. Collect all affected user stories (stories containing changed tasks).
 * 4. Re-evaluate each affected story's status.
 * 5. Collect all affected epics (epics containing changed stories).
 * 6. Re-evaluate each affected epic's status.
 *
 * @param completedTaskId - The task that just completed
 * @param adjacencyList - The task-level DAG (task -> set of dependencies)
 * @param reverseDeps - Reverse DAG (task -> set of dependents)
 * @param tasks - Current state of all tasks in the project
 * @param stories - Current state of all user stories in the project
 * @param epics - Current state of all epics in the project
 * @returns List of status change commands to execute
 */
export function computeCascadingChanges(
  completedTaskId: string,
  adjacencyList: AdjacencyList,
  reverseDeps: AdjacencyList,
  tasks: Map<string, TaskState>,
  stories: Map<string, UserStoryState>,
  epics: Map<string, EpicState>,
): StatusChangeCommand[] {
  const commands: StatusChangeCommand[] = [];
  const affectedStoryIds = new Set<string>();

  // Step 1: Find tasks that depend on the completed task.
  const dependents = reverseDeps.get(completedTaskId) ?? new Set<string>();

  // Step 2: Check each dependent — are all its deps now complete?
  for (const dependentId of dependents) {
    const dependentTask = tasks.get(dependentId);
    if (!dependentTask || dependentTask.status !== 'blocked') continue;

    const deps = adjacencyList.get(dependentId) ?? new Set<string>();
    const allDepsComplete = Array.from(deps).every((depId) => {
      const depTask = tasks.get(depId);
      return depTask?.status === 'complete';
    });

    if (allDepsComplete) {
      commands.push({
        entity: 'task',
        id: dependentId,
        from: 'blocked',
        to: 'not-started',
        reason: `All dependencies of task "${dependentId}" are now complete`,
      });

      // Track the story for re-evaluation.
      affectedStoryIds.add(dependentTask.userStoryId);
    }
  }

  // Also track the story of the completed task itself.
  const completedTask = tasks.get(completedTaskId);
  if (completedTask) {
    affectedStoryIds.add(completedTask.userStoryId);
  }

  // Steps 3-4: Re-evaluate affected stories.
  // (Delegates to story status derivation — see implement-story-status-derivation)
  // This is a placeholder for the integration point.

  // Steps 5-6: Re-evaluate affected epics.
  // (Delegates to epic status derivation — see implement-epic-status-derivation)

  return commands;
}

/**
 * Build the reverse dependency map from the forward adjacency list.
 * If A depends on B (forward: A -> Set(B)),
 * then B has a dependent A (reverse: B -> Set(A)).
 *
 * @param adjacencyList - The forward dependency DAG
 * @returns The reverse dependency DAG
 */
export function buildReverseDeps(adjacencyList: AdjacencyList): AdjacencyList {
  const reverseDeps: AdjacencyList = new Map();

  for (const [node, deps] of adjacencyList) {
    for (const dep of deps) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, new Set());
      }
      reverseDeps.get(dep)!.add(node);
    }
  }

  return reverseDeps;
}
```

## Acceptance Criteria

- [ ] `computeCascadingChanges()` produces `blocked` -> `not-started` transitions for tasks whose dependencies are all complete
- [ ] Tasks that still have incomplete dependencies remain `blocked` (no transition emitted)
- [ ] Only tasks currently in `blocked` status are considered for unblocking
- [ ] The completed task's own story is included in the affected stories for re-evaluation
- [ ] All status change commands include `from`, `to`, and a human-readable `reason`
- [ ] The function produces no side effects — it returns commands, not executes them
- [ ] `buildReverseDeps()` correctly inverts the adjacency list
- [ ] Cascading changes are computed in a single pass (no iterative re-evaluation needed for task level)
- [ ] Empty dependent sets produce no commands (no spurious transitions)
- [ ] The function handles tasks with no dependents gracefully
- [ ] All types are properly exported for use by the API layer
- [ ] No `any` types used

## Technical Notes

- The cascade is computed in a single pass at the task level because task dependencies are strictly finish-to-start. Completing one task can only unblock its direct dependents — it cannot trigger a chain of task-level cascades. (A newly unblocked task is `not-started`, not `complete`, so it doesn't trigger further unblocking.)
- However, at the story and epic levels, cascading could theoretically propagate further. The integration with story/epic derivation (separate tasks) handles this.
- The `StatusChangeCommand` uses a discriminated union on the `entity` field, enabling type-safe handling in the API layer.
- The `reverseDeps` parameter is separate from the `adjacencyList` because computing the reverse map is O(E) and should be done once per request, not once per cascade computation.
- Consider adding a `computeCascadingChangesForMultipleTasks()` variant that handles batch completions (multiple tasks completing at once, e.g., from a bulk update).
- The `reason` field in commands is useful for audit logging and debugging.

## References

- **Functional Requirements:** FR-STATUS-010 (cascading re-evaluation), FR-STATUS-011 (dependency-based unblocking)
- **Design Specification:** Section 5.2.2 (Cascading Status Engine), Section 5.2.3 (Command Pattern)
- **Project Setup:** Domain package structure, command pattern conventions

## Estimated Complexity

Large — The cascading re-evaluation must correctly traverse the dependency graph, check multi-dependency conditions, and produce a complete list of changes. The integration points with story/epic derivation add architectural complexity. The command pattern (returning changes rather than executing them) requires careful design.
