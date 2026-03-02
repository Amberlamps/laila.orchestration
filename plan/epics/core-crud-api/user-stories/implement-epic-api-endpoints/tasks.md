# Implement Epic API Endpoints — Tasks

## User Story Summary

- **Title:** Implement Epic API Endpoints
- **Description:** Implement CRUD operations and lifecycle transitions for the Epic entity. Epics are scoped under a project and contain user stories. They are created in Draft status, have a work status derived from child story statuses, and support soft-delete with cascade.
- **Status:** Not Started
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** Implement Error Handling Framework

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Epic CRUD Routes](./implement-epic-crud-routes.md) | POST/GET/GET:id/PATCH/DELETE endpoints for epics nested under projects | Not Started | backend-developer | None |
| [Implement Epic Lifecycle Transitions](./implement-epic-lifecycle-transitions.md) | Publish (Draft to Ready) transition for epics | Not Started | backend-developer | Implement Epic CRUD Routes |
| [Write Epic API Tests](./write-epic-api-tests.md) | Integration tests for all epic CRUD and lifecycle operations | Not Started | qa-expert | Implement Epic CRUD Routes, Implement Epic Lifecycle Transitions |

## Dependency Graph

```
Implement Epic CRUD Routes
    |
    v
Implement Epic Lifecycle Transitions
    |
    v
Write Epic API Tests
```

## Suggested Implementation Order

1. **Phase 1:** Implement Epic CRUD Routes — foundational CRUD operations
2. **Phase 2:** Implement Epic Lifecycle Transitions — publish transition with child validation
3. **Phase 3:** Write Epic API Tests — validates all routes and transitions
