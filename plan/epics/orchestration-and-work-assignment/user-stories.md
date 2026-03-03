# Orchestration & Work Assignment API — User Stories

## Epic Summary

- **Title:** Orchestration & Work Assignment API
- **Description:** Work assignment endpoint, task/story completion, timeout/reclamation logic, manual unassignment. This is the core orchestration logic that drives the AI agent workflow: assigning stories to workers, handling completion and failure, and reclaiming timed-out work.
- **Status:** In Progress (laila-agent-2)
- **Total User Stories:** 3
- **Dependencies:** Epic 5 (Domain Logic Engine), Epic 6 (Core CRUD API)

**SAFETY-CRITICAL:** This epic contains the most safety-critical code in the system. The work assignment endpoint must guarantee exactly-one assignment (no double assignments), the completion endpoints must correctly cascade status changes, and the timeout logic must handle race conditions with worker submissions. Correctness is the highest priority — performance optimizations should never compromise assignment safety.

## User Stories

| User Story                                                                                                     | Description                                                                                          | Status      | Tasks   | Dependencies                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- | ------- | ---------------------------------------------------------------------------- |
| [Implement Work Assignment Endpoint](./user-stories/implement-work-assignment-endpoint/tasks.md)               | Atomic story assignment with eligibility rules, priority selection, and typed discriminator response | Complete    | 4 tasks | None                                                                         |
| [Implement Completion & Failure Endpoints](./user-stories/implement-completion-and-failure-endpoints/tasks.md) | Task completion with cascading, story completion with cost recording, story failure, and story reset | Not Started | 5 tasks | Implement Work Assignment Endpoint                                           |
| [Implement Timeout & Reclamation](./user-stories/implement-timeout-and-reclamation/tasks.md)                   | Timeout checking, manual unassignment, and race condition handling for timed-out work                | Not Started | 4 tasks | Implement Work Assignment Endpoint, Implement Completion & Failure Endpoints |

## Dependency Graph

```
Implement Work Assignment Endpoint
    |
    v
Implement Completion & Failure Endpoints
    |
    v
Implement Timeout & Reclamation
```

## Suggested Implementation Order

1. **Phase 1:** Implement Work Assignment Endpoint — the foundational orchestration action: assigning stories to workers
2. **Phase 2:** Implement Completion & Failure Endpoints — handling work results: success, failure, and cost recording
3. **Phase 3:** Implement Timeout & Reclamation — handling stale work: timeouts, race conditions, and manual intervention

## Safety-Critical Note

All three user stories in this epic are **safety-critical**. The assignment endpoint is the core of the orchestration system and must guarantee atomicity (no double assignments) via optimistic locking. The completion endpoints drive cascading status changes that determine which tasks/stories are available for assignment. The timeout logic must handle the most dangerous race condition in the system: a worker completing work at the same moment the timeout fires.

Key invariants that must be maintained:

1. **At most one worker per story per project** — a story is never assigned to two workers simultaneously
2. **No lost completions** — if a worker completes work before timeout fires, the completion is not overwritten
3. **No orphaned assignments** — every in-progress story is either actively worked on, or reclaimed by timeout
4. **Correct cascading** — task completion correctly unblocks dependent tasks and propagates to story/epic/project status
