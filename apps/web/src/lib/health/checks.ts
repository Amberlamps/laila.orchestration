/**
 * @module health/checks
 *
 * Individual health check functions for each external dependency.
 *
 * Each check function returns `{ latency_ms: number }` on success or throws
 * on failure. All checks enforce a 5-second timeout via `Promise.race` to
 * prevent a single hanging dependency from blocking the readiness probe.
 *
 * Used by the `GET /api/v1/health/ready` endpoint to verify that all
 * external dependencies are reachable before accepting traffic.
 */

import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { AUDIT_TABLE_NAME, createDynamoBaseClient, getDb, projectsTable } from '@laila/database';
import { count } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time (ms) each individual check is allowed to run. */
const CHECK_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Successful check result returned by each check function. */
export interface CheckSuccess {
  latency_ms: number;
  note?: string;
}

/** Formatted result after processing a PromiseSettledResult. */
export type CheckResult =
  | { status: 'healthy'; latency_ms: number; note?: string }
  | { status: 'unhealthy'; error: string };

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

/**
 * Wraps a promise with a timeout. Rejects with a descriptive error if
 * the promise does not settle within the allowed duration.
 *
 * Clears the timer as soon as the original promise settles to avoid
 * dangling timers under repeated readiness probes.
 */
const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} health check timed out after ${String(CHECK_TIMEOUT_MS)}ms`));
    }, CHECK_TIMEOUT_MS);
  });

  const cleanup = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };

  return Promise.race([promise, timeoutPromise]).finally(cleanup);
};

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

/**
 * Check PostgreSQL (Neon) connectivity.
 *
 * Executes a lightweight `SELECT count(*) FROM projects` query to verify
 * the connection pool, database, and schema are functional by touching
 * a real application table.
 */
export const checkPostgresql = (): Promise<CheckSuccess> => {
  const run = async (): Promise<CheckSuccess> => {
    const start = performance.now();
    const db = getDb();
    await db.select({ value: count() }).from(projectsTable);
    return { latency_ms: Math.round(performance.now() - start) };
  };

  return withTimeout(run(), 'PostgreSQL');
};

/**
 * Check DynamoDB connectivity.
 *
 * Calls DescribeTable on the audit log table to verify IAM credentials,
 * endpoint reachability, and table existence without reading any data.
 */
export const checkDynamoDB = (): Promise<CheckSuccess> => {
  const run = async (): Promise<CheckSuccess> => {
    const start = performance.now();
    const client = createDynamoBaseClient();
    await client.send(new DescribeTableCommand({ TableName: AUDIT_TABLE_NAME }));
    return { latency_ms: Math.round(performance.now() - start) };
  };

  return withTimeout(run(), 'DynamoDB');
};

/**
 * Check SQS connectivity (if configured).
 *
 * Calls GetQueueAttributes to verify queue availability. Returns healthy
 * with a skip note when `SQS_QUEUE_URL` is not set (local development).
 */
export const checkSQS = (): Promise<CheckSuccess> => {
  const queueUrl = process.env['SQS_QUEUE_URL'];

  if (!queueUrl) {
    return Promise.resolve({ latency_ms: 0, note: 'SQS not configured — check skipped' });
  }

  const run = async (): Promise<CheckSuccess> => {
    const start = performance.now();
    const region = process.env['AWS_REGION'] ?? 'us-east-1';
    const client = new SQSClient({ region });
    await client.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      }),
    );
    return { latency_ms: Math.round(performance.now() - start) };
  };

  return withTimeout(run(), 'SQS');
};

// ---------------------------------------------------------------------------
// Result formatter
// ---------------------------------------------------------------------------

/**
 * Converts a `PromiseSettledResult` into a uniform check result object.
 *
 * - Fulfilled promises produce `{ status: "healthy", latency_ms }`.
 * - Rejected promises produce `{ status: "unhealthy", error }` with the
 *   error message (never a stack trace).
 */
export const formatCheckResult = (result: PromiseSettledResult<CheckSuccess>): CheckResult => {
  if (result.status === 'fulfilled') {
    const formatted: CheckResult = { status: 'healthy', latency_ms: result.value.latency_ms };
    if (result.value.note) {
      formatted.note = result.value.note;
    }
    return formatted;
  }

  const reason: unknown = result.reason;
  const message = reason instanceof Error ? reason.message : 'Unknown error';

  return { status: 'unhealthy', error: message };
};
