/**
 * @module dynamo
 *
 * DynamoDB access layer for audit logs and event storage.
 *
 * Uses AWS SDK v3 Document Client for automatic marshalling/unmarshalling.
 * All attribute names follow camelCase convention (DynamoDB standard).
 *
 * This module provides:
 * - DynamoDB Document Client factory
 * - Audit log write operations
 * - Query operations designed around access patterns
 */

export {
  AUDIT_TABLE_NAME,
  ACTOR_INDEX_NAME,
  PARTITION_KEY,
  SORT_KEY,
  GSI_PARTITION_KEY,
  GSI_SORT_KEY,
  TTL_ATTRIBUTE,
  AUDIT_TABLE_KEY_SCHEMA,
  type AuditEventItem,
} from './schema';

export { createDynamoBaseClient, createDynamoClient, type DynamoClientOptions } from './client';

export {
  writeAuditEvent,
  writeAuditEventBatch,
  AuditWriteError,
  type AuditEventInput,
} from './audit-writer';

export {
  queryByEntity,
  queryByActor,
  AuditReaderError,
  type AuditQueryOptions,
  type AuditQueryResult,
} from './audit-reader';
