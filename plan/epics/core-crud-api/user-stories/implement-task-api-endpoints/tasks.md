# Implement Task API Endpoints — Tasks

## User Story Summary

- **Title:** Implement Task API Endpoints
- **Description:** Implement CRUD operations, DAG validation on dependency creation/update, status update endpoints for task lifecycle, and cascading status re-evaluation. Tasks are the leaf nodes in the orchestration hierarchy and the nodes in the project-wide dependency DAG.
- **Status:** Not Started
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Implement Error Handling Framework, Implement User Story API Endpoints

**SAFETY-CRITICAL:** Task dependency validation (DAG cycle detection) is a safety-critical operation. If a cycle is introduced, it creates a deadlock. The DAG cycle detection from `@laila/domain` must be called on every dependency modification.

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Task CRUD Routes](./implement-task-crud-routes.md) | POST/GET/GET:id/PATCH/DELETE endpoints for tasks with dependency list, persona, acceptance criteria, technical notes, and references | Not Started | backend-developer | None |
| [Implement Task DAG Validation](./implement-task-dag-validation.md) | On create/update with dependencies, call DAG cycle detection; clean up edges on soft-delete | Not Started | backend-developer | Implement Task CRUD Routes |
| [Implement Task Status Updates](./implement-task-status-updates.md) | Start and complete endpoints with cascading re-evaluation | Not Started | backend-developer | Implement Task CRUD Routes |
| [Write Task API Tests](./write-task-api-tests.md) | Integration tests for CRUD, DAG validation, status updates, cascading, and cross-story dependencies | Not Started | qa-expert | Implement Task CRUD Routes, Implement Task DAG Validation, Implement Task Status Updates |

## Dependency Graph

```
Implement Task CRUD Routes
    |
    +---> Implement Task DAG Validation
    |
    +---> Implement Task Status Updates
    |
    v
Write Task API Tests
```

## Suggested Implementation Order

1. **Phase 1:** Implement Task CRUD Routes — foundational CRUD operations
2. **Phase 2 (parallel):** Implement Task DAG Validation + Implement Task Status Updates — both depend on CRUD but are independent of each other
3. **Phase 3:** Write Task API Tests — comprehensive validation of all task operations
