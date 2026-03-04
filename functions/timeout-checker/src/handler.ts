/**
 * Lambda handler for the timeout-checker function.
 *
 * Triggered by EventBridge on a schedule to detect stale work assignments
 * that have exceeded their timeout threshold and transition them back to
 * an assignable state.
 *
 * Creates a pool-mode database client (required for transactions) and
 * delegates to the `checkAndReclaimTimedOutStories` orchestration function.
 */

import { recordCount, flushMetrics } from '@laila/metrics';

import { createPoolClient } from './db';
import { createInvocationLogger } from './logger';
import { checkAndReclaimTimedOutStories, type TimeoutCheckResult } from './orchestration';

import type { ScheduledEvent, Context } from 'aws-lambda';

/** Summary returned by the handler. */
export interface TimeoutCheckerResult {
  checked: number;
  reclaimed: number;
  errors: number;
}

export const handler = async (
  event: ScheduledEvent,
  context: Context,
): Promise<TimeoutCheckerResult> => {
  const log = createInvocationLogger(context.awsRequestId);

  log.info(
    {
      time: event.time,
      resources: event.resources,
    },
    'Timeout checker invoked',
  );

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    throw new Error('DATABASE_URL is not set');
  }

  // Pool mode is required for transaction support during reclamation
  const db = createPoolClient(databaseUrl);

  const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(db, log);

  log.info(
    {
      checked: result.checked,
      reclaimed: result.reclaimed.length,
      errors: result.errors,
    },
    'Timeout checker completed',
  );

  if (result.reclaimed.length > 0) {
    log.info({ stories: result.reclaimed }, 'Reclaimed timed-out stories');
  }

  // Publish custom CloudWatch metrics
  recordCount('StoriesChecked', result.checked);
  recordCount('TimeoutReclamations', result.reclaimed.length);
  await flushMetrics();

  return {
    checked: result.checked,
    reclaimed: result.reclaimed.length,
    errors: result.errors,
  };
};
