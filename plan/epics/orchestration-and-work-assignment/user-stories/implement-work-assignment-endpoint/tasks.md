# Implement Work Assignment Endpoint — Tasks

## User Story Summary

- **Title:** Implement Work Assignment Endpoint
- **Description:** Implement the core orchestration endpoint: `POST /api/v1/orchestration/assign`. This endpoint accepts a worker API key and project ID, evaluates eligibility rules, selects the best available story based on priority, and atomically assigns it using optimistic locking. The response uses a typed discriminator pattern to communicate assignment, blocked, or all-complete states.
- **Status:** Not Started
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** None

**SAFETY-CRITICAL:** The assignment endpoint must guarantee exactly-one assignment. If two workers race for the same story, exactly one must succeed and the other must receive a retry-safe conflict response.

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Assignment API Route](./implement-assignment-api-route.md) | POST /api/v1/orchestration/assign with typed discriminator response | Not Started | backend-developer | None |
| [Implement Atomic Assignment with Locking](./implement-atomic-assignment-with-locking.md) | Optimistic locking for conflict-free atomic story assignment | Not Started | backend-developer | Implement Assignment API Route |
| [Implement Assignment Response Builder](./implement-assignment-response-builder.md) | Build the full "assigned" response with story details, tasks, and recommended execution order | Not Started | backend-developer | Implement Assignment API Route |
| [Write Assignment Concurrency Tests](./write-assignment-concurrency-tests.md) | Concurrency tests for racing workers, DAG states, and all-complete detection | Not Started | qa-expert | Implement Assignment API Route, Implement Atomic Assignment with Locking, Implement Assignment Response Builder |

## Dependency Graph

```
Implement Assignment API Route
    |
    +---> Implement Atomic Assignment with Locking
    |
    +---> Implement Assignment Response Builder
    |
    v
Write Assignment Concurrency Tests
```

## Suggested Implementation Order

1. **Phase 1:** Implement Assignment API Route — the route handler and request/response types
2. **Phase 2 (parallel):** Implement Atomic Assignment with Locking + Implement Assignment Response Builder — both depend on the route but are independent of each other
3. **Phase 3:** Write Assignment Concurrency Tests — validates the complete assignment flow under concurrent load
