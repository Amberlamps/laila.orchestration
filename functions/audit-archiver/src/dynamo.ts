/**
 * DynamoDB query functions for scanning expired audit events.
 * Handles pagination for large result sets using LastEvaluatedKey.
 *
 * Uses the DynamoDB Document Client from @aws-sdk/lib-dynamodb for
 * automatic marshalling/unmarshalling of native JavaScript types.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, type ScanCommandInput } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Represents an audit event stored in DynamoDB.
 *
 * The `pk` and `sk` fields form the composite primary key.
 * The `ttl` field is used by DynamoDB's TTL feature for automatic deletion.
 * The `timestamp` field is used for filtering expired events.
 */
export interface AuditEvent {
  pk: string;
  sk: string;
  eventType: string;
  projectId: string;
  entityId: string;
  entityType: string;
  userId: string | null;
  agentId: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
  ttl: number;
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
 *
 * @param cutoffTimestamp - ISO 8601 timestamp; events older than this are returned
 * @param tableName - DynamoDB table name from environment variable
 * @yields Batches of AuditEvent arrays (up to 1000 per batch)
 */
export async function* scanExpiredEvents(
  cutoffTimestamp: string,
  tableName: string,
): AsyncGenerator<AuditEvent[], void, unknown> {
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const params: ScanCommandInput = {
      TableName: tableName,
      FilterExpression: '#ts < :cutoff',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':cutoff': cutoffTimestamp },
      ExclusiveStartKey: lastEvaluatedKey,
      Limit: 1000,
    };

    const result = await docClient.send(new ScanCommand(params));
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

    if (result.Items && result.Items.length > 0) {
      yield result.Items as AuditEvent[];
    }
  } while (lastEvaluatedKey);
}
