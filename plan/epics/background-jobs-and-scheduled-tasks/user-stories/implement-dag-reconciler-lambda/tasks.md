# Implement DAG Reconciler Lambda — Tasks

## User Story Summary

- **Title:** Implement DAG Reconciler Lambda
- **Description:** Create a standalone Lambda function that periodically performs a full-graph consistency check across all projects. The reconciler verifies that all task and story statuses are correct given the current DAG state and completion status. It detects and fixes inconsistencies such as a task marked "blocked" whose dependencies are all complete (should be "not_started"), or a story marked "in_progress" with no assigned worker. Each correction is logged as an audit event for traceability.
- **Status:** Not Started
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** None (within this epic)

## Tasks

| Task | Description | Status | Assigned Agent | Dependencies |
| --- | --- | --- | --- | --- |
| [Create DAG Reconciler Handler](./create-dag-reconciler-handler.md) | Lambda handler that performs full-graph consistency checks and fixes status inconsistencies | Not Started | backend-developer | None |
| [Configure DAG Reconciler Build](./configure-dag-reconciler-build.md) | tsup build configuration for ARM64 Lambda deployment | Not Started | backend-developer | Create DAG Reconciler Handler |
| [Write DAG Reconciler Tests](./write-dag-reconciler-tests.md) | Unit tests for inconsistency detection, correction, edge cases, and audit logging | Not Started | qa-expert | Create DAG Reconciler Handler |

## Dependency Graph

```
Create DAG Reconciler Handler
    |
    +---> Configure DAG Reconciler Build
    |
    +---> Write DAG Reconciler Tests
```

## Suggested Implementation Order

1. **Phase 1:** Create DAG Reconciler Handler — the core Lambda handler with graph traversal and consistency checking
2. **Phase 2 (parallel):** Configure DAG Reconciler Build + Write DAG Reconciler Tests — build configuration and tests can proceed in parallel once the handler exists
