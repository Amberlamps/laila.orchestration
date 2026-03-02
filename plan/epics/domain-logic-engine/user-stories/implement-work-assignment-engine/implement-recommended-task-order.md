# Implement Recommended Task Order

## Task Details

- **Title:** Implement Recommended Task Order
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Engine](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a function that computes the recommended task execution order within an assigned user story. When an execution agent receives a story assignment, it needs to know which tasks to work on first. This function uses topological sort of the intra-story task dependency subgraph to produce an ordered list.

The recommended order respects task dependencies (a task's dependencies come before it) while tasks without mutual dependencies can be done in any order. The function also identifies which tasks are immediately ready (no unfinished intra-story dependencies).

```typescript
// packages/domain/src/assignment/recommended-task-order.ts
// Computes the recommended task execution order within a user story.
// Uses topological sort of the intra-story task dependency subgraph.
// Pure function: no database calls, no side effects.
import type { AdjacencyList } from "../dag/types";
import { topologicalSortForStory } from "../dag/topological-sort";
import type { TaskStatus } from "../status/transition-definitions";

/**
 * Task information needed for order computation.
 */
export interface TaskOrderInfo {
  id: string;
  status: TaskStatus;
}

/**
 * Recommended task execution order for an assigned story.
 */
export interface RecommendedTaskOrder {
  /** Tasks in recommended execution order (dependency-respecting) */
  orderedTasks: string[];
  /** Tasks that are immediately ready to start (no incomplete intra-story deps) */
  readyNow: string[];
  /** Tasks that are blocked by other tasks within this story */
  blocked: string[];
  /** Tasks that are already complete (for reference) */
  completed: string[];
  /** Tasks that are currently in progress */
  inProgress: string[];
}

/**
 * Compute the recommended task execution order for a user story.
 *
 * Algorithm:
 * 1. Filter the full DAG to only intra-story task dependencies.
 * 2. Run topological sort on the intra-story subgraph.
 * 3. Classify tasks by their current status and dependency state:
 *    - readyNow: not-started AND all intra-story deps complete
 *    - blocked: not-started/blocked AND some intra-story dep incomplete
 *    - completed: already complete
 *    - inProgress: currently being worked on
 *
 * The execution agent should work on tasks from readyNow first,
 * then re-query for the next ready tasks as they complete.
 *
 * @param storyTaskIds - All task IDs belonging to the story
 * @param taskStatuses - Current status of each task
 * @param adjacencyList - The full project-wide task DAG
 * @returns Recommended order with readiness classification
 */
export function computeRecommendedTaskOrder(
  storyTaskIds: string[],
  taskStatuses: Map<string, TaskOrderInfo>,
  adjacencyList: AdjacencyList
): RecommendedTaskOrder {
  // Step 1: Run topological sort for intra-story tasks.
  const sortResult = topologicalSortForStory(adjacencyList, storyTaskIds);

  // If topological sort fails (cycle), fall back to original order.
  // This should never happen if the DAG is validated, but handle gracefully.
  const orderedTasks = sortResult.success
    ? sortResult.sorted
    : [...storyTaskIds];

  // Step 2: Classify tasks by readiness.
  const readyNow: string[] = [];
  const blocked: string[] = [];
  const completed: string[] = [];
  const inProgress: string[] = [];

  // Get the set of tasks within this story for intra-story dep filtering.
  const storyTaskSet = new Set(storyTaskIds);

  for (const taskId of orderedTasks) {
    const taskInfo = taskStatuses.get(taskId);
    if (!taskInfo) continue;

    switch (taskInfo.status) {
      case "complete":
        completed.push(taskId);
        break;

      case "in-progress":
        inProgress.push(taskId);
        break;

      case "not-started": {
        // Check if all intra-story dependencies are complete.
        const deps = adjacencyList.get(taskId) ?? new Set<string>();
        const intraStoryDeps = Array.from(deps).filter((depId) =>
          storyTaskSet.has(depId)
        );
        const allIntraDepsComplete = intraStoryDeps.every((depId) => {
          const depInfo = taskStatuses.get(depId);
          return depInfo?.status === "complete";
        });

        if (allIntraDepsComplete) {
          readyNow.push(taskId);
        } else {
          blocked.push(taskId);
        }
        break;
      }

      case "blocked":
        blocked.push(taskId);
        break;
    }
  }

  return {
    orderedTasks,
    readyNow,
    blocked,
    completed,
    inProgress,
  };
}

/**
 * Get the next task(s) to work on in a story.
 * Convenience function that returns only the ready tasks
 * in recommended order.
 *
 * @param storyTaskIds - All task IDs in the story
 * @param taskStatuses - Current status of each task
 * @param adjacencyList - The full project-wide task DAG
 * @returns Ordered list of tasks that are ready to start
 */
export function getNextReadyTasks(
  storyTaskIds: string[],
  taskStatuses: Map<string, TaskOrderInfo>,
  adjacencyList: AdjacencyList
): string[] {
  const order = computeRecommendedTaskOrder(
    storyTaskIds,
    taskStatuses,
    adjacencyList
  );
  return order.readyNow;
}
```

## Acceptance Criteria

- [ ] `computeRecommendedTaskOrder()` returns tasks in dependency-respecting order
- [ ] Tasks with no dependencies appear before their dependents in `orderedTasks`
- [ ] `readyNow` contains only tasks whose intra-story dependencies are all complete
- [ ] `blocked` contains tasks with incomplete intra-story dependencies
- [ ] `completed` contains tasks already in `complete` status
- [ ] `inProgress` contains tasks currently in `in-progress` status
- [ ] Cross-story dependencies are not considered for intra-story readiness (handled at story level)
- [ ] Graceful fallback if topological sort fails (returns original order, should be unreachable)
- [ ] `getNextReadyTasks()` returns only ready tasks in recommended order
- [ ] Empty story (no tasks) returns all empty arrays
- [ ] Story with all tasks complete returns empty `readyNow` and all in `completed`
- [ ] All functions are pure — no side effects, no database calls
- [ ] No `any` types used

## Technical Notes

- The function delegates to `topologicalSortForStory()` from the DAG operations module, which filters the full DAG to intra-story edges only.
- Cross-story dependencies are intentionally excluded from the readiness check. A task may have a cross-story dependency that is incomplete, but if the story was assigned (passed eligibility), its cross-story deps should already be satisfied. If they're not, the task would be in `blocked` status from the status determination engine.
- The `readyNow` classification only considers intra-story deps that are complete. A task with no intra-story deps is always ready (even if it has cross-story deps — those are handled at the story level).
- The execution agent uses `getNextReadyTasks()` to decide what to work on next. After completing a task, it should call this again to get the newly unblocked tasks.
- Consider adding a `computeParallelWaves()` function that groups tasks into parallel execution waves (all tasks in wave N can be executed simultaneously, all wave N tasks must complete before wave N+1 starts). This is useful for agents that can work on multiple tasks concurrently.

## References

- **Functional Requirements:** FR-ASSIGN-020 (recommended task order), FR-ASSIGN-021 (readiness classification)
- **Design Specification:** Section 5.3.4 (Task Order Computation), Section 5.3.5 (Readiness)
- **Project Setup:** Domain package structure, topological sort integration

## Estimated Complexity

Small — The function composes the existing topological sort with a straightforward readiness classification. The main nuance is correctly filtering to intra-story dependencies for the readiness check. The implementation is well-defined given the existing DAG operations.
