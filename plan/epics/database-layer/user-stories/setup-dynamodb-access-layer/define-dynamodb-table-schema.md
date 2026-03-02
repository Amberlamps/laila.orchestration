# Define DynamoDB Table Schema

## Task Details

- **Title:** Define DynamoDB Table Schema
- **Status:** Complete
- **Assigned Agent:** database-administrator
- **Parent User Story:** [Set Up DynamoDB Access Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** None

## Description

Define the DynamoDB table schema for the audit log system. DynamoDB is used instead of PostgreSQL for audit logs because it provides:

- Cost-effective storage for high-volume append-only data
- Automatic TTL-based expiration for log retention policies
- Seamless scalability without connection management overhead
- Natural fit for time-series event data with partition key access patterns

The schema design must support two primary access patterns:

1. **By entity:** "Show me all audit events for project X" (partition key query)
2. **By actor:** "Show me all actions performed by user Y" (GSI query)

## Acceptance Criteria

- [ ] `packages/database/src/dynamo/schema.ts` exports the DynamoDB table schema definition as TypeScript constants/types
- [ ] Table definition includes:
  - Table name: configurable via environment variable (`DYNAMODB_AUDIT_TABLE_NAME`)
  - Partition key: `entityId` (String) — the ID of the entity being audited
  - Sort key: `timestamp#eventId` (String) — composite of ISO timestamp and event UUID for ordering and uniqueness
  - GSI: `actorId-timestamp-index` with partition key `actorId` (String) and sort key `timestamp` (String)
  - TTL attribute: `expiresAt` (Number) — Unix epoch seconds for automatic item expiration
- [ ] TypeScript type for audit event items is defined matching the DynamoDB item shape
- [ ] The schema definition includes a Terraform-compatible comment or separate document describing the table creation parameters (read/write capacity mode, GSI projections)
- [ ] A `packages/database/src/dynamo/client.ts` exports a configured DynamoDB Document Client
- [ ] The Document Client uses AWS SDK v3 modular imports (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- [ ] The client handles both local development (optional LocalStack/DynamoDB Local endpoint) and production AWS connections
- [ ] Schema constants are exported for use by reader and writer modules

## Technical Notes

- DynamoDB schema definition:

  ```typescript
  // packages/database/src/dynamo/schema.ts
  // DynamoDB audit log table schema definition
  // Supports two access patterns: by entity (PK) and by actor (GSI)

  // Table and index names — configurable for environment isolation
  export const AUDIT_TABLE_NAME = process.env.DYNAMODB_AUDIT_TABLE_NAME ?? 'audit-events';
  export const ACTOR_INDEX_NAME = 'actorId-timestamp-index';

  // Key attribute names
  export const PARTITION_KEY = 'entityId'; // e.g., "project:uuid" or "task:uuid"
  export const SORT_KEY = 'timestamp#eventId'; // e.g., "2026-03-01T12:00:00Z#uuid"

  // Audit event item type
  export interface AuditEventItem {
    /** Partition key: "entityType:entityId" format for efficient entity-scoped queries */
    entityId: string;
    /** Sort key: "ISO-timestamp#event-uuid" for ordering and uniqueness */
    'timestamp#eventId': string;
    /** GSI partition key: actor who performed the action */
    actorId: string;
    /** GSI sort key: ISO timestamp for actor timeline ordering */
    timestamp: string;
    /** UUID for the event (also embedded in sort key) */
    eventId: string;
    /** Type of entity: project, epic, user_story, task, worker, persona */
    entityType: string;
    /** Action performed: created, updated, deleted, status_changed, assigned, completed */
    action: string;
    /** Type of actor: user, worker, system */
    actorType: string;
    /** Tenant ID for access control validation */
    tenantId: string;
    /** Before/after state for change tracking */
    changes?: {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    };
    /** Additional context metadata */
    metadata?: Record<string, unknown>;
    /** TTL: Unix epoch seconds when this item should be automatically deleted */
    expiresAt?: number;
  }
  ```

- The composite sort key `timestamp#eventId` ensures:
  1. Events are ordered chronologically (timestamp prefix)
  2. Events at the same millisecond are uniquely identified (event UUID suffix)
  3. Range queries can use `begins_with(timestamp#eventId, '2026-03')` for time-based filtering
- The `entityId` partition key uses a composite format `"entityType:uuid"` to keep all events for an entity together while allowing type filtering
- GSI projection: consider `ALL` projection for the actor index if actor queries need all attributes, or `KEYS_ONLY` + specific attribute projections to reduce GSI storage costs
- TTL is set in Unix epoch seconds — the `expiresAt` attribute can be set to `now + retention_days * 86400`
- For local development, consider using DynamoDB Local via Docker or simply mocking the DynamoDB client in tests

## References

- **Functional Requirements:** Audit logging, event history, retention policies
- **Design Specification:** DynamoDB single-table design, GSI for actor queries
- **Project Setup:** packages/database DynamoDB module

## Estimated Complexity

Medium — Requires understanding DynamoDB's key design principles (partition key distribution, sort key ordering, GSI design). The schema is straightforward but the access pattern design decisions have significant performance implications.
