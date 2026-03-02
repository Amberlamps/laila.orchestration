# Implement Status Transition Engine — Tasks

## User Story Summary

- **Title:** Implement Status Transition Engine
- **Description:** Define all valid status transitions for tasks, user stories, epics, and projects. Implement cascading status re-evaluation and status derivation logic. All functions are pure and deterministic.
- **Status:** In Progress (laila-agent-3)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Total Tasks:** 6
- **Dependencies:** Implement DAG Operations

**SAFETY-CRITICAL:** Status transitions drive work assignment correctness. Exhaustive testing is mandatory.

## Tasks

| Task                                                                                     | Description                                                                      | Status      | Assigned Agent    | Dependencies                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Define Valid Status Transitions](./define-valid-status-transitions.md)                  | Define all valid state machines for tasks, user stories, epics, and projects     | Not Started | backend-developer | None                                                                                                                                                                                |
| [Implement Cascading Status Re-evaluation](./implement-cascading-status-reevaluation.md) | Re-evaluate dependent task/story/epic statuses when a task completes             | Not Started | backend-developer | Define Valid Status Transitions                                                                                                                                                     |
| [Implement Task Status Determination](./implement-task-status-determination.md)          | Determine a task's status from the DAG state and completed tasks set             | Not Started | backend-developer | Define Valid Status Transitions                                                                                                                                                     |
| [Implement Story Status Derivation](./implement-story-status-derivation.md)              | Derive user story status from its child tasks and cross-story dependencies       | Not Started | backend-developer | Implement Cascading Status Re-evaluation, Implement Task Status Determination                                                                                                       |
| [Implement Epic Status Derivation](./implement-epic-status-derivation.md)                | Derive epic status from its child user stories                                   | Not Started | backend-developer | Implement Story Status Derivation                                                                                                                                                   |
| [Write Status Engine Tests](./write-status-engine-tests.md)                              | Exhaustive tests for all transition paths, cascading propagation, and edge cases | Not Started | qa-expert         | Define Valid Status Transitions, Implement Cascading Status Re-evaluation, Implement Task Status Determination, Implement Story Status Derivation, Implement Epic Status Derivation |

## Dependency Graph

```
Define Valid Status Transitions
    |
    +---> Implement Cascading Status Re-evaluation ---+
    |                                                  |
    +---> Implement Task Status Determination --------+--> Implement Story Status Derivation
                                                            |
                                                            v
                                                      Implement Epic Status Derivation
                                                            |
                                                            v
                                                      Write Status Engine Tests
```

## Suggested Implementation Order

1. **Phase 1:** Define Valid Status Transitions — state machine definitions that all other tasks reference
2. **Phase 2 (parallel):** Implement Cascading Status Re-evaluation + Implement Task Status Determination — both depend on transition definitions
3. **Phase 3:** Implement Story Status Derivation — aggregates task-level status into story-level status
4. **Phase 4:** Implement Epic Status Derivation — aggregates story-level status into epic-level status
5. **Phase 5:** Write Status Engine Tests — exhaustive test suite for the complete status engine
