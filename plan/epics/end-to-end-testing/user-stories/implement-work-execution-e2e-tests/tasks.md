# Implement Work Execution & Status Progression E2E Tests — Tasks

## User Story Summary

- **Title:** Implement Work Execution & Status Progression E2E Tests
- **Description:** E2E tests covering work assignment and cascading status progression, failure recovery with human review and reset, timeout reclamation with attempt logging, manual worker unassignment, and read-only enforcement during in-progress states. These tests verify the core orchestration engine behavior through the UI.
- **Status:** Complete
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Total Tasks:** 5
- **Dependencies:** Set Up Playwright Infrastructure

## Tasks

| Task                                                                                                | Description                                                                                                                                                                                                                                                | Status   | Assigned Agent | Dependencies |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- | ------------ |
| [Test Work Assignment and Status Progression](./test-work-assignment-and-status-progression.md)     | E2E test: create and publish project, simulate worker requesting work, verify story assigned and in-progress after polling, simulate task completions with cascading unblocks, verify story and project auto-complete, and verify dashboard widget updates | Complete | qa-expert      | None         |
| [Test Failure Recovery Flow](./test-failure-recovery-flow.md)                                       | E2E test: assign story to worker, simulate worker marking story as failed with error, verify Failed badge and error display, human reviews and edits task, clicks Reset, story returns to not-started/blocked, worker picks up again                       | Complete | qa-expert      | None         |
| [Test Timeout Reclamation UI](./test-timeout-reclamation-ui.md)                                     | E2E test: assign story to worker, wait for short test timeout, verify timeout reclamation banner appears, story reset to not-started, and previous attempt logged in Attempt History tab                                                                   | Complete | qa-expert      | None         |
| [Test Manual Worker Unassignment](./test-manual-worker-unassignment.md)                             | E2E test: assign story, navigate to Story Detail, click "Unassign Worker", confirm dialog, verify story resets and attempt logged, verify worker freed for new work                                                                                        | Complete | qa-expert      | None         |
| [Test Read-Only Enforcement During In-Progress](./test-read-only-enforcement-during-in-progress.md) | E2E test: assign story to worker, navigate to story detail, verify lock icons on fields, edit/delete buttons disabled, read-only banner visible, and API modification attempts are rejected                                                                | Complete | qa-expert      | None         |

## Dependency Graph

```
Test Work Assignment and Status Progression    (independent)
Test Failure Recovery Flow                     (independent)
Test Timeout Reclamation UI                    (independent)
Test Manual Worker Unassignment                (independent)
Test Read-Only Enforcement During In-Progress  (independent)
```

## Suggested Implementation Order

1. **Phase 1 (parallel):** All five tasks are independent and test different facets of the work execution lifecycle. They can be implemented simultaneously, each using shared MSW fixtures to mock worker API interactions and set up the required project state.
