# End-to-End Testing — User Stories

## Epic Summary

- **Title:** End-to-End Testing
- **Description:** Playwright E2E tests for all critical user journeys with multi-browser support, page object models, and MSW mocking. Covers authentication, plan creation, work execution, entity management, DAG graph interaction, and responsive layouts.
- **Status:** In Progress (laila-agent-2)
- **Total User Stories:** 6
- **Dependencies:** Epic 7 (Orchestration & Work Assignment), Epic 9 (Entity Management UI), Epic 10 (Dashboard & Monitoring UI), Epic 11 (Dependency Graph Visualization), Epic 12 (Audit Log & Activity Feed), Epic 13 (Background Jobs & Scheduled Tasks)

## User Stories

| User Story                                                                                                            | Description                                                                                                                                                               | Status      | Tasks   | Dependencies                     |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------- | -------------------------------- |
| [Set Up Playwright Infrastructure](./user-stories/setup-playwright-infrastructure/tasks.md)                           | Install Playwright, configure multi-browser support, create page object models, MSW mocking layer, auth fixtures, and shared test utilities                               | Complete    | 4 tasks | None                             |
| [Implement Authentication E2E Tests](./user-stories/implement-authentication-e2e-tests/tasks.md)                      | E2E tests for Google OAuth sign-in, session persistence, sign-out, and first-time user onboarding empty states                                                            | Not Started | 3 tasks | Set Up Playwright Infrastructure |
| [Implement Plan Creation E2E Tests](./user-stories/implement-plan-creation-e2e-tests/tasks.md)                        | E2E tests for full plan creation flow (project to tasks), publish lifecycle, dependency cycle detection, and destructive action confirmations                             | Not Started | 4 tasks | Set Up Playwright Infrastructure |
| [Implement Work Execution E2E Tests](./user-stories/implement-work-execution-e2e-tests/tasks.md)                      | E2E tests for work assignment, status progression, failure recovery, timeout reclamation, manual unassignment, and read-only enforcement during in-progress states        | Not Started | 5 tasks | Set Up Playwright Infrastructure |
| [Implement Entity Management E2E Tests](./user-stories/implement-entity-management-e2e-tests/tasks.md)                | E2E tests for worker creation with API key reveal, project access management, persona CRUD with deletion guards, and audit log verification                               | Not Started | 4 tasks | Set Up Playwright Infrastructure |
| [Implement DAG Graph & Responsive Layout E2E Tests](./user-stories/implement-graph-and-responsive-e2e-tests/tasks.md) | E2E tests for DAG graph interaction (zoom, pan, node click, view toggle, status filters), and responsive layout verification across desktop, tablet, and mobile viewports | Not Started | 4 tasks | Set Up Playwright Infrastructure |

## Dependency Graph

```
Set Up Playwright Infrastructure
    |
    +---> Implement Authentication E2E Tests
    |
    +---> Implement Plan Creation E2E Tests
    |
    +---> Implement Work Execution E2E Tests
    |
    +---> Implement Entity Management E2E Tests
    |
    +---> Implement DAG Graph & Responsive Layout E2E Tests
```

## Suggested Implementation Order

1. **Phase 1:** Set Up Playwright Infrastructure — foundational Playwright config, page object models, MSW mocking, auth fixtures, and shared utilities that all test stories depend on
2. **Phase 2 (parallel):** All remaining user stories can be implemented in parallel once infrastructure is in place:
   - Implement Authentication E2E Tests
   - Implement Plan Creation E2E Tests
   - Implement Work Execution E2E Tests
   - Implement Entity Management E2E Tests
   - Implement DAG Graph & Responsive Layout E2E Tests
