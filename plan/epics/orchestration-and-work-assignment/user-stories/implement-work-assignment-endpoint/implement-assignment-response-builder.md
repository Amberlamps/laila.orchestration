# Implement Assignment Response Builder

## Task Details

- **Title:** Implement Assignment Response Builder
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Work Assignment Endpoint](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Assignment API Route

## Description

Build the full "assigned" response payload that is returned to workers when they successfully receive a story assignment. The response includes the complete user story with all its tasks, each task's acceptance criteria, technical notes, references, dependencies (with their status), persona details (including system prompt), and the recommended task execution order computed from the DAG.

### Response Builder

```typescript
// apps/web/src/lib/orchestration/response-builder.ts
// Builds the full "assigned" response payload for the assignment endpoint.
// Loads all related data (tasks, personas, dependencies) and constructs
// the response that workers use to execute the story.

import { recommendTaskOrder } from "@laila/domain";
import {
  storyRepository,
  taskRepository,
  personaRepository,
  dependencyEdgeRepository,
  epicRepository,
} from "@laila/database";

/**
 * Build the full assigned story response.
 * This is the "work package" that the worker receives.
 * It contains everything the worker needs to execute all tasks in the story.
 *
 * @param storyId - The assigned story ID
 * @param tx - Database transaction for consistent reads
 * @returns The fully populated AssignedResponse
 */
export async function buildAssignedResponse(
  storyId: string,
  tx: DatabaseTransaction
): Promise<AssignedResponse> {
  // Load the story with its parent epic info
  const story = await storyRepository.findByIdWithEpic(storyId, tx);

  // Load all tasks for the story
  const tasks = await taskRepository.findByStoryId(storyId, tx);

  // Load dependency edges for all tasks in the story
  const taskIds = tasks.map((t) => t.id);
  const dependencyEdges = await dependencyEdgeRepository.findByTaskIds(
    taskIds,
    tx
  );

  // Load dependency task summaries (tasks in other stories that our tasks depend on)
  const externalDepIds = dependencyEdges
    .filter((e) => !taskIds.includes(e.to))
    .map((e) => e.to);
  const externalDeps = externalDepIds.length > 0
    ? await taskRepository.findSummariesByIds(externalDepIds, tx)
    : [];

  // Load persona details for all referenced personas
  const personaIds = [...new Set(tasks.map((t) => t.persona_id).filter(Boolean))];
  const personas = personaIds.length > 0
    ? await personaRepository.findByIds(personaIds as string[], tx)
    : [];
  const personaMap = new Map(personas.map((p) => [p.id, p]));

  // Compute recommended task execution order using domain logic.
  // The topological sort considers both intra-story and cross-story dependencies.
  const taskDependencyMap = new Map(
    tasks.map((t) => [
      t.id,
      dependencyEdges.filter((e) => e.from === t.id).map((e) => e.to),
    ])
  );
  const recommendedOrder = recommendTaskOrder(taskDependencyMap, taskIds);

  // Build the response payload
  return {
    type: "assigned" as const,
    story: {
      id: story.id,
      name: story.name,
      description: story.description,
      priority: story.priority,
      epic: {
        id: story.epic.id,
        name: story.epic.name,
      },
      tasks: tasks.map((task) => ({
        id: task.id,
        name: task.name,
        description: task.description,
        persona: task.persona_id
          ? {
              id: task.persona_id,
              name: personaMap.get(task.persona_id)?.name ?? "Unknown",
              system_prompt:
                personaMap.get(task.persona_id)?.system_prompt ?? "",
            }
          : null,
        acceptance_criteria: task.acceptance_criteria,
        technical_notes: task.technical_notes,
        references: task.references,
        dependencies: dependencyEdges
          .filter((e) => e.from === task.id)
          .map((e) => {
            const depTask =
              tasks.find((t) => t.id === e.to) ??
              externalDeps.find((t) => t.id === e.to);
            return {
              id: e.to,
              name: depTask?.name ?? "Unknown",
              status: depTask?.status ?? "unknown",
            };
          }),
        status: task.status,
      })),
      recommended_task_order: recommendedOrder,
    },
  };
}
```

## Acceptance Criteria

- [ ] The response includes the full story with id, name, description, and priority
- [ ] The response includes the parent epic (id and name)
- [ ] Each task includes id, name, description, status, persona, acceptance criteria, technical notes, and references
- [ ] Each task's persona includes id, name, and the full system_prompt (for worker context)
- [ ] Each task's dependencies include id, name, and current status (not just IDs)
- [ ] External dependencies (tasks in other stories) are resolved and included
- [ ] The `recommended_task_order` field contains task IDs sorted by the domain logic's topological sort
- [ ] The recommended order respects dependency constraints (dependencies come before dependents)
- [ ] All data is loaded within the same database transaction for consistency
- [ ] The response builder handles edge cases: tasks with no persona, tasks with no dependencies, tasks with only external dependencies
- [ ] No `any` types are used in the implementation
- [ ] The response matches the `AssignedResponse` type from `@laila/shared`

## Technical Notes

- The response builder performs multiple database queries (story, tasks, edges, external deps, personas). All queries run within the same transaction to ensure a consistent snapshot. In a serverless environment, minimizing the number of round-trips is important — consider using JOIN queries or batch loading where possible.
- The `recommended_task_order` is computed by the domain logic's `recommendTaskOrder()` function, which performs a topological sort on the task dependency sub-graph for this story. Tasks with no dependencies appear first, then tasks whose dependencies are all earlier in the order.
- External dependency resolution (loading task summaries from other stories) is necessary because workers need to know the status of cross-story dependencies to understand what might block their tasks.
- The persona `system_prompt` is included in full because workers need it to configure their AI context. This makes the response payload potentially large (50K chars per persona). Consider compression or lazy loading in future versions if this becomes a performance issue.

## References

- **Functional Requirements:** FR-ORCH-003 (assignment response format), FR-ORCH-006 (recommended task order)
- **Design Specification:** Section 9.1.2 (Assignment Response), Section 9.1.3 (Task Order Recommendation)
- **Domain Logic:** `recommendTaskOrder()` from `@laila/domain`
- **Shared Types:** `AssignedResponse`, `AssignedStoryDetail` from `@laila/shared`

## Estimated Complexity

High — Multiple related data loads, cross-story dependency resolution, topological sort integration, and careful type construction. The N+1 query prevention and consistent transaction usage add implementation complexity.
