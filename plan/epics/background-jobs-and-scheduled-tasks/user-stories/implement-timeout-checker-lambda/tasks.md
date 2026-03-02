# Implement Timeout Checker Lambda — Tasks

## User Story Summary

- **Title:** Implement Timeout Checker Lambda
- **Description:** Create a standalone Lambda function that periodically scans all in-progress user stories across all projects, identifies stories where the assigned worker has exceeded the project-specific timeout duration, and reclaims them. Reclamation involves clearing the assigned worker, resetting the story status based on DAG state, logging the previous attempt with a "timeout" reason, and writing an audit event to DynamoDB.
- **Status:** Not Started
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** None (within this epic)

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Create Timeout Checker Handler](./create-timeout-checker-handler.md) | Lambda handler that queries in-progress stories, checks timeouts, and reclaims timed-out assignments | Not Started | backend-developer | None |
| [Configure Timeout Checker Build](./configure-timeout-checker-build.md) | tsup build configuration for ARM64 Lambda deployment | Not Started | backend-developer | Create Timeout Checker Handler |
| [Write Timeout Checker Tests](./write-timeout-checker-tests.md) | Unit tests for timeout detection, reclamation, race conditions, and audit logging | Not Started | qa-expert | Create Timeout Checker Handler |

## Dependency Graph

```
Create Timeout Checker Handler
    |
    +---> Configure Timeout Checker Build
    |
    +---> Write Timeout Checker Tests
```

## Suggested Implementation Order

1. **Phase 1:** Create Timeout Checker Handler — the core Lambda handler with timeout detection and reclamation logic
2. **Phase 2 (parallel):** Configure Timeout Checker Build + Write Timeout Checker Tests — build configuration and tests can proceed in parallel once the handler exists
