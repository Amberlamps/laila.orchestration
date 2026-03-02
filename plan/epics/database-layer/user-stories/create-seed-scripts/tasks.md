# Create Seed Scripts — Tasks

## User Story Summary

- **Title:** Create Seed Scripts
- **Description:** Create development and testing seed profiles with realistic sample data and minimal deterministic fixtures.
- **Status:** Not Started
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Total Tasks:** 2
- **Dependencies:** Implement Repository Layer

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Development Seed](./implement-development-seed.md) | Create development seed with realistic sample data (projects, epics, stories, tasks, workers, personas) | Not Started | backend-developer | None |
| [Implement Testing Seed](./implement-testing-seed.md) | Create testing seed with minimal deterministic fixtures for integration tests | Not Started | qa-expert | None |

## Dependency Graph

```
Implement Development Seed    (independent)
Implement Testing Seed        (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Both seed scripts can be implemented simultaneously as they are independent of each other. Both depend on the repository layer being complete.
