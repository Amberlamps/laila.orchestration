# Implement Repository Layer — Tasks

## User Story Summary

- **Title:** Implement Repository Layer
- **Description:** Create the base repository abstraction and entity-specific repository implementations with mandatory tenant scoping, pagination, soft-delete filtering, and optimistic locking.
- **Status:** Not Started
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Total Tasks:** 8
- **Dependencies:** Define PostgreSQL Schema

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Create Base Repository](./create-base-repository.md) | Create base repository abstraction with tenant scoping, pagination, soft-delete, optimistic locking | Not Started | backend-developer | None |
| [Implement Project Repository](./implement-project-repository.md) | CRUD with status transition validation, cascade delete, filtering | Not Started | backend-developer | Create Base Repository |
| [Implement Epic Repository](./implement-epic-repository.md) | CRUD with derived status computation, lifecycle transitions | Not Started | backend-developer | Create Base Repository |
| [Implement Story Repository](./implement-story-repository.md) | CRUD with assignment tracking, cost recording, attempts logging | Not Started | backend-developer | Create Base Repository |
| [Implement Task Repository](./implement-task-repository.md) | CRUD with dependency edge management, DAG validation, bulk updates | Not Started | backend-developer | Create Base Repository |
| [Implement Worker Repository](./implement-worker-repository.md) | CRUD with hashed API key storage/lookup, project access management | Not Started | backend-developer | Create Base Repository |
| [Implement Persona Repository](./implement-persona-repository.md) | CRUD with active-task reference checking for deletion guard | Not Started | backend-developer | Create Base Repository |
| [Write Repository Integration Tests](./write-repository-integration-tests.md) | Integration tests for all repositories against a test database | Not Started | qa-expert | Implement Project Repository, Implement Epic Repository, Implement Story Repository, Implement Task Repository, Implement Worker Repository, Implement Persona Repository |

## Dependency Graph

```
Create Base Repository
    |
    +---> Implement Project Repository ------+
    |                                         |
    +---> Implement Epic Repository ---------+
    |                                         |
    +---> Implement Story Repository --------+
    |                                         +--> Write Repository Integration Tests
    +---> Implement Task Repository ---------+
    |                                         |
    +---> Implement Worker Repository -------+
    |                                         |
    +---> Implement Persona Repository ------+
```

## Suggested Implementation Order

1. **Phase 1:** Create Base Repository — all entity repositories extend this
2. **Phase 2 (parallel):** All 6 entity repositories can be implemented simultaneously
3. **Phase 3:** Write Repository Integration Tests — requires all repositories to be implemented
