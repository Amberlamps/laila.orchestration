# Implement Audit Event Writer

## Task Details

- **Title:** Implement Audit Event Writer
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Set Up DynamoDB Access Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Define DynamoDB Table Schema

## Description

Implement the audit event writer that persists audit events to DynamoDB. The writer should support both single-event writes (for real-time audit logging during API requests) and batch writes (for bulk audit operations like cascade deletes or bulk status updates).

The writer is called by the API layer and repository layer whenever a significant action occurs (entity created, updated, deleted, status changed, work assigned, work completed).

## Acceptance Criteria

- [ ] `packages/database/src/dynamo/audit-writer.ts` exists
- [ ] `writeAuditEvent(event)` writes a single audit event to DynamoDB:
  - Accepts a typed audit event input (without the computed sort key)
  - Generates the composite sort key from timestamp and eventId
  - Sets TTL based on configurable retention period (default: 90 days)
  - Returns the written event
- [ ] `writeAuditEventBatch(events)` writes multiple audit events in a single batch:
  - Accepts an array of audit event inputs
  - Uses DynamoDB `BatchWriteItem` for efficient multi-item writes
  - Handles the 25-item batch limit by chunking larger arrays
  - Handles unprocessed items (DynamoDB retry on partial failures)
  - Returns the count of successfully written events
- [ ] Input validation: validates required fields before writing (entityId, action, actorType, actorId, tenantId)
- [ ] Error handling: wraps DynamoDB errors in descriptive application errors
- [ ] The writer uses AWS SDK v3 `DynamoDBDocumentClient` for automatic marshalling/unmarshalling
- [ ] TTL calculation is correct: `Math.floor(Date.now() / 1000) + retentionDays * 86400`
- [ ] The retention period is configurable via environment variable (`AUDIT_RETENTION_DAYS`, default 90)
- [ ] Code comments explain the batch write chunking and retry strategy

## Technical Notes

- Audit event writer implementation:

  ```typescript
  // packages/database/src/dynamo/audit-writer.ts
  // Writes audit events to DynamoDB for the audit log system
  // Supports single writes (real-time) and batch writes (bulk operations)
  import { PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
  import { randomUUID } from 'node:crypto';
  import { getDynamoClient } from './client';
  import { AUDIT_TABLE_NAME, type AuditEventItem } from './schema';

  const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS ?? '90', 10);
  const BATCH_SIZE_LIMIT = 25; // DynamoDB BatchWriteItem limit

  export interface AuditEventInput {
    entityType: string;
    entityId: string;
    action: string;
    actorType: 'user' | 'worker' | 'system';
    actorId: string;
    tenantId: string;
    changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
    metadata?: Record<string, unknown>;
  }

  /**
   * Writes a single audit event to DynamoDB
   * Used for real-time audit logging during API request handling
   */
  export async function writeAuditEvent(input: AuditEventInput): Promise<AuditEventItem> {
    const client = getDynamoClient();
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    const item: AuditEventItem = {
      entityId: `${input.entityType}:${input.entityId}`,
      'timestamp#eventId': `${timestamp}#${eventId}`,
      actorId: input.actorId,
      timestamp,
      eventId,
      entityType: input.entityType,
      action: input.action,
      actorType: input.actorType,
      tenantId: input.tenantId,
      changes: input.changes,
      metadata: input.metadata,
      expiresAt: Math.floor(Date.now() / 1000) + RETENTION_DAYS * 86400,
    };

    await client.send(
      new PutCommand({
        TableName: AUDIT_TABLE_NAME,
        Item: item,
      }),
    );

    return item;
  }
  ```

- Batch write with chunking and retry:

  ```typescript
  /**
   * Writes multiple audit events in batches of 25 (DynamoDB limit)
   * Automatically retries unprocessed items with exponential backoff
   */
  export async function writeAuditEventBatch(inputs: AuditEventInput[]): Promise<number> {
    const client = getDynamoClient();
    let written = 0;

    // Chunk into batches of 25
    for (let i = 0; i < inputs.length; i += BATCH_SIZE_LIMIT) {
      const chunk = inputs.slice(i, i + BATCH_SIZE_LIMIT);
      const items = chunk.map(buildAuditItem);

      const command = new BatchWriteCommand({
        RequestItems: {
          [AUDIT_TABLE_NAME]: items.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      });

      const response = await client.send(command);

      // Handle unprocessed items (DynamoDB throttling)
      const unprocessed = response.UnprocessedItems?.[AUDIT_TABLE_NAME]?.length ?? 0;
      written += chunk.length - unprocessed;

      // TODO: Implement exponential backoff retry for unprocessed items
    }

    return written;
  }
  ```

- The `changes` field captures before/after state for auditing:
  ```typescript
  // Example: audit event for a project status update
  await writeAuditEvent({
    entityType: 'project',
    entityId: projectId,
    action: 'status_changed',
    actorType: 'user',
    actorId: userId,
    tenantId: userId,
    changes: {
      before: { lifecycleStatus: 'draft' },
      after: { lifecycleStatus: 'planning' },
    },
  });
  ```
- Batch writes should handle the `UnprocessedItems` response — DynamoDB may return items that couldn't be written due to throttling. Implement exponential backoff retry for these.

## References

- **Functional Requirements:** Audit event creation, batch audit logging
- **Design Specification:** DynamoDB write patterns, batch operations
- **Project Setup:** packages/database DynamoDB module

## Estimated Complexity

Medium — Single and batch write operations with proper error handling and retry logic. The DynamoDB SDK v3 API is straightforward but batch write chunking and unprocessed item handling add complexity.
