# Implement Completion & Failure Endpoints — Tasks

## User Story Summary

- **Title:** Implement Task Completion & Story Completion/Failure Endpoints
- **Description:** Implement the work result endpoints: task completion with cascading re-evaluation, story completion with cost recording, story failure with error logging, and story reset from failed state. These endpoints handle the outcomes of worker execution and drive the orchestration lifecycle forward.
- **Status:** Complete
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Total Tasks:** 5
- **Dependencies:** Implement Work Assignment Endpoint

**SAFETY-CRITICAL:** Task completion cascading must correctly unblock downstream tasks. Story completion must atomically record costs and propagate status. Story failure must not corrupt the DAG state.

## Tasks

| Task                                                                            | Description                                                                              | Status   | Assigned Agent    | Dependencies                                                                                                                              |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Implement Task Completion Endpoint](./implement-task-completion-endpoint.md)   | POST /api/v1/tasks/:id/complete with cascading re-evaluation and auto-complete detection | Complete | backend-developer | None                                                                                                                                      |
| [Implement Story Completion Endpoint](./implement-story-completion-endpoint.md) | POST /api/v1/stories/:id/complete with cost recording and status propagation             | Complete | backend-developer | Implement Task Completion Endpoint                                                                                                        |
| [Implement Story Failure Endpoint](./implement-story-failure-endpoint.md)       | POST /api/v1/stories/:id/fail with error logging and downstream blocking                 | Complete | backend-developer | None                                                                                                                                      |
| [Implement Story Reset Endpoint](./implement-story-reset-endpoint.md)           | POST /api/v1/stories/:id/reset from failed to not-started/blocked                        | Complete | backend-developer | Implement Story Failure Endpoint                                                                                                          |
| [Write Completion & Failure Tests](./write-completion-failure-tests.md)         | Integration tests for all completion, failure, and reset flows                           | Complete | qa-expert         | Implement Task Completion Endpoint, Implement Story Completion Endpoint, Implement Story Failure Endpoint, Implement Story Reset Endpoint |

## Dependency Graph

```
Implement Task Completion Endpoint ---> Implement Story Completion Endpoint
    (independent of Story Failure)

Implement Story Failure Endpoint ---> Implement Story Reset Endpoint

                All four tasks
                    |
                    v
          Write Completion & Failure Tests
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Task Completion Endpoint + Implement Story Failure Endpoint — these are independent
2. **Phase 2 (parallel):** Implement Story Completion Endpoint + Implement Story Reset Endpoint — each depends on one Phase 1 task
3. **Phase 3:** Write Completion & Failure Tests — comprehensive validation of all flows
