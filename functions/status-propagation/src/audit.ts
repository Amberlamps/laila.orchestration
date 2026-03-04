/**
 * Audit event writing for the status-propagation Lambda function.
 *
 * Writes audit events to DynamoDB for each status transition caused
 * by the propagation logic. This includes:
 * - Task unblocking (blocked -> not_started)
 * - Story status changes (derived from child task statuses)
 * - Epic status changes (derived from child story statuses)
 *
 * Audit events are written AFTER the database transaction commits so
 * the audit trail is consistent with the committed state.
 */

import { writeAuditEvent } from '@laila/database';

import type { StatusPropagationLogger } from './logger';
import type { DependentEvaluation, PropagationResult } from './types';

// ---------------------------------------------------------------------------
// Entity type mapping
// ---------------------------------------------------------------------------

/**
 * Maps internal entity type strings to the audit event entity type
 * strings used by the audit writer.
 */
const ENTITY_TYPE_MAP: Record<string, string> = {
  task: 'task',
  story: 'user_story',
  epic: 'epic',
};

// ---------------------------------------------------------------------------
// Task unblock audit events
// ---------------------------------------------------------------------------

/**
 * Write an audit event for a task that was unblocked by dependency
 * completion.
 *
 * Called AFTER the database transaction commits.
 */
export const writeTaskUnblockAuditEvent = async (
  evaluation: DependentEvaluation,
  tenantId: string,
  projectId: string,
  completedTaskId: string,
): Promise<void> => {
  await writeAuditEvent({
    entityType: 'task',
    entityId: evaluation.taskId,
    action: 'status_propagated',
    actorType: 'system',
    actorId: 'status-propagation',
    tenantId,
    projectId,
    changes: {
      before: { workStatus: evaluation.previousStatus },
      after: { workStatus: evaluation.newStatus },
    },
    metadata: {
      reason: evaluation.reason,
      taskName: evaluation.taskName,
      triggeredBy: completedTaskId,
    },
  });
};

// ---------------------------------------------------------------------------
// Propagation audit events
// ---------------------------------------------------------------------------

/**
 * Write an audit event for a story or epic status change caused by
 * upward propagation.
 *
 * Called AFTER the database transaction commits.
 */
export const writePropagationAuditEvent = async (result: PropagationResult): Promise<void> => {
  const entityType = ENTITY_TYPE_MAP[result.entityType] ?? result.entityType;

  await writeAuditEvent({
    entityType,
    entityId: result.entityId,
    action: 'status_propagated',
    actorType: 'system',
    actorId: 'status-propagation',
    tenantId: result.tenantId,
    projectId: result.projectId,
    changes: {
      before: { workStatus: result.previousStatus },
      after: { workStatus: result.newStatus },
    },
    metadata: {
      entityName: result.entityName,
    },
  });
};

// ---------------------------------------------------------------------------
// Batch audit event writing
// ---------------------------------------------------------------------------

/**
 * Write all audit events for a batch of task evaluations and propagation
 * results. Errors during individual audit writes are caught and logged
 * but do not propagate -- the transitions have already been committed
 * to the database and must not be rolled back because of an audit
 * write failure.
 */
export const writeAllAuditEvents = async (
  evaluations: DependentEvaluation[],
  propagations: PropagationResult[],
  tenantId: string,
  projectId: string,
  completedTaskId: string,
  log: StatusPropagationLogger,
): Promise<number> => {
  let written = 0;

  for (const evaluation of evaluations) {
    try {
      await writeTaskUnblockAuditEvent(evaluation, tenantId, projectId, completedTaskId);
      written += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn(
        {
          taskId: evaluation.taskId,
          error: message,
        },
        'Failed to write audit event for task unblock',
      );
    }
  }

  for (const propagation of propagations) {
    try {
      await writePropagationAuditEvent(propagation);
      written += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.warn(
        {
          entityId: propagation.entityId,
          entityType: propagation.entityType,
          error: message,
        },
        'Failed to write audit event for status propagation',
      );
    }
  }

  return written;
};
