/**
 * Audit event writing for the dag-reconciler Lambda function.
 *
 * Writes audit events to DynamoDB for each correction made by the
 * reconciler. Each correction generates a separate audit event with
 * before/after status changes for traceability.
 *
 * Audit events are written AFTER the database transaction commits so
 * the audit trail is consistent with the committed state.
 */

import { writeAuditEvent } from '@laila/database';

import type { CorrectionDetail } from './types';

/**
 * Entity type mapping from our internal types to the audit event entity
 * type strings used by the audit writer.
 */
const ENTITY_TYPE_MAP: Record<CorrectionDetail['entityType'], string> = {
  task: 'task',
  story: 'user_story',
  epic: 'epic',
};

/**
 * Write an audit event for a single reconciliation correction.
 *
 * Called AFTER the database transaction commits so that the audit trail
 * is consistent with the committed state.
 */
export const writeReconciliationAuditEvent = async (
  correction: CorrectionDetail,
  tenantId: string,
): Promise<void> => {
  await writeAuditEvent({
    entityType: ENTITY_TYPE_MAP[correction.entityType],
    entityId: correction.entityId,
    action: 'status_reconciled',
    actorType: 'system',
    actorId: 'dag-reconciler',
    tenantId,
    projectId: correction.projectId,
    changes: {
      before: { workStatus: correction.previousStatus },
      after: { workStatus: correction.correctedStatus },
    },
    metadata: {
      rule: correction.rule,
      reason: correction.reason,
      entityName: correction.entityName,
    },
  });
};

/**
 * Write audit events for all corrections made during reconciliation.
 *
 * Errors during individual audit writes are caught and logged but do
 * not propagate -- the corrections have already been committed to the
 * database and must not be rolled back because of an audit write failure.
 */
export const writeAllAuditEvents = async (
  corrections: CorrectionDetail[],
  tenantId: string,
  logger: { warn: (obj: Record<string, unknown>, msg?: string) => void },
): Promise<number> => {
  let written = 0;

  for (const correction of corrections) {
    try {
      await writeReconciliationAuditEvent(correction, tenantId);
      written += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(
        {
          entityId: correction.entityId,
          entityType: correction.entityType,
          error: message,
        },
        'Failed to write audit event for reconciliation correction',
      );
    }
  }

  return written;
};
