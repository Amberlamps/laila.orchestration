/**
 * Idempotency tracking for SQS message processing.
 *
 * Two-phase approach:
 * 1. Before processing: check if already processed (GetItem) — skip if yes
 * 2. After successful processing: record as processed (conditional PutItem)
 *
 * The record step uses `attribute_not_exists(eventId)` so that concurrent
 * invocations that both pass the check phase will both process the event,
 * but only one records it. This is safe because the underlying DB operations
 * are idempotent (blocked→pending is a no-op if already pending).
 *
 * Critically, the idempotency record is written ONLY after successful
 * processing. If processing fails, no record is written, so SQS retry
 * will re-deliver the message and it will be processed again.
 *
 * Uses the DynamoDB Document Client from @aws-sdk/lib-dynamodb for
 * automatic marshalling/unmarshalling of native JavaScript types.
 * All DynamoDB attributes use camelCase per project convention.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Client (singleton -- reused across Lambda invocations)
// ---------------------------------------------------------------------------

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TTL duration: 24 hours in seconds. */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether an event has already been successfully processed.
 *
 * Performs a GetItem on the idempotency table. Returns true if the
 * record exists, meaning a previous invocation processed and recorded it.
 *
 * This is an efficiency optimization — it prevents re-processing on
 * normal SQS re-deliveries. The true correctness guarantee comes from
 * the conditional Put in `recordProcessed`.
 *
 * @param eventId - The unique event identifier to check
 * @param tableName - The DynamoDB table name for idempotency records
 * @returns true if the eventId has already been successfully processed
 */
export const isAlreadyProcessed = async (eventId: string, tableName: string): Promise<boolean> => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { eventId },
      ProjectionExpression: 'eventId',
    }),
  );

  return result.Item !== undefined;
};

/**
 * Record an event as successfully processed using a conditional PutItem.
 *
 * Uses `attribute_not_exists(eventId)` so only the first writer succeeds.
 * If another invocation already recorded the same eventId, this is fine —
 * ConditionalCheckFailedException is caught and treated as success since
 * it means the event was already recorded by another processor.
 *
 * If the Put fails for any OTHER reason (throttling, network error), the
 * error is re-thrown. The caller must treat this as a message failure so
 * SQS retries the message. This ensures the idempotency record is
 * eventually written.
 *
 * @param eventId - The unique event identifier to record
 * @param tableName - The DynamoDB table name for idempotency records
 */
export const recordProcessed = async (eventId: string, tableName: string): Promise<void> => {
  const expiresAt = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          eventId,
          processedAt: new Date().toISOString(),
          expiresAt,
        },
        ConditionExpression: 'attribute_not_exists(eventId)',
      }),
    );
  } catch (error: unknown) {
    // ConditionalCheckFailedException means another invocation already
    // recorded this event — that's fine, both processors succeeded
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return;
    }

    // Any other error (throttling, network, etc.) must propagate so the
    // SQS message is retried and the record is eventually written
    throw error;
  }
};
