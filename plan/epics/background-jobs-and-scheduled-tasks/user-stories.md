# Background Jobs & Scheduled Tasks — User Stories

## Epic Summary

- **Title:** Background Jobs & Scheduled Tasks
- **Description:** Lambda functions for timeout checking, DAG reconciliation, audit archival, and SQS-driven status propagation. These background processes ensure system consistency, reclaim timed-out work, archive old audit events, and propagate cascading status changes asynchronously. All functions are deployed as standalone AWS Lambda handlers bundled with tsup, targeting ARM64 (Graviton) architecture.
- **Status:** In Progress (laila-agent-3)
- **Total User Stories:** 4
- **Dependencies:** Epic 7 (Orchestration & Work Assignment API)

## User Stories

| User Story                                                                                                     | Description                                                                                  | Status                      | Tasks   | Dependencies |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- | ------- | ------------ |
| [Implement Timeout Checker Lambda](./user-stories/implement-timeout-checker-lambda/tasks.md)                   | Lambda function that identifies and reclaims timed-out story assignments                     | Complete                    | 3 tasks | None         |
| [Implement DAG Reconciler Lambda](./user-stories/implement-dag-reconciler-lambda/tasks.md)                     | Lambda function that performs full-graph consistency checks and fixes status inconsistencies | Complete                    | 3 tasks | None         |
| [Implement Audit Archiver Lambda](./user-stories/implement-audit-archiver-lambda/tasks.md)                     | Lambda function that archives old DynamoDB audit events to S3 as newline-delimited JSON      | In Progress (laila-agent-2) | 3 tasks | None         |
| [Implement SQS Status Propagation Consumer](./user-stories/implement-sqs-status-propagation-consumer/tasks.md) | SQS-triggered Lambda that processes cascading status re-evaluation events                    | In Progress (laila-agent-3) | 3 tasks | None         |

## Dependency Graph

```
Implement Timeout Checker Lambda        (independent)
Implement DAG Reconciler Lambda         (independent)
Implement Audit Archiver Lambda         (independent)
Implement SQS Status Propagation Consumer (independent)
```

All four user stories are independent of each other and can be developed in parallel. They all depend on Epic 7 (Orchestration & Work Assignment API) for the domain models and database schemas they operate against.

## Suggested Implementation Order

1. **Phase 1 (parallel):** All four user stories can be implemented concurrently:
   - Implement Timeout Checker Lambda — ensures timed-out assignments are reclaimed
   - Implement DAG Reconciler Lambda — ensures graph consistency across all projects
   - Implement Audit Archiver Lambda — manages audit log lifecycle and archival
   - Implement SQS Status Propagation Consumer — handles async cascading status updates

## Technical Context

- **Runtime:** AWS Lambda with Node.js 22.x, ARM64 (Graviton2)
- **Bundling:** tsup (esbuild-based) for each function, producing self-contained bundles
- **Memory:** 512MB-1024MB per function, configurable per use case
- **Scheduling:** EventBridge Scheduler for periodic invocations (timeout checker every 1 min, DAG reconciler every 5 min, audit archiver daily)
- **Async Events:** SQS standard queue for status propagation with DLQ (3 retries, 4-day retention)
- **Database:** PostgreSQL (Neon) via Drizzle ORM for project/story/task state; DynamoDB for audit events
- **Storage:** S3 for audit archive (newline-delimited JSON, partitioned by date)
- **Observability:** pino structured logging, CloudWatch Logs, X-Ray tracing
