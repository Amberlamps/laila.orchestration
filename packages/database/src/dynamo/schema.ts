/**
 * @module dynamo/schema
 *
 * DynamoDB audit log table schema definition.
 *
 * Defines the table structure, key schema, GSI configuration, and TypeScript
 * types for audit event items stored in DynamoDB. All attribute names follow
 * camelCase convention per DynamoDB best practices.
 *
 * Access patterns supported:
 * 1. **By entity** (partition key query): "All audit events for entity X"
 *    - PK = entityId, SK begins_with timestamp prefix for time filtering
 * 2. **By actor** (GSI query): "All actions performed by actor Y"
 *    - GSI PK = actorId, GSI SK = timestamp for actor timeline
 *
 * @example
 * ```typescript
 * import { AUDIT_TABLE_NAME, PARTITION_KEY, SORT_KEY } from './schema';
 *
 * const params = {
 *   TableName: AUDIT_TABLE_NAME,
 *   Key: {
 *     [PARTITION_KEY]: 'project:550e8400-e29b-41d4-a716-446655440001',
 *     [SORT_KEY]: '2026-03-02T12:00:00.000Z#550e8400-e29b-41d4-a716-446655440000',
 *   },
 * };
 * ```
 *
 * ---
 *
 * Terraform-compatible table creation parameters:
 *
 * ```hcl
 * resource "aws_dynamodb_table" "audit_events" {
 *   name         = var.audit_table_name  # default: "audit-events"
 *   billing_mode = "PAY_PER_REQUEST"     # on-demand capacity for variable workloads
 *   hash_key     = "entityId"            # partition key (String)
 *   range_key    = "timestamp#eventId"   # sort key (String)
 *
 *   attribute {
 *     name = "entityId"
 *     type = "S"
 *   }
 *
 *   attribute {
 *     name = "timestamp#eventId"
 *     type = "S"
 *   }
 *
 *   attribute {
 *     name = "actorId"
 *     type = "S"
 *   }
 *
 *   attribute {
 *     name = "timestamp"
 *     type = "S"
 *   }
 *
 *   global_secondary_index {
 *     name            = "actorId-timestamp-index"
 *     hash_key        = "actorId"
 *     range_key       = "timestamp"
 *     projection_type = "ALL"            # actor queries need full item attributes
 *   }
 *
 *   ttl {
 *     attribute_name = "expiresAt"
 *     enabled        = true
 *   }
 *
 *   point_in_time_recovery {
 *     enabled = true
 *   }
 *
 *   tags = {
 *     Service = "audit-log"
 *   }
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Table and index names
// ---------------------------------------------------------------------------

/** DynamoDB table name for audit events, configurable via environment variable */
export const AUDIT_TABLE_NAME = process.env['DYNAMODB_AUDIT_TABLE_NAME'] ?? 'audit-events';

/** GSI for querying audit events by actor (who performed the action) */
export const ACTOR_INDEX_NAME = 'actorId-timestamp-index';

// ---------------------------------------------------------------------------
// Key attribute name constants
// ---------------------------------------------------------------------------

/** Partition key attribute: composite "entityType:entityId" format */
export const PARTITION_KEY = 'entityId' as const;

/** Sort key attribute: "ISO-timestamp#event-uuid" for ordering and uniqueness */
export const SORT_KEY = 'timestamp#eventId' as const;

/** GSI partition key: the actor who performed the action */
export const GSI_PARTITION_KEY = 'actorId' as const;

/** GSI sort key: ISO timestamp for actor timeline ordering */
export const GSI_SORT_KEY = 'timestamp' as const;

/** TTL attribute: Unix epoch seconds for automatic item expiration */
export const TTL_ATTRIBUTE = 'expiresAt' as const;

// ---------------------------------------------------------------------------
// Key schema definition (for programmatic table creation / validation)
// ---------------------------------------------------------------------------

/**
 * Complete key schema definition for the audit events table.
 * Useful for programmatic table creation, validation, or documentation.
 */
export const AUDIT_TABLE_KEY_SCHEMA = {
  partitionKey: { name: PARTITION_KEY, type: 'S' },
  sortKey: { name: SORT_KEY, type: 'S' },
  gsi: {
    [ACTOR_INDEX_NAME]: {
      partitionKey: { name: GSI_PARTITION_KEY, type: 'S' },
      sortKey: { name: GSI_SORT_KEY, type: 'S' },
      projectionType: 'ALL',
    },
  },
  ttl: { attributeName: TTL_ATTRIBUTE },
} as const;

// ---------------------------------------------------------------------------
// Audit event item type
// ---------------------------------------------------------------------------

/**
 * TypeScript type for audit event items stored in DynamoDB.
 *
 * Maps directly to the DynamoDB item shape. The Document Client handles
 * automatic marshalling/unmarshalling between JavaScript types and DynamoDB
 * attribute values.
 *
 * Key design decisions:
 * - `entityId` uses "entityType:uuid" composite format for partition key
 *   distribution and entity-scoped queries
 * - `timestamp#eventId` composite sort key ensures chronological ordering
 *   with uniqueness guarantee for same-millisecond events
 * - `changes` uses a nested object with `before`/`after` fields that map
 *   directly to DynamoDB Map attributes
 */
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
