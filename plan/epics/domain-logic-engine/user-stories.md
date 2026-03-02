# Domain Logic Engine — User Stories

## Epic Summary

- **Title:** Domain Logic Engine
- **Description:** Pure domain logic: DAG operations, status transition engine, and work assignment engine. All functions are pure, deterministic, and have no database dependency.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 3
- **Dependencies:** Epic 2 (Shared Packages — for types only, no DB dependency)

## User Stories

| User Story                                                                                       | Description                                                                                                                | Status                      | Tasks   | Dependencies                                                 |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------- | ------------------------------------------------------------ |
| [Implement DAG Operations](./user-stories/implement-dag-operations/tasks.md)                     | Cycle detection, topological sort, dependency validation, and derived dependency computation for the project-wide task DAG | Complete                    | 5 tasks | None                                                         |
| [Implement Status Transition Engine](./user-stories/implement-status-transition-engine/tasks.md) | Define valid status transitions, cascading re-evaluation, and status derivation for tasks, user stories, and epics         | In Progress (laila-agent-3) | 6 tasks | Implement DAG Operations                                     |
| [Implement Work Assignment Engine](./user-stories/implement-work-assignment-engine/tasks.md)     | Eligibility rules, priority-based selection, recommended task order, and optimistic locking logic for story assignment     | Not Started                 | 5 tasks | Implement DAG Operations, Implement Status Transition Engine |

## Dependency Graph

```
Implement DAG Operations
    |
    v
Implement Status Transition Engine
    |
    v
Implement Work Assignment Engine
```

## Suggested Implementation Order

1. **Phase 1:** Implement DAG Operations — foundational graph algorithms that all other domain logic depends on
2. **Phase 2:** Implement Status Transition Engine — builds on DAG operations for cascading status computation
3. **Phase 3:** Implement Work Assignment Engine — uses both DAG operations and status transitions for assignment logic

## Safety-Critical Note

All three user stories in this epic are **safety-critical**. The DAG is the single source of truth for dependency resolution, status transitions drive work assignment correctness, and assignment correctness is the highest priority for the orchestration system. Property-based testing with fast-check is mandatory for DAG operations. Exhaustive testing is mandatory for status transitions and work assignment.
