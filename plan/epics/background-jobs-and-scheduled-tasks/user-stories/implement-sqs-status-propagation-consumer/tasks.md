# Implement SQS Status Propagation Consumer — Tasks

## User Story Summary

- **Title:** Implement SQS Status Propagation Consumer
- **Description:** Create a Lambda function triggered by an SQS queue that processes cascading status re-evaluation events. When a task completes, the system publishes an event to the SQS queue. This consumer evaluates all dependent tasks: if all dependencies of a dependent task are now complete, it transitions from "blocked" to "not_started". The consumer also propagates status changes upward to story and epic levels. It handles batch processing of multiple events per invocation and is designed for idempotent, safe re-processing.
- **Status:** Complete
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** None (within this epic)

## Tasks

| Task                                                                        | Description                                                                       | Status   | Assigned Agent    | Dependencies                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- | ----------------- | --------------------------------- |
| [Create Status Propagation Handler](./create-status-propagation-handler.md) | SQS-triggered Lambda handler for cascading status re-evaluation                   | Complete | backend-developer | None                              |
| [Configure SQS Consumer Build](./configure-sqs-consumer-build.md)           | tsup build configuration with SQS event types, DLQ, and retry settings            | Complete | backend-developer | Create Status Propagation Handler |
| [Write Status Propagation Tests](./write-status-propagation-tests.md)       | Unit tests for cascading unblock, batch processing, idempotency, and DLQ behavior | Complete | qa-expert         | Create Status Propagation Handler |

## Dependency Graph

```
Create Status Propagation Handler
    |
    +---> Configure SQS Consumer Build
    |
    +---> Write Status Propagation Tests
```

## Suggested Implementation Order

1. **Phase 1:** Create Status Propagation Handler — the core SQS consumer with cascading evaluation logic
2. **Phase 2 (parallel):** Configure SQS Consumer Build + Write Status Propagation Tests — build configuration and tests can proceed in parallel once the handler exists
