/**
 * @module dynamo/audit-reader
 *
 * Reads audit events from DynamoDB with cursor-based pagination.
 * Supports four access patterns:
 * 1. **By entity** (PK query): "All audit events for entity X"
 * 2. **By actor** (GSI query): "All actions performed by actor Y"
 * 3. **By project** (PK query): "All audit events for project Z" (convenience wrapper)
 * 4. **Cross-project** (CrossProjectIndex GSI): "All audit events across all projects"
 *
 * Cursor-based pagination works by base64url-encoding DynamoDB's
 * `LastEvaluatedKey` into an opaque cursor string. Clients pass the cursor
 * back on the next request; we decode it into `ExclusiveStartKey` to resume.
 * When no `LastEvaluatedKey` is returned, cursor is null (no more pages).
 */

import { QueryCommand } from '@aws-sdk/lib-dynamodb';

import { createDynamoClient } from './client';
import {
  AUDIT_TABLE_NAME,
  ACTOR_INDEX_NAME,
  CROSS_PROJECT_INDEX_NAME,
  PARTITION_KEY,
  GSI_PARTITION_KEY,
  CROSS_PROJECT_PK,
  CROSS_PROJECT_PK_VALUE,
  type AuditEventItem,
} from './schema';

/** Options accepted by both queryByEntity and queryByActor */
export interface AuditQueryOptions {
  /** Tenant ID for access control — only events belonging to this tenant are returned */
  tenantId: string;
  /** Page size (default 50, max 100) */
  limit?: number;
  /** Opaque pagination cursor from a prior response */
  cursor?: string;
  /** ISO timestamp — include events from this time onward */
  startTime?: string;
  /** ISO timestamp — include events up to (and including) this time */
  endTime?: string;
  /** Sort order: 'asc' (oldest first, default) or 'desc' (newest first) */
  order?: 'asc' | 'desc';
}

/** Paginated query result returned by all reader functions */
export interface AuditQueryResult {
  events: AuditEventItem[];
  /** Opaque cursor for the next page, or null when no more pages exist */
  cursor: string | null;
  count: number;
}

/** Application-level error wrapping DynamoDB failures with added context */
export class AuditReaderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AuditReaderError';
  }
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Validates that a tenant ID is provided for access control. */
const validateTenantId = (tenantId: string): void => {
  if (!tenantId) {
    throw new AuditReaderError('Tenant ID is required for audit event queries');
  }
};

const resolveLimit = (limit?: number): number =>
  Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

const decodeCursor = (cursor?: string): Record<string, unknown> | undefined => {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AuditReaderError('Invalid pagination cursor');
  }
};

const encodeCursor = (key?: Record<string, unknown>): string | null => {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64url');
};

/**
 * Query audit events for a specific entity using the table's primary key.
 *
 * The partition key stores a composite "entityType:entityId" value.
 * Time-range filtering leverages the sort key's ISO-timestamp prefix for
 * efficient range scans without a filter expression.
 *
 * The sort key `timestamp#eventId` contains `#`, so we use
 * ExpressionAttributeNames (`#sk`) to reference it safely.
 *
 * The tilde `~` appended after endTime ensures events at exactly endTime
 * are included, since the real sort key has a `#eventId` UUID suffix.
 */
export const queryByEntity = async (
  entityType: string,
  entityId: string,
  options: AuditQueryOptions,
): Promise<AuditQueryResult> => {
  validateTenantId(options.tenantId);

  const limit = resolveLimit(options.limit);
  const scanForward = (options.order ?? 'asc') === 'asc';

  let keyCondition = `${PARTITION_KEY} = :pk`;
  const exprValues: Record<string, unknown> = {
    ':pk': `${entityType}:${entityId}`,
    ':tid': options.tenantId,
  };

  if (options.startTime && options.endTime) {
    keyCondition += ' AND #sk BETWEEN :start AND :end';
    exprValues[':start'] = options.startTime;
    exprValues[':end'] = `${options.endTime}~`;
  } else if (options.startTime) {
    keyCondition += ' AND #sk >= :start';
    exprValues[':start'] = options.startTime;
  } else if (options.endTime) {
    keyCondition += ' AND #sk <= :end';
    exprValues[':end'] = `${options.endTime}~`;
  }

  const command = new QueryCommand({
    TableName: AUDIT_TABLE_NAME,
    KeyConditionExpression: keyCondition,
    FilterExpression: 'tenantId = :tid',
    ExpressionAttributeValues: exprValues,
    ExpressionAttributeNames: { '#sk': 'timestamp#eventId' },
    ScanIndexForward: scanForward,
    Limit: limit,
    ExclusiveStartKey: decodeCursor(options.cursor),
  });

  try {
    const client = createDynamoClient();
    const response = await client.send(command);
    return {
      events: (response.Items ?? []) as AuditEventItem[],
      cursor: encodeCursor(response.LastEvaluatedKey),
      count: response.Count ?? 0,
    };
  } catch (error) {
    if (error instanceof AuditReaderError) throw error;
    throw new AuditReaderError(
      `Failed to query audit events for entity ${entityType}:${entityId}`,
      error,
    );
  }
};

/**
 * Query audit events performed by a specific actor using the GSI.
 *
 * Uses the `actorId-timestamp-index` GSI where actorId is the partition key
 * and timestamp is the sort key. The GSI sort key is a plain ISO timestamp
 * (no `#eventId` suffix), so no tilde `~` is needed for endTime.
 */
export const queryByActor = async (
  actorId: string,
  options: AuditQueryOptions,
): Promise<AuditQueryResult> => {
  validateTenantId(options.tenantId);

  const limit = resolveLimit(options.limit);
  const scanForward = (options.order ?? 'asc') === 'asc';

  let keyCondition = `${GSI_PARTITION_KEY} = :pk`;
  const exprValues: Record<string, unknown> = {
    ':pk': actorId,
    ':tid': options.tenantId,
  };

  if (options.startTime && options.endTime) {
    keyCondition += ' AND #ts BETWEEN :start AND :end';
    exprValues[':start'] = options.startTime;
    exprValues[':end'] = options.endTime;
  } else if (options.startTime) {
    keyCondition += ' AND #ts >= :start';
    exprValues[':start'] = options.startTime;
  } else if (options.endTime) {
    keyCondition += ' AND #ts <= :end';
    exprValues[':end'] = options.endTime;
  }

  const command = new QueryCommand({
    TableName: AUDIT_TABLE_NAME,
    IndexName: ACTOR_INDEX_NAME,
    KeyConditionExpression: keyCondition,
    FilterExpression: 'tenantId = :tid',
    ExpressionAttributeValues: exprValues,
    ExpressionAttributeNames: { '#ts': 'timestamp' },
    ScanIndexForward: scanForward,
    Limit: limit,
    ExclusiveStartKey: decodeCursor(options.cursor),
  });

  try {
    const client = createDynamoClient();
    const response = await client.send(command);
    return {
      events: (response.Items ?? []) as AuditEventItem[],
      cursor: encodeCursor(response.LastEvaluatedKey),
      count: response.Count ?? 0,
    };
  } catch (error) {
    if (error instanceof AuditReaderError) throw error;
    throw new AuditReaderError(`Failed to query audit events for actor ${actorId}`, error);
  }
};

/**
 * Query ALL audit events belonging to a specific project.
 *
 * Returns events for every entity type within the project (project, epic,
 * story, task, etc.) by querying the CrossProjectIndex GSI with a
 * FilterExpression on `projectId`. This is broader than `queryByEntity`
 * which only returns events for a single entity.
 *
 * Returns events newest first by default (ScanIndexForward: false).
 *
 * @param projectId - The project UUID to query events for
 * @param options - Query options including tenantId, limit, cursor, time range
 * @returns Paginated list of audit events for the project
 */
export const queryByProject = async (
  projectId: string,
  options: AuditQueryOptions,
): Promise<AuditQueryResult> => {
  validateTenantId(options.tenantId);

  const limit = resolveLimit(options.limit);
  const scanForward = (options.order ?? 'desc') === 'asc';

  let keyCondition = `${CROSS_PROJECT_PK} = :pk`;
  const exprValues: Record<string, unknown> = {
    ':pk': CROSS_PROJECT_PK_VALUE,
    ':tid': options.tenantId,
    ':pid': projectId,
  };

  if (options.startTime && options.endTime) {
    keyCondition += ' AND #sk BETWEEN :start AND :end';
    exprValues[':start'] = options.startTime;
    exprValues[':end'] = `${options.endTime}~`;
  } else if (options.startTime) {
    keyCondition += ' AND #sk >= :start';
    exprValues[':start'] = options.startTime;
  } else if (options.endTime) {
    keyCondition += ' AND #sk <= :end';
    exprValues[':end'] = `${options.endTime}~`;
  }

  const command = new QueryCommand({
    TableName: AUDIT_TABLE_NAME,
    IndexName: CROSS_PROJECT_INDEX_NAME,
    KeyConditionExpression: keyCondition,
    FilterExpression: 'tenantId = :tid AND projectId = :pid',
    ExpressionAttributeValues: exprValues,
    ExpressionAttributeNames: { '#sk': 'timestamp#eventId' },
    ScanIndexForward: scanForward,
    Limit: limit,
    ExclusiveStartKey: decodeCursor(options.cursor),
  });

  try {
    const client = createDynamoClient();
    const response = await client.send(command);
    return {
      events: (response.Items ?? []) as AuditEventItem[],
      cursor: encodeCursor(response.LastEvaluatedKey),
      count: response.Count ?? 0,
    };
  } catch (error) {
    if (error instanceof AuditReaderError) throw error;
    throw new AuditReaderError(`Failed to query audit events for project ${projectId}`, error);
  }
};

/**
 * Query audit events across all projects using the CrossProjectIndex GSI.
 *
 * Uses the `CrossProjectIndex` GSI where `gsi1pk` is the fixed value "ALL"
 * and the sort key is `timestamp#eventId`. Returns events newest first by
 * default (ScanIndexForward: false).
 *
 * The sort key `timestamp#eventId` contains `#`, so we use
 * ExpressionAttributeNames (`#sk`) to reference it safely.
 *
 * The tilde `~` appended after endTime ensures events at exactly endTime
 * are included, since the real sort key has a `#eventId` UUID suffix.
 */
export const queryAll = async (options: AuditQueryOptions): Promise<AuditQueryResult> => {
  validateTenantId(options.tenantId);

  const limit = resolveLimit(options.limit);
  const scanForward = (options.order ?? 'desc') === 'asc';

  let keyCondition = `${CROSS_PROJECT_PK} = :pk`;
  const exprValues: Record<string, unknown> = {
    ':pk': CROSS_PROJECT_PK_VALUE,
    ':tid': options.tenantId,
  };

  if (options.startTime && options.endTime) {
    keyCondition += ' AND #sk BETWEEN :start AND :end';
    exprValues[':start'] = options.startTime;
    exprValues[':end'] = `${options.endTime}~`;
  } else if (options.startTime) {
    keyCondition += ' AND #sk >= :start';
    exprValues[':start'] = options.startTime;
  } else if (options.endTime) {
    keyCondition += ' AND #sk <= :end';
    exprValues[':end'] = `${options.endTime}~`;
  }

  const command = new QueryCommand({
    TableName: AUDIT_TABLE_NAME,
    IndexName: CROSS_PROJECT_INDEX_NAME,
    KeyConditionExpression: keyCondition,
    FilterExpression: 'tenantId = :tid',
    ExpressionAttributeValues: exprValues,
    ExpressionAttributeNames: { '#sk': 'timestamp#eventId' },
    ScanIndexForward: scanForward,
    Limit: limit,
    ExclusiveStartKey: decodeCursor(options.cursor),
  });

  try {
    const client = createDynamoClient();
    const response = await client.send(command);
    return {
      events: (response.Items ?? []) as AuditEventItem[],
      cursor: encodeCursor(response.LastEvaluatedKey),
      count: response.Count ?? 0,
    };
  } catch (error) {
    if (error instanceof AuditReaderError) throw error;
    throw new AuditReaderError('Failed to query audit events across all projects', error);
  }
};
