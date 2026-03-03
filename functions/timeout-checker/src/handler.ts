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

import { createDrizzleClient } from '@laila/database';

import { checkAndReclaimTimedOutStories } from '../../../apps/web/src/lib/orchestration/timeout-checker';

import type { ScheduledEvent, Context } from 'aws-lambda';

export const handler = async (
  event: ScheduledEvent,
  context: Context,
): Promise<{ statusCode: number; body: string }> => {
  console.log('[timeout-checker] invoked', {
    requestId: context.awsRequestId,
    time: event.time,
    resources: event.resources,
  });

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('[timeout-checker] DATABASE_URL is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'DATABASE_URL is not set' }) };
  }

  // Pool mode is required for transaction support during reclamation
  const db = createDrizzleClient({ mode: 'pool', url: databaseUrl });

  const result = await checkAndReclaimTimedOutStories(db);

  console.log('[timeout-checker] completed', {
    checked: result.checked,
    reclaimed: result.reclaimed.length,
    errors: result.errors,
  });

  if (result.reclaimed.length > 0) {
    console.log('[timeout-checker] reclaimed stories:', JSON.stringify(result.reclaimed));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      checked: result.checked,
      reclaimed: result.reclaimed.length,
      errors: result.errors,
      details: result.reclaimed,
    }),
  };
};
