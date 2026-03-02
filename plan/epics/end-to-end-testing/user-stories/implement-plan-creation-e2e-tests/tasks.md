# Implement Plan Creation & Publish E2E Tests — Tasks

## User Story Summary

- **Title:** Implement Plan Creation & Publish E2E Tests
- **Description:** E2E tests covering the full plan creation lifecycle from empty project to fully defined plan, the publish flow with status validation, dependency cycle detection with inline UI error feedback, and destructive action confirmation modals for entity deletion.
- **Status:** Not Started
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Total Tasks:** 4
- **Dependencies:** Set Up Playwright Infrastructure

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Test Full Plan Creation Flow](./test-full-plan-creation-flow.md) | E2E test: create project, create epic, create user story, create tasks with personas, add dependencies between tasks, verify DAG validates with no cycles — complete happy path from empty project to fully defined plan | Not Started | qa-expert | None |
| [Test Publish Flow](./test-publish-flow.md) | E2E test: publish user stories (validates tasks have persona + acceptance criteria), publish epics, publish project (validates all children Ready), verify status transitions, and test rejection when required fields are missing | Not Started | qa-expert | Test Full Plan Creation Flow |
| [Test Dependency Cycle Detection UI](./test-dependency-cycle-detection-ui.md) | E2E test: create tasks, attempt circular dependency, verify inline error with cycle path, verify dependency not saved | Not Started | qa-expert | Test Full Plan Creation Flow |
| [Test Destructive Action Confirmations](./test-destructive-action-confirmations.md) | E2E test: delete project with children shows confirmation modal with entity counts, cancel leaves entities intact, confirm deletes entities. Test delete epic, story, task. Test deletion blocked when in-progress | Not Started | qa-expert | None |

## Dependency Graph

```
Test Full Plan Creation Flow
    |
    +---> Test Publish Flow
    |
    +---> Test Dependency Cycle Detection UI

Test Destructive Action Confirmations    (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** Test Full Plan Creation Flow + Test Destructive Action Confirmations — the creation flow establishes the plan structure needed by publish and cycle detection tests, while destructive actions are independent
2. **Phase 2 (parallel):** Test Publish Flow + Test Dependency Cycle Detection UI — both depend on having a created plan from the first task
