# Implement Audit Archiver Lambda — Tasks

## User Story Summary

- **Title:** Implement Audit Archiver Lambda
- **Description:** Create a standalone Lambda function that archives old DynamoDB audit events to S3. The function queries audit events older than 90 days (approaching TTL expiration), exports them as newline-delimited JSON (NDJSON) to S3 with date-partitioned key prefixes, and handles pagination for large result sets. This ensures audit data is preserved beyond the DynamoDB TTL window for compliance and historical analysis.
- **Status:** Complete
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Total Tasks:** 3
- **Dependencies:** None (within this epic)

## Tasks

| Task                                                                  | Description                                                               | Status   | Assigned Agent    | Dependencies                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- | ----------------- | ----------------------------- |
| [Create Audit Archiver Handler](./create-audit-archiver-handler.md)   | Lambda handler that exports old DynamoDB audit events to S3 as NDJSON     | Complete | backend-developer | None                          |
| [Configure Audit Archiver Build](./configure-audit-archiver-build.md) | tsup build configuration for ARM64 Lambda deployment                      | Complete | backend-developer | Create Audit Archiver Handler |
| [Write Audit Archiver Tests](./write-audit-archiver-tests.md)         | Unit tests for S3 partitioning, pagination, NDJSON format, and edge cases | Complete | qa-expert         | Create Audit Archiver Handler |

## Dependency Graph

```
Create Audit Archiver Handler
    |
    +---> Configure Audit Archiver Build
    |
    +---> Write Audit Archiver Tests
```

## Suggested Implementation Order

1. **Phase 1:** Create Audit Archiver Handler — the core Lambda handler with DynamoDB scanning and S3 archival
2. **Phase 2 (parallel):** Configure Audit Archiver Build + Write Audit Archiver Tests — build configuration and tests can proceed in parallel once the handler exists
