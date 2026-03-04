/**
 * Audit event writing for the timeout-checker Lambda function.
 *
 * Writes audit events to DynamoDB for each timeout reclamation action.
 * Each reclamation generates an audit event with the story, worker,
 * and timeout details for traceability.
 */

import { writeAuditEvent } from '@laila/database';

import type { ReclaimedStorySummary } from './orchestration';

/**
 * Write a timeout reclamation audit event to DynamoDB.
 *
 * Called AFTER the database transaction commits so that the audit trail
 * is consistent with the committed state (same pattern as story
 * complete/fail).
 */
export const writeTimeoutAuditEvent = async (
  storyId: string,
  tenantId: string,
  assignedWorkerId: string,
  result: ReclaimedStorySummary,
  projectTimeoutMinutes: number,
  attempts: number,
): Promise<void> => {
  await writeAuditEvent({
    entityType: 'user_story',
    entityId: storyId,
    action: 'timed_out',
    actorType: 'system',
    actorId: 'timeout-checker',
    tenantId,
    changes: {
      before: { workStatus: 'in_progress', assignedWorkerId },
      after: { workStatus: result.newStatus, assignedWorkerId: null },
    },
    metadata: {
      timed_out_after_minutes: result.timedOutAfterMinutes,
      timeout_limit_minutes: projectTimeoutMinutes,
      previous_worker_id: assignedWorkerId,
      attempt_number: attempts,
    },
  });
};
