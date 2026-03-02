# Implement Story Status Derivation

## Task Details

- **Title:** Implement Story Status Derivation
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Status Transition Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Cascading Status Re-evaluation, Implement Task Status Determination

## Description

Implement user story status derivation from the state of its child tasks and cross-story dependencies. A story's status is a mix of direct transitions (draft, assigned/in-progress) and derived states (blocked, complete) that depend on task and dependency states.

### Derivation Rules

A user story's computed status depends on the combination of its lifecycle state and its tasks' states:

1. **complete:** All tasks in the story are `complete`
2. **in-progress:** The story has been assigned to a worker (explicit transition) and at least one task is `in-progress`
3. **blocked:** The story has cross-story task dependencies that are incomplete (i.e., a task in this story depends on a task in another story that is not complete)
4. **not-started:** The story is ready to be worked on — all cross-story dependencies are satisfied, but no task has started yet
5. **failed:** The story was explicitly marked as failed (by a human or due to agent failure)
6. **draft:** The story is being defined and is not yet ready for work

```typescript
// packages/domain/src/status/story-status-derivation.ts
// Derive user story status from child tasks and cross-story dependencies.
// Pure function: no database calls, no side effects.
import type { AdjacencyList } from "../dag/types";
import type { TaskStatus, UserStoryStatus } from "./transition-definitions";

/**
 * Task information needed for story status derivation.
 */
export interface StoryTaskInfo {
  id: string;
  status: TaskStatus;
  userStoryId: string;
}

/**
 * Cross-story dependency information.
 * A cross-story dependency exists when a task in this story
 * depends on a task in a different story.
 */
export interface CrossStoryDependency {
  /** The task in this story that has the dependency */
  localTaskId: string;
  /** The task in the other story that must complete first */
  externalTaskId: string;
  /** The other story's ID */
  externalStoryId: string;
  /** Whether the external task is complete */
  isExternalTaskComplete: boolean;
}

/**
 * Result of story status derivation with explanation.
 */
export interface StoryStatusDerivation {
  derivedStatus: UserStoryStatus;
  reason: string;
  /** Cross-story dependencies that are blocking this story (if blocked) */
  blockingDependencies: CrossStoryDependency[];
}

/**
 * Derive a user story's status from its tasks and cross-story dependencies.
 *
 * Priority of derivation (evaluated in order):
 * 1. If currentStatus is "draft" or "failed", return as-is (explicit states)
 * 2. If all tasks are complete -> "complete"
 * 3. If any cross-story dependency is incomplete -> "blocked"
 * 4. If any task is in-progress -> "in-progress"
 * 5. Otherwise -> "not-started"
 *
 * @param storyId - The user story to evaluate
 * @param currentStatus - The story's current explicit status
 * @param storyTasks - All tasks belonging to this story
 * @param adjacencyList - The full task-level DAG
 * @param allTasks - All tasks in the project (for cross-story dep evaluation)
 * @returns Derived status with explanation
 */
export function deriveStoryStatus(
  storyId: string,
  currentStatus: UserStoryStatus,
  storyTasks: StoryTaskInfo[],
  adjacencyList: AdjacencyList,
  allTasks: Map<string, StoryTaskInfo>
): StoryStatusDerivation {
  // Draft and failed are explicit states set by humans.
  // They are not overridden by derivation.
  if (currentStatus === "draft") {
    return {
      derivedStatus: "draft",
      reason: "Story is still in draft state",
      blockingDependencies: [],
    };
  }

  if (currentStatus === "failed") {
    return {
      derivedStatus: "failed",
      reason: "Story has been explicitly marked as failed",
      blockingDependencies: [],
    };
  }

  // Check if the story has any tasks at all.
  if (storyTasks.length === 0) {
    return {
      derivedStatus: currentStatus,
      reason: "Story has no tasks — status cannot be derived",
      blockingDependencies: [],
    };
  }

  // Check: are ALL tasks complete?
  const allTasksComplete = storyTasks.every(
    (task) => task.status === "complete"
  );
  if (allTasksComplete) {
    return {
      derivedStatus: "complete",
      reason: "All tasks in the story are complete",
      blockingDependencies: [],
    };
  }

  // Check: are there incomplete cross-story dependencies?
  const crossStoryDeps = findCrossStoryDependencies(
    storyId,
    storyTasks,
    adjacencyList,
    allTasks
  );
  const blockingDeps = crossStoryDeps.filter(
    (dep) => !dep.isExternalTaskComplete
  );

  if (blockingDeps.length > 0) {
    return {
      derivedStatus: "blocked",
      reason: `Blocked by ${blockingDeps.length} incomplete cross-story dependencies`,
      blockingDependencies: blockingDeps,
    };
  }

  // Check: is any task in-progress?
  const anyTaskInProgress = storyTasks.some(
    (task) => task.status === "in-progress"
  );
  if (anyTaskInProgress) {
    return {
      derivedStatus: "in-progress",
      reason: "At least one task is currently in progress",
      blockingDependencies: [],
    };
  }

  // Default: all cross-story deps satisfied, no task in progress.
  return {
    derivedStatus: "not-started",
    reason: "All cross-story dependencies are satisfied, awaiting assignment",
    blockingDependencies: [],
  };
}

/**
 * Find all cross-story dependencies for tasks in a given story.
 * A cross-story dependency exists when a task in this story
 * depends on a task that belongs to a different story.
 *
 * @param storyId - The story to check
 * @param storyTasks - Tasks belonging to this story
 * @param adjacencyList - The full task-level DAG
 * @param allTasks - All tasks in the project
 * @returns List of cross-story dependencies with completion status
 */
export function findCrossStoryDependencies(
  storyId: string,
  storyTasks: StoryTaskInfo[],
  adjacencyList: AdjacencyList,
  allTasks: Map<string, StoryTaskInfo>
): CrossStoryDependency[] {
  const crossDeps: CrossStoryDependency[] = [];

  for (const task of storyTasks) {
    const taskDeps = adjacencyList.get(task.id) ?? new Set<string>();

    for (const depTaskId of taskDeps) {
      const depTask = allTasks.get(depTaskId);
      if (!depTask) continue;

      // Only include cross-story dependencies (different story).
      if (depTask.userStoryId === storyId) continue;

      crossDeps.push({
        localTaskId: task.id,
        externalTaskId: depTaskId,
        externalStoryId: depTask.userStoryId,
        isExternalTaskComplete: depTask.status === "complete",
      });
    }
  }

  return crossDeps;
}
```

## Acceptance Criteria

- [ ] `deriveStoryStatus()` returns `"complete"` when all tasks in the story are complete
- [ ] `deriveStoryStatus()` returns `"blocked"` when any cross-story dependency is incomplete
- [ ] `deriveStoryStatus()` returns `"in-progress"` when any task is in-progress and no blocking cross-story deps
- [ ] `deriveStoryStatus()` returns `"not-started"` when all cross-story deps satisfied and no task in-progress
- [ ] `deriveStoryStatus()` preserves `"draft"` status (does not override explicit draft state)
- [ ] `deriveStoryStatus()` preserves `"failed"` status (does not override explicit failed state)
- [ ] `deriveStoryStatus()` handles stories with no tasks gracefully
- [ ] `findCrossStoryDependencies()` correctly identifies cross-story task dependencies
- [ ] `findCrossStoryDependencies()` excludes intra-story dependencies
- [ ] Blocking dependencies list includes the specific external tasks and stories causing the block
- [ ] All derivation results include a human-readable reason
- [ ] All functions are pure — no side effects, no database calls
- [ ] No `any` types used

## Technical Notes

- The derivation priority order matters: "complete" is checked before "blocked" because a story with all tasks complete should be complete even if it has cross-story deps (those deps must have been complete for the tasks to have completed).
- "Draft" and "failed" are treated as explicit states that override derivation. A user (or the system) explicitly sets these, and they should not be automatically changed by derivation logic.
- The `blockingDependencies` field in the result enables the UI to show "Blocked by: Task X in Story Y, Task Z in Story W" — giving users actionable information.
- Cross-story dependency detection requires access to all tasks in the project (the `allTasks` parameter), not just the tasks in the current story.
- Consider memoizing the cross-story dependency computation if it becomes a performance bottleneck for projects with many inter-story dependencies.

## References

- **Functional Requirements:** FR-STATUS-020 (story status derivation), FR-STATUS-021 (cross-story blocking)
- **Design Specification:** Section 5.2.6 (Story Status Derivation), Section 5.2.7 (Cross-Story Dependencies)
- **Project Setup:** Domain package structure, pure function conventions

## Estimated Complexity

Medium — The derivation logic has multiple rules evaluated in priority order, and cross-story dependency detection requires traversing the DAG. The combination of explicit states (draft, failed) with derived states (blocked, complete, in-progress) adds nuance to the state machine.
