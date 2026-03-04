/**
 * @module audit/system-events
 *
 * Fire-and-forget audit event helpers for system-initiated actions.
 *
 * System events are logged when the platform performs automatic status
 * changes without direct user or worker action. All helpers use
 * `writeAuditEventFireAndForget` so that DynamoDB write failures
 * never block the triggering operation.
 *
 * Categories of system events:
 * 1. **Auto-status propagation** — task dependency unblocking after completion
 * 2. **Timeout reclamation** — story status reset after worker timeout
 * 3. **Epic auto-complete** — all stories in an epic reach 'done'
 * 4. **Project auto-complete** — all epics in a project reach 'done'
 */

import { writeAuditEventFireAndForget } from '@laila/database';

import type { UnblockedTask } from '@/lib/api/cascading-reevaluation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_ACTOR = {
  actorType: 'system' as const,
  actorId: 'system',
};

// ---------------------------------------------------------------------------
// Auto-status propagation: task unblocking
// ---------------------------------------------------------------------------

/**
 * Params for logging task-unblocked events after dependency resolution.
 */
interface LogTasksUnblockedParams {
  /** The task whose completion triggered the cascade. */
  triggerTaskId: string;
  /** Human-readable name of the trigger task. */
  triggerTaskName: string;
  /** Tasks that transitioned from 'blocked' to 'pending'. */
  unblockedTasks: UnblockedTask[];
  /** Tenant UUID for multi-tenant isolation. */
  tenantId: string;
  /** Optional project scope for cross-project queries. */
  projectId?: string;
}

/**
 * Logs one audit event per unblocked task after dependency resolution.
 *
 * Each event records the trigger task and the unblocked task as a
 * status_changed action on the unblocked task entity.
 *
 * All writes are fire-and-forget and run in parallel (no awaiting).
 */
export const logTasksUnblocked = (params: LogTasksUnblockedParams): void => {
  for (const unblocked of params.unblockedTasks) {
    writeAuditEventFireAndForget({
      entityType: 'task',
      entityId: unblocked.id,
      action: 'status_changed',
      ...SYSTEM_ACTOR,
      tenantId: params.tenantId,
      ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
      details: `Task "${unblocked.name}" unblocked after dependency "${params.triggerTaskName}" completed`,
      changes: {
        before: { workStatus: 'blocked' },
        after: { workStatus: 'pending' },
      },
      metadata: {
        trigger: 'dependency_resolved',
        trigger_task_id: params.triggerTaskId,
        trigger_task_name: params.triggerTaskName,
        unblocked_task_name: unblocked.name,
      },
    });
  }
};

// ---------------------------------------------------------------------------
// Auto-status propagation: task blocking (dependency failure)
// ---------------------------------------------------------------------------

/**
 * Params for logging task-blocked events after a dependency fails.
 */
interface LogTasksBlockedParams {
  /** The task whose failure triggered the cascade. */
  triggerTaskId: string;
  /** Human-readable name of the trigger task. */
  triggerTaskName: string;
  /** Tasks that transitioned to 'blocked' because the dependency failed. */
  blockedTasks: Array<{ id: string; name: string }>;
  /** Tenant UUID for multi-tenant isolation. */
  tenantId: string;
  /** Optional project scope for cross-project queries. */
  projectId?: string;
}

/**
 * Logs one audit event per blocked task after a dependency failure.
 *
 * Each event records the failed trigger task and the blocked downstream
 * task as a status_changed action on the blocked task entity.
 *
 * All writes are fire-and-forget and run in parallel (no awaiting).
 */
export const logTasksBlocked = (params: LogTasksBlockedParams): void => {
  for (const task of params.blockedTasks) {
    writeAuditEventFireAndForget({
      entityType: 'task',
      entityId: task.id,
      action: 'status_changed',
      actorType: 'system',
      actorId: 'system',
      tenantId: params.tenantId,
      ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
      details: `Task "${task.name}" blocked because dependency "${params.triggerTaskName}" failed`,
      changes: {
        before: { workStatus: 'pending' },
        after: { workStatus: 'blocked' },
      },
      metadata: {
        trigger: 'dependency_failed',
        failedTaskId: params.triggerTaskId,
        failedTaskName: params.triggerTaskName,
        blockedTaskId: task.id,
        blockedTaskName: task.name,
      },
    });
  }
};

// ---------------------------------------------------------------------------
// Epic auto-complete
// ---------------------------------------------------------------------------

/**
 * Params for logging an epic auto-complete event.
 */
interface LogEpicAutoCompleteParams {
  /** The epic that transitioned to 'done'. */
  epicId: string;
  /** The previous work status of the epic. */
  previousStatus: string;
  /** Tenant UUID for multi-tenant isolation. */
  tenantId: string;
  /** Optional project scope for cross-project queries. */
  projectId?: string;
}

/**
 * Logs an audit event when an epic automatically transitions to 'done'
 * because all of its child stories are complete.
 *
 * Fire-and-forget — errors are logged to stderr but do not propagate.
 */
export const logEpicAutoComplete = (params: LogEpicAutoCompleteParams): void => {
  writeAuditEventFireAndForget({
    entityType: 'epic',
    entityId: params.epicId,
    action: 'status_changed',
    ...SYSTEM_ACTOR,
    tenantId: params.tenantId,
    ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
    details: 'Epic auto-completed (all stories done)',
    changes: {
      before: { workStatus: params.previousStatus },
      after: { workStatus: 'done' },
    },
    metadata: {
      trigger: 'auto_complete',
      reason: 'All stories in this epic are complete',
    },
  });
};

// ---------------------------------------------------------------------------
// Project auto-complete
// ---------------------------------------------------------------------------

/**
 * Params for logging a project auto-complete event.
 */
interface LogProjectAutoCompleteParams {
  /** The project that transitioned to 'done'. */
  projectId: string;
  /** The previous work status of the project. */
  previousStatus: string;
  /** Tenant UUID for multi-tenant isolation. */
  tenantId: string;
}

/**
 * Logs an audit event when a project automatically transitions to 'done'
 * because all of its child epics are complete.
 *
 * Fire-and-forget — errors are logged to stderr but do not propagate.
 */
export const logProjectAutoComplete = (params: LogProjectAutoCompleteParams): void => {
  writeAuditEventFireAndForget({
    entityType: 'project',
    entityId: params.projectId,
    action: 'status_changed',
    ...SYSTEM_ACTOR,
    tenantId: params.tenantId,
    projectId: params.projectId,
    details: 'Project auto-completed (all epics done)',
    changes: {
      before: { workStatus: params.previousStatus },
      after: { workStatus: 'done' },
    },
    metadata: {
      trigger: 'auto_complete',
      reason: 'All epics in this project are complete',
    },
  });
};

// ---------------------------------------------------------------------------
// Timeout reclamation: story status reset
// ---------------------------------------------------------------------------

/**
 * Params for logging a story status reset event after timeout reclamation.
 */
interface LogStoryStatusResetParams {
  /** The story whose status was reset. */
  storyId: string;
  /** The human-readable title of the story. */
  storyName: string;
  /** The status the story was reset to (e.g. 'ready' or 'blocked'). */
  newStatus: string;
  /** The worker ID that was timed out. */
  workerId: string;
  /** Number of minutes the worker was inactive before timeout. */
  timedOutAfterMinutes: number;
  /** Tenant UUID for multi-tenant isolation. */
  tenantId: string;
  /** Optional project scope for cross-project queries. */
  projectId?: string;
}

/**
 * Logs a separate status_changed audit event when a reclaimed story's
 * status is reset after timeout.
 *
 * This is distinct from the 'timed_out' event logged by the timeout
 * checker itself — that event records the reclamation act, while this
 * event records the resulting status change on the story entity.
 *
 * Fire-and-forget — errors are logged to stderr but do not propagate.
 */
export const logStoryStatusReset = (params: LogStoryStatusResetParams): void => {
  writeAuditEventFireAndForget({
    entityType: 'user_story',
    entityId: params.storyId,
    action: 'status_changed',
    ...SYSTEM_ACTOR,
    tenantId: params.tenantId,
    ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
    details: `Story "${params.storyName}" status reset to ${params.newStatus}`,
    changes: {
      before: { workStatus: 'in_progress' },
      after: { workStatus: params.newStatus },
    },
    metadata: {
      trigger: 'timeout_reclamation',
      story_name: params.storyName,
      previous_worker_id: params.workerId,
      timed_out_after_minutes: params.timedOutAfterMinutes,
    },
  });
};
