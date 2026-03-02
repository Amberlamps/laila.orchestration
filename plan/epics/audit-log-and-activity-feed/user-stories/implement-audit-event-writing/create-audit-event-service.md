# Create Audit Event Service

## Task Details

- **Title:** Create Audit Event Service
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Audit Event Writing](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** None

## Description

Create a service that writes structured audit events to a DynamoDB table using AWS SDK v3. The service provides a simple interface for recording who did what to which entity and when. Events are the source of truth for all activity feeds and audit log pages throughout the application.

### DynamoDB Table Schema

```typescript
// packages/database/src/dynamodb/audit-events-table.ts
// DynamoDB table definition for audit events.
// Uses a composite primary key for efficient time-based queries.

/**
 * Table: AuditEvents
 *
 * Primary Key:
 * - Partition Key (PK): projectId (string)
 *   - For cross-project queries, use a GSI with a fixed partition key
 * - Sort Key (SK): timestamp#eventId (string)
 *   - Composite of ISO timestamp + UUID for uniqueness and ordering
 *   - Example: "2026-03-02T10:30:00.000Z#550e8400-e29b-41d4-a716-446655440000"
 *
 * Global Secondary Index (GSI):
 * - GSI1: CrossProjectIndex
 *   - PK: "ALL" (fixed value for cross-project queries)
 *   - SK: timestamp#eventId (same as table SK)
 *   - Enables: GET /api/v1/audit-events (cross-project, newest first)
 *
 * Attributes:
 * - eventId: string (UUID v4)
 * - projectId: string
 * - timestamp: string (ISO 8601)
 * - actor: {
 *     type: "worker" | "user" | "system"
 *     id: string (worker ID, user ID, or "system")
 *     name: string (worker name, user display name, or "System")
 *   }
 * - action: string (e.g., "created", "updated", "deleted",
 *     "status_changed", "assigned", "unassigned", "timeout_reclaimed")
 * - targetEntity: {
 *     type: "project" | "epic" | "story" | "task" | "worker" | "persona"
 *     id: string
 *     name: string
 *   }
 * - details: string (human-readable description of what changed)
 * - metadata: Record<string, string> (optional additional context)
 *
 * TTL: 90 days (optional, configurable via environment variable)
 */
```

### Audit Event Service

```typescript
// packages/database/src/dynamodb/audit-event-service.ts
// Service for writing and querying audit events in DynamoDB.
// Uses AWS SDK v3 DynamoDBDocumentClient for simplified operations.

import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

/**
 * AuditEventService provides:
 *
 * writeEvent(event: CreateAuditEventInput): Promise<AuditEvent>
 *   - Generates eventId (UUID v4) and timestamp (ISO 8601)
 *   - Constructs the composite sort key: `${timestamp}#${eventId}`
 *   - Writes to DynamoDB using PutCommand
 *   - Returns the created event with all generated fields
 *   - Errors are caught and logged but do NOT block the caller
 *     (audit is best-effort, not critical path)
 *
 * queryByProject(projectId: string, options?: QueryOptions):
 *   Promise<{ events: AuditEvent[], lastEvaluatedKey?: string }>
 *   - Queries the table with PK = projectId
 *   - ScanIndexForward: false (newest first)
 *   - Supports limit and cursor-based pagination (lastEvaluatedKey)
 *
 * queryAll(options?: QueryOptions):
 *   Promise<{ events: AuditEvent[], lastEvaluatedKey?: string }>
 *   - Queries the CrossProjectIndex GSI with PK = "ALL"
 *   - ScanIndexForward: false (newest first)
 *   - Supports limit and cursor-based pagination
 */
```

### Type Definitions

```typescript
// packages/shared/src/types/audit-event.ts
// Type definitions for audit events used across the application.

export interface AuditEventActor {
  type: "worker" | "user" | "system";
  id: string;
  name: string;
}

export interface AuditEventTarget {
  type: "project" | "epic" | "story" | "task" | "worker" | "persona";
  id: string;
  name: string;
}

export interface AuditEvent {
  eventId: string;
  projectId: string;
  timestamp: string;
  actor: AuditEventActor;
  action: string;
  targetEntity: AuditEventTarget;
  details: string;
  metadata?: Record<string, string>;
}

export interface CreateAuditEventInput {
  projectId: string;
  actor: AuditEventActor;
  action: string;
  targetEntity: AuditEventTarget;
  details: string;
  metadata?: Record<string, string>;
}
```

### DynamoDB Client Configuration

```typescript
// packages/database/src/dynamodb/client.ts
// Configures the DynamoDB client using AWS SDK v3.
// Uses environment variables for region and credentials.

/**
 * DynamoDB client configuration:
 * - Region: from AWS_REGION environment variable
 * - Table name: from AUDIT_EVENTS_TABLE environment variable
 * - Credentials: from AWS SDK default credential chain
 *   (environment variables, IAM role, etc.)
 *
 * Uses DynamoDBDocumentClient (from @aws-sdk/lib-dynamodb)
 * for automatic marshalling/unmarshalling of JavaScript objects.
 *
 * Configuration:
 * - marshallOptions: { removeUndefinedValues: true }
 * - unmarshallOptions: { wrapNumbers: false }
 */
```

## Acceptance Criteria

- [ ] Audit event service is created in `packages/database/src/dynamodb/`
- [ ] DynamoDB client is configured using AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- [ ] `writeEvent()` generates a UUID v4 event ID and ISO 8601 timestamp
- [ ] `writeEvent()` constructs a composite sort key (`timestamp#eventId`) for ordering and uniqueness
- [ ] `writeEvent()` writes the event to DynamoDB using `PutCommand`
- [ ] `writeEvent()` catches and logs errors without blocking the caller (best-effort audit logging)
- [ ] `queryByProject()` retrieves events for a specific project, newest first
- [ ] `queryAll()` retrieves events across all projects using the CrossProjectIndex GSI
- [ ] Both query methods support `limit` for pagination
- [ ] Both query methods support cursor-based pagination via `lastEvaluatedKey`
- [ ] AuditEvent type definitions are exported from `@laila/shared`
- [ ] Actor type supports "worker", "user", and "system" variants
- [ ] Target entity type supports all entity types: project, epic, story, task, worker, persona
- [ ] DynamoDB table schema includes a TTL attribute for optional event expiration
- [ ] Table name is configurable via `AUDIT_EVENTS_TABLE` environment variable
- [ ] No `any` types are used in the implementation

## Technical Notes

- AWS SDK v3 uses modular imports (`@aws-sdk/client-dynamodb` for low-level client, `@aws-sdk/lib-dynamodb` for the document client abstraction). The document client automatically handles marshalling JavaScript objects to DynamoDB's native format and back.
- The composite sort key (`timestamp#eventId`) ensures both chronological ordering and uniqueness. Using ISO 8601 timestamps in the sort key enables lexicographic sorting to match chronological ordering.
- The CrossProjectIndex GSI uses a fixed partition key ("ALL") to enable cross-project queries. This is a common DynamoDB pattern for "list all" queries. For very high event volumes, consider sharding the fixed key (e.g., "ALL#1", "ALL#2") with scatter-gather queries.
- Audit logging is best-effort: if the DynamoDB write fails, the error is logged but the API mutation still succeeds. The caller should use a fire-and-forget pattern (or `Promise.allSettled`).
- The TTL attribute enables automatic expiration of old events. DynamoDB's TTL feature deletes expired items in the background within ~48 hours of expiration.

## References

- **AWS SDK v3:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` — DynamoDB client and document client
- **DynamoDB:** Table design with composite keys, GSI, TTL
- **UUID:** `uuid` package for v4 UUID generation
- **Type Sharing:** `@laila/shared` package for cross-package type definitions

## Estimated Complexity

High — DynamoDB table design with composite keys and GSI, AWS SDK v3 integration, error handling for best-effort writes, cursor-based pagination, and shared type definitions.
