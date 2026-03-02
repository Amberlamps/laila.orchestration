# Implement Timeout & Reclamation — Tasks

## User Story Summary

- **Title:** Implement Timeout & Reclamation Logic
- **Description:** Implement the timeout checking function, manual unassignment endpoint, and race condition handling between timeout and worker submission. This logic ensures that stale assignments (where workers have stopped responding) are reclaimed and returned to the assignment pool.
- **Status:** Not Started
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Implement Work Assignment Endpoint, Implement Completion & Failure Endpoints

**SAFETY-CRITICAL:** The timeout/reclamation logic contains the most dangerous race condition in the system: a worker completing work at the exact moment the timeout fires. The implementation must guarantee that a valid completion is never overwritten by a timeout reclamation.

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Implement Timeout Checking Logic](./implement-timeout-checking-logic.md) | Function to check all in-progress stories and reclaim timed-out ones | Not Started | backend-developer | None |
| [Implement Manual Unassignment Endpoint](./implement-manual-unassignment-endpoint.md) | POST /api/v1/stories/:id/unassign with confirmation and attempt logging | Not Started | backend-developer | None |
| [Implement Timeout Race Condition Handling](./implement-timeout-race-condition-handling.md) | Handle the race between worker completion and timeout reclamation | Not Started | backend-developer | Implement Timeout Checking Logic |
| [Write Timeout & Reclamation Tests](./write-timeout-reclamation-tests.md) | Tests for timeout, race conditions, manual unassignment, and attempt history | Not Started | qa-expert | Implement Timeout Checking Logic, Implement Manual Unassignment Endpoint, Implement Timeout Race Condition Handling |

## Dependency Graph

```
Implement Timeout Checking Logic ---> Implement Timeout Race Condition Handling
    (independent of Manual Unassignment)

Implement Manual Unassignment Endpoint
    (independent)

          All three tasks
              |
              v
    Write Timeout & Reclamation Tests
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Implement Timeout Checking Logic + Implement Manual Unassignment Endpoint — independent tasks
2. **Phase 2:** Implement Timeout Race Condition Handling — depends on timeout checking logic
3. **Phase 3:** Write Timeout & Reclamation Tests — comprehensive validation
