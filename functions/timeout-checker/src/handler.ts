// Lambda handler for the timeout-checker function.
// Triggered by EventBridge on a schedule to detect stale work assignments
// that have exceeded their timeout threshold and transition them back to
// an assignable state.

import type { ScheduledEvent, Context } from 'aws-lambda';

export const handler = (
  event: ScheduledEvent,
  context: Context,
): Promise<{ statusCode: number; body: string }> => {
  console.log('timeout-checker invoked', {
    requestId: context.awsRequestId,
    time: event.time,
    resources: event.resources,
  });

  // TODO: Query for work assignments exceeding timeout thresholds
  // TODO: Transition stale assignments back to assignable state

  return Promise.resolve({ statusCode: 200, body: JSON.stringify({ ok: true }) });
};
