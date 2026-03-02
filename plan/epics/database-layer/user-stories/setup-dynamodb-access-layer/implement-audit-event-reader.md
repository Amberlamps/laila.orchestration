# Implement Audit Event Reader

## Task Details

- **Title:** Implement Audit Event Reader
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Set Up DynamoDB Access Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Define DynamoDB Table Schema

## Description

Implement the audit event reader that queries audit events from DynamoDB. The reader supports two primary access patterns:

1. **By entity** — Query all audit events for a specific entity (e.g., all events for project X), using the partition key
2. **By actor** — Query all audit events performed by a specific actor (e.g., all actions by user Y), using the GSI

Both patterns support:
- Cursor-based pagination (using DynamoDB's `LastEvaluatedKey` as the cursor)
- Time range filtering (events between start and end timestamps)
- Configurable page size

## Acceptance Criteria

- [ ] `packages/database/src/dynamo/audit-reader.ts` exists
- [ ] `queryByEntity(entityType, entityId, options)` queries audit events for a specific entity:
  - Uses the partition key (`entityType:entityId`)
  - Supports time range filtering via sort key conditions (`between startTime and endTime`)
  - Returns paginated results with cursor for next page
  - Results are ordered chronologically (ascending by default, configurable)
- [ ] `queryByActor(actorId, options)` queries audit events by the performing actor:
  - Uses the `actorId-timestamp-index` GSI
  - Supports time range filtering via GSI sort key
  - Returns paginated results with cursor for next page
- [ ] Both methods accept an `options` parameter with: `limit` (default 50, max 100), `cursor` (opaque string for pagination), `startTime` (ISO string), `endTime` (ISO string), `order` ('asc' | 'desc')
- [ ] Cursor-based pagination:
  - The cursor is a base64-encoded `LastEvaluatedKey` from DynamoDB
  - Passing the cursor to the next request continues from where the previous page left off
  - When no more results exist, the cursor is null/undefined
- [ ] Response shape: `{ events: AuditEventItem[], cursor: string | null, count: number }`
- [ ] Tenant access validation: the reader verifies that the queried entity/actor belongs to the requesting tenant
- [ ] Error handling: wraps DynamoDB errors in descriptive application errors
- [ ] Code comments explain the cursor-based pagination approach and GSI query pattern

## Technical Notes

- Entity query implementation:
  ```typescript
  // packages/database/src/dynamo/audit-reader.ts
  // Reads audit events from DynamoDB with cursor-based pagination
  // Supports two access patterns: by entity (PK) and by actor (GSI)
  import { QueryCommand } from '@aws-sdk/lib-dynamodb';
  import { getDynamoClient } from './client';
  import { AUDIT_TABLE_NAME, ACTOR_INDEX_NAME, type AuditEventItem } from './schema';

  export interface AuditQueryOptions {
    limit?: number;         // Page size (default 50, max 100)
    cursor?: string;        // Opaque pagination cursor (base64 encoded LastEvaluatedKey)
    startTime?: string;     // ISO timestamp — filter events from this time
    endTime?: string;       // ISO timestamp — filter events until this time
    order?: 'asc' | 'desc'; // Sort order (default 'desc' — newest first)
  }

  export interface AuditQueryResult {
    events: AuditEventItem[];
    cursor: string | null;  // Null when no more pages
    count: number;
  }

  /**
   * Queries audit events for a specific entity
   * Uses the table's partition key for efficient single-entity queries
   */
  export async function queryByEntity(
    entityType: string,
    entityId: string,
    options: AuditQueryOptions = {},
  ): Promise<AuditQueryResult> {
    const client = getDynamoClient();
    const limit = Math.min(options.limit ?? 50, 100);
    const scanForward = (options.order ?? 'desc') === 'asc';

    // Build key condition expression
    let keyCondition = 'entityId = :entityId';
    const expressionValues: Record<string, unknown> = {
      ':entityId': `${entityType}:${entityId}`,
    };

    // Add time range filter on sort key if specified
    if (options.startTime && options.endTime) {
      keyCondition += ' AND #sk BETWEEN :start AND :end';
      expressionValues[':start'] = options.startTime;
      expressionValues[':end'] = `${options.endTime}~`; // ~ sorts after Z in ASCII
    } else if (options.startTime) {
      keyCondition += ' AND #sk >= :start';
      expressionValues[':start'] = options.startTime;
    } else if (options.endTime) {
      keyCondition += ' AND #sk <= :end';
      expressionValues[':end'] = `${options.endTime}~`;
    }

    const command = new QueryCommand({
      TableName: AUDIT_TABLE_NAME,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: { '#sk': 'timestamp#eventId' },
      ScanIndexForward: scanForward,
      Limit: limit,
      ExclusiveStartKey: options.cursor
        ? JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        : undefined,
    });

    const response = await client.send(command);
    const cursor = response.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64url')
      : null;

    return {
      events: (response.Items ?? []) as AuditEventItem[],
      cursor,
      count: response.Count ?? 0,
    };
  }
  ```
- GSI query for actor follows the same pattern but specifies `IndexName: ACTOR_INDEX_NAME` and uses `actorId` as the partition key with `timestamp` as the sort key
- Cursor encoding: `LastEvaluatedKey` is a DynamoDB-specific object — base64url-encoding it creates an opaque cursor string that clients can pass back for the next page
- Time range filtering leverages the sort key's ISO timestamp prefix for efficient range scans without requiring filter expressions
- The tilde `~` character after `endTime` in the BETWEEN ensures events at exactly `endTime` are included (since the sort key has the `#eventId` suffix)
- Consider adding a `countByEntity` method for displaying event counts without fetching all events
- The reader should NOT expose raw DynamoDB implementation details (like `LastEvaluatedKey`) to consumers — the cursor abstraction hides this

## References

- **Functional Requirements:** Audit event querying, pagination, time-based filtering
- **Design Specification:** DynamoDB query patterns, cursor-based pagination, GSI access
- **Project Setup:** packages/database DynamoDB module

## Estimated Complexity

Medium — DynamoDB query construction with sort key conditions, cursor-based pagination, and GSI queries. The pagination cursor encoding/decoding and time range filtering add non-trivial logic.
