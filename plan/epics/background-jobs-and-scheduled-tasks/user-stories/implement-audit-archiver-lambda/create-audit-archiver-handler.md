# Create Audit Archiver Handler

## Task Details

- **Title:** Create Audit Archiver Handler
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Audit Archiver Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** None

## Description

Create the Lambda handler at `functions/audit-archiver/src/handler.ts` that archives old audit events from DynamoDB to S3. This function is invoked daily by EventBridge Scheduler to export audit events older than 90 days as newline-delimited JSON (NDJSON) files, partitioned by date in S3 for efficient querying.

### Handler Implementation

```typescript
// functions/audit-archiver/src/handler.ts
// Lambda handler for the audit archiver background job.
// Invoked by EventBridge Scheduler once per day.
// Exports audit events older than 90 days from DynamoDB to S3
// as newline-delimited JSON, partitioned by year/month/day.

import type { ScheduledEvent, Context } from "aws-lambda";
import { scanExpiredEvents } from "./dynamo";
import { uploadArchive } from "./s3";
import { logger } from "./logger";

interface ArchiveResult {
  eventsArchived: number;
  filesWritten: number;
  totalSizeBytes: number;
  partitions: string[];
}

/**
 * Main handler for the audit archiver Lambda function.
 *
 * Flow:
 * 1. Calculate the cutoff timestamp: now - 90 days
 * 2. Scan DynamoDB for audit events with timestamp < cutoff
 *    (use paginated scan with FilterExpression)
 * 3. Group events by date (year/month/day) for S3 partitioning
 * 4. For each date partition:
 *    a. Serialize events as NDJSON (one JSON object per line)
 *    b. Upload to S3: s3://audit-archive-bucket/audit/YYYY/MM/DD/events-{timestamp}.ndjson
 * 5. Optionally delete archived events from DynamoDB (or rely on TTL)
 * 6. Return summary: events archived, files written, total size
 */
export const handler = async (
  event: ScheduledEvent,
  context: Context
): Promise<ArchiveResult> => {
  // Implementation here
};
```

### DynamoDB Scanning

```typescript
// functions/audit-archiver/src/dynamo.ts
// DynamoDB query functions for scanning expired audit events.
// Handles pagination for large result sets using LastEvaluatedKey.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  type ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

interface AuditEvent {
  pk: string;          // Partition key: "EVENT#{eventId}"
  sk: string;          // Sort key: "TS#{isoTimestamp}"
  eventType: string;   // e.g., "story.assigned", "task.completed"
  projectId: string;
  entityId: string;
  entityType: string;
  userId: string | null;
  agentId: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;   // ISO 8601
  ttl: number;         // Unix epoch seconds for DynamoDB TTL
}

/**
 * Scan DynamoDB for audit events older than the cutoff timestamp.
 * Uses paginated scanning with FilterExpression on the timestamp field.
 * Yields batches of events to avoid loading all events into memory.
 *
 * Note: DynamoDB Scan is expensive but acceptable here because:
 * 1. This runs once per day during off-peak hours
 * 2. The TTL field provides a natural secondary index for time-based filtering
 * 3. Most events will have been TTL-expired already; we archive the remainder
 */
export async function* scanExpiredEvents(
  cutoffTimestamp: string,
  tableName: string
): AsyncGenerator<AuditEvent[], void, unknown> {
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const params: ScanCommandInput = {
      TableName: tableName,
      FilterExpression: "#ts < :cutoff",
      ExpressionAttributeNames: { "#ts": "timestamp" },
      ExpressionAttributeValues: { ":cutoff": cutoffTimestamp },
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 1000, // Process in batches of 1000
    };

    const result = await docClient.send(new ScanCommand(params));
    lastEvaluatedKey = result.LastEvaluatedKey;

    if (result.Items && result.Items.length > 0) {
      yield result.Items as AuditEvent[];
    }
  } while (lastEvaluatedKey);
}
```

### S3 Upload

```typescript
// functions/audit-archiver/src/s3.ts
// S3 upload functions for storing archived audit events.
// Events are stored as newline-delimited JSON (NDJSON) files,
// partitioned by year/month/day for efficient Athena querying.

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});

/**
 * Upload a batch of audit events to S3 as NDJSON.
 *
 * S3 key format: audit/{year}/{month}/{day}/events-{timestamp}.ndjson
 * Example: audit/2026/01/15/events-1737936000000.ndjson
 *
 * NDJSON format: each line is a complete JSON object, no trailing comma.
 * This format is compatible with AWS Athena, Spark, and other big data tools.
 */
export async function uploadArchive(params: {
  bucketName: string;
  events: AuditEvent[];
  partitionDate: { year: string; month: string; day: string };
  batchTimestamp: number;
}): Promise<{ key: string; sizeBytes: number }> {
  const { bucketName, events, partitionDate, batchTimestamp } = params;

  // Serialize events as NDJSON: one JSON object per line
  const ndjson = events.map((event) => JSON.stringify(event)).join("\n");
  const body = Buffer.from(ndjson, "utf-8");

  const key = `audit/${partitionDate.year}/${partitionDate.month}/${partitionDate.day}/events-${batchTimestamp}.ndjson`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: "application/x-ndjson",
      // Server-side encryption with S3-managed keys
      ServerSideEncryption: "AES256",
    })
  );

  return { key, sizeBytes: body.byteLength };
}
```

### Date Partitioning

```typescript
// functions/audit-archiver/src/partition.ts
// Groups audit events by date for S3 partitioning.
// Each unique date becomes a separate S3 prefix.

/**
 * Group audit events by their date (year/month/day).
 * Returns a Map where keys are "YYYY/MM/DD" strings
 * and values are arrays of events for that date.
 */
export function groupByDate(
  events: AuditEvent[]
): Map<string, AuditEvent[]> {
  const groups = new Map<string, AuditEvent[]>();

  for (const event of events) {
    const date = new Date(event.timestamp);
    const key = [
      date.getUTCFullYear().toString(),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
    ].join("/");

    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }

  return groups;
}
```

## Acceptance Criteria

- [ ] Lambda handler is defined at `functions/audit-archiver/src/handler.ts`
- [ ] Handler accepts `ScheduledEvent` from EventBridge and returns an `ArchiveResult`
- [ ] DynamoDB is scanned for audit events older than 90 days
- [ ] Pagination is handled via `LastEvaluatedKey` for large result sets
- [ ] Events are grouped by date for S3 partitioning
- [ ] S3 keys follow the format `audit/{year}/{month}/{day}/events-{timestamp}.ndjson`
- [ ] Events are serialized as NDJSON (one JSON object per line, no trailing newline issues)
- [ ] S3 objects use server-side encryption (SSE-S3 / AES256)
- [ ] Content-Type is set to `application/x-ndjson`
- [ ] The handler logs a summary: events archived, files written, total size
- [ ] The handler handles empty results gracefully (no events to archive)
- [ ] Memory usage is controlled by processing events in batches (not loading all into memory)
- [ ] pino structured logging is used for all log output
- [ ] No `any` types are used in the implementation

## Technical Notes

- The 90-day retention window aligns with the DynamoDB TTL configuration. The archiver runs before TTL deletes the events, preserving them in S3 for long-term storage.
- NDJSON (Newline-Delimited JSON) is chosen over regular JSON arrays because it is streamable, line-processable, and compatible with AWS Athena for ad-hoc querying of archived audit data.
- The async generator pattern for DynamoDB scanning avoids loading all events into memory at once. Events are processed in batches of 1000, grouped by date, and uploaded to S3 incrementally.
- S3 date partitioning (`year/month/day`) enables efficient prefix-based queries in Athena and S3 Select.
- The function should complete within the Lambda 15-minute timeout. For very large archives (millions of events), consider increasing the Lambda timeout or splitting across multiple invocations.

## References

- **Functional Requirements:** FR-BG-005 (audit archival), FR-AUDIT-003 (long-term storage)
- **Design Specification:** Section 12.3 (Audit Archiver), Section 11 (Audit Log)
- **DynamoDB Schema:** Audit events table with TTL (defined in Epic 3, Database Layer)
- **S3 Bucket:** Audit archive bucket (defined in Epic 14, Terraform)
- **Infrastructure:** EventBridge Scheduler rule — daily at 02:00 UTC (defined in Epic 14)

## Estimated Complexity

Medium — Straightforward DynamoDB scan and S3 upload, but requires careful handling of pagination, batching, date partitioning, and NDJSON serialization. Memory management is important for large archives.
