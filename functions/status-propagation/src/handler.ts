/**
 * Lambda handler for the SQS status propagation consumer.
 *
 * Triggered by SQS queue events containing task/story completion messages.
 * Evaluates dependent tasks and propagates status changes through the DAG.
 *
 * Uses partial batch response (SQSBatchResponse) so that only failed
 * messages are retried, not the entire batch. This prevents successful
 * messages from being re-processed when one message in the batch fails.
 *
 * Flow for each message:
 * 1. Parse the StatusChangeEvent from the SQS message body
 * 2. Check idempotency: has this eventId been processed before?
 * 3. If task.completed:
 *    a. Find all tasks that depend on the completed task
 *    b. For each dependent: check if ALL its dependencies are now "done"
 *    c. If all deps done: transition dependent from "blocked" -> "not_started"
 *    d. Write audit event for each transition
 * 4. Propagate upward:
 *    a. Re-evaluate the parent story's status based on child task statuses
 *    b. Re-evaluate the parent epic's status based on child story statuses
 * 5. Record the eventId as processed (for idempotency)
 */

import { writeAllAuditEvents } from './audit';
import { createPoolClient } from './db';
import { evaluateDependents } from './evaluator';
import { isAlreadyProcessed, recordProcessed } from './idempotency';
import { createInvocationLogger } from './logger';
import { propagateToStory, propagateToEpic } from './propagator';

import type { StatusChangeEvent, PropagationResult } from './types';
import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure, Context } from 'aws-lambda';

/**
 * Main handler for the SQS status propagation consumer.
 *
 * Processes each SQS record independently and reports failures individually
 * via batchItemFailures, enabling partial batch retry. After 3 failed attempts,
 * SQS moves the message to the Dead Letter Queue.
 */
export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  const log = createInvocationLogger(context.awsRequestId);
  const batchItemFailures: SQSBatchItemFailure[] = [];

  log.info({ recordCount: event.Records.length }, 'Status propagation consumer invoked');

  // ---------------------------------------------------------------------------
  // Validate required environment variables
  // ---------------------------------------------------------------------------

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    log.error({ msg: 'DATABASE_URL is not set' });
    throw new Error('DATABASE_URL is not set');
  }

  const idempotencyTableName = process.env['IDEMPOTENCY_TABLE_NAME'];
  if (!idempotencyTableName) {
    log.error({ msg: 'IDEMPOTENCY_TABLE_NAME is not set' });
    throw new Error('IDEMPOTENCY_TABLE_NAME is not set');
  }

  // Pool mode is required for transaction support during status transitions
  const db = createPoolClient(databaseUrl);

  // ---------------------------------------------------------------------------
  // Process each SQS record independently
  // ---------------------------------------------------------------------------

  for (const record of event.Records) {
    try {
      const statusChange: StatusChangeEvent = JSON.parse(record.body) as StatusChangeEvent;

      log.info(
        {
          eventId: statusChange.eventId,
          eventType: statusChange.eventType,
          entityId: statusChange.entityId,
          entityType: statusChange.entityType,
          projectId: statusChange.projectId,
          newStatus: statusChange.newStatus,
          previousStatus: statusChange.previousStatus,
        },
        'Processing status change event',
      );

      // Phase 1: Check if this event was already successfully processed.
      // This is an efficiency optimization — prevents redundant re-processing.
      const alreadyProcessed = await isAlreadyProcessed(statusChange.eventId, idempotencyTableName);

      if (alreadyProcessed) {
        log.info({ eventId: statusChange.eventId }, 'Event already processed -- skipping');
        continue;
      }

      // Phase 2: Process the status change based on event type.
      // If this fails, no idempotency record is written, so SQS retry
      // will re-deliver the message for reprocessing.
      await processStatusChange(db, statusChange, log);

      // Phase 3: Record as successfully processed (conditional Put).
      // Written AFTER success so failed processing can be retried.
      // If this write fails (non-conditional error), the message is
      // reported as failed so SQS retries and the record is eventually written.
      await recordProcessed(statusChange.eventId, idempotencyTableName);

      log.info({ eventId: statusChange.eventId }, 'Status change event processed successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        { messageId: record.messageId, error: message },
        'Failed to process status change event',
      );

      // Report this message as failed for individual retry
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  log.info(
    {
      totalRecords: event.Records.length,
      failures: batchItemFailures.length,
    },
    'Status propagation batch processing complete',
  );

  return { batchItemFailures };
};

// ---------------------------------------------------------------------------
// Internal processing
// ---------------------------------------------------------------------------

/**
 * Process a single status change event by evaluating dependencies
 * and propagating status changes upward through the hierarchy.
 *
 * The flow depends on the event type:
 *
 * - task.completed: Evaluate dependent tasks for unblocking, then
 *   propagate upward to story and epic.
 *
 * - task.failed: Propagate upward to story and epic (no unblocking).
 *
 * - story.completed: Propagate upward to the parent epic.
 */
const processStatusChange = async (
  db: Parameters<typeof evaluateDependents>[0],
  statusChange: StatusChangeEvent,
  log: ReturnType<typeof createInvocationLogger>,
): Promise<void> => {
  const propagations: PropagationResult[] = [];

  if (statusChange.eventType === 'task.completed') {
    // Step 1: Evaluate dependent tasks for unblocking
    const evaluations = await evaluateDependents(
      db,
      statusChange.entityId,
      statusChange.projectId,
      statusChange.tenantId,
      log,
    );

    // Step 2: Propagate to parent story
    const storyResult = await propagateToStory(
      db,
      statusChange.entityId,
      statusChange.projectId,
      statusChange.tenantId,
      log,
    );

    if (storyResult) {
      propagations.push(storyResult);

      // Step 3: Propagate to parent epic (using the story that changed)
      const epicResult = await propagateToEpic(
        db,
        storyResult.entityId,
        statusChange.projectId,
        statusChange.tenantId,
        log,
      );

      if (epicResult) {
        propagations.push(epicResult);
      }
    }

    // Step 4: Write audit events AFTER all transitions
    if (evaluations.length > 0 || propagations.length > 0) {
      const auditCount = await writeAllAuditEvents(
        evaluations,
        propagations,
        statusChange.tenantId,
        statusChange.projectId,
        statusChange.entityId,
        log,
      );

      log.info(
        {
          tasksUnblocked: evaluations.length,
          propagations: propagations.length,
          auditEventsWritten: auditCount,
        },
        'Status change processing complete with transitions',
      );
    }
  } else if (statusChange.eventType === 'task.failed') {
    // Propagate failure upward to story and epic
    const storyResult = await propagateToStory(
      db,
      statusChange.entityId,
      statusChange.projectId,
      statusChange.tenantId,
      log,
    );

    if (storyResult) {
      propagations.push(storyResult);

      const epicResult = await propagateToEpic(
        db,
        storyResult.entityId,
        statusChange.projectId,
        statusChange.tenantId,
        log,
      );

      if (epicResult) {
        propagations.push(epicResult);
      }
    }

    // Write audit events for propagations
    if (propagations.length > 0) {
      const auditCount = await writeAllAuditEvents(
        [],
        propagations,
        statusChange.tenantId,
        statusChange.projectId,
        statusChange.entityId,
        log,
      );

      log.info(
        {
          propagations: propagations.length,
          auditEventsWritten: auditCount,
        },
        'Task failure propagation complete',
      );
    }
  } else {
    // statusChange.eventType === 'story.completed'
    // Propagate to parent epic
    const epicResult = await propagateToEpic(
      db,
      statusChange.entityId,
      statusChange.projectId,
      statusChange.tenantId,
      log,
    );

    if (epicResult) {
      propagations.push(epicResult);

      const auditCount = await writeAllAuditEvents(
        [],
        propagations,
        statusChange.tenantId,
        statusChange.projectId,
        statusChange.entityId,
        log,
      );

      log.info(
        {
          propagations: propagations.length,
          auditEventsWritten: auditCount,
        },
        'Story completion propagation complete',
      );
    }
  }
};
