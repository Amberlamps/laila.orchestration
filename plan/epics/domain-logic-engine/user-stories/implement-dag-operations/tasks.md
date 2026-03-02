# Implement DAG Operations — Tasks

## User Story Summary

- **Title:** Implement DAG Operations
- **Description:** Implement core directed acyclic graph (DAG) algorithms: cycle detection, topological sort, dependency validation, and derived dependency computation. All functions are pure and deterministic with no database dependency.
- **Status:** Not Started
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Total Tasks:** 5
- **Dependencies:** None

**SAFETY-CRITICAL:** The DAG is the single source of truth for all dependency resolution. Property-based tests with fast-check are mandatory.

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Cycle Detection](./implement-cycle-detection.md) | DFS-based cycle detection for the project-wide task DAG, validating proposed new edges | Not Started | backend-developer | None |
| [Implement Topological Sort](./implement-topological-sort.md) | Topological sort for task ordering within user stories and across the project | Not Started | backend-developer | None |
| [Implement Dependency Validation](./implement-dependency-validation.md) | Validate task IDs, same-project constraint, finish-to-start semantics, no self-deps, active work safety | Not Started | backend-developer | Implement Cycle Detection |
| [Implement Derived Dependency Computation](./implement-derived-dependency-computation.md) | Derive user-story-level and epic-level dependencies from the task-level DAG | Not Started | backend-developer | Implement Cycle Detection, Implement Topological Sort |
| [Write DAG Property-Based Tests](./write-dag-property-based-tests.md) | Property-based tests using fast-check for all DAG operations | Not Started | qa-expert | Implement Cycle Detection, Implement Topological Sort, Implement Dependency Validation, Implement Derived Dependency Computation |

## Dependency Graph

```
Implement Cycle Detection --------+---> Implement Dependency Validation
    |                             |
    +-----------------------------+--> Implement Derived Dependency Computation
    |                             |
Implement Topological Sort -------+
    (independent)
                                        |
                                        v
                                  Write DAG Property-Based Tests
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Cycle Detection + Implement Topological Sort — independent graph algorithms
2. **Phase 2 (parallel):** Implement Dependency Validation + Implement Derived Dependency Computation — both depend on Phase 1 outputs
3. **Phase 3:** Write DAG Property-Based Tests — validates all DAG operations together with property-based testing
