# Implement Project API Endpoints — Tasks

## User Story Summary

- **Title:** Implement Project API Endpoints
- **Description:** Implement full CRUD operations and lifecycle status transitions for the Project entity. Projects are the top-level container in the hierarchy (Project > Epic > User Story > Task). They are created in Draft status, can be published when all children are Ready, and support hard-delete with cascade.
- **Status:** In Progress (laila-agent-2)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** Implement Error Handling Framework

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Project CRUD Routes](./implement-project-crud-routes.md) | POST/GET/GET:id/PATCH/DELETE endpoints for projects with pagination and filtering | Not Started | backend-developer | None |
| [Implement Project Status Transitions](./implement-project-status-transitions.md) | Publish (Draft to Ready) and Revert (Ready to Draft) lifecycle endpoints | Not Started | backend-developer | Implement Project CRUD Routes |
| [Write Project API Tests](./write-project-api-tests.md) | Integration tests for all project CRUD and lifecycle operations | Not Started | qa-expert | Implement Project CRUD Routes, Implement Project Status Transitions |

## Dependency Graph

```
Implement Project CRUD Routes
    |
    v
Implement Project Status Transitions
    |
    v
Write Project API Tests
```

## Suggested Implementation Order

1. **Phase 1:** Implement Project CRUD Routes — foundational CRUD operations
2. **Phase 2:** Implement Project Status Transitions — lifecycle management built on top of CRUD
3. **Phase 3:** Write Project API Tests — validates all routes and transitions
