/**
 * API route for completing a task.
 *
 * POST /api/v1/tasks/:id/complete
 *
 * Transitions a task from 'in_progress' to 'done'. Only callable by the
 * worker (agent) assigned to the parent story. After the task is marked
 * as done, triggers cascading re-evaluation of downstream tasks, parent
 * story, parent epic, and parent project statuses.
 *
 * Pre-conditions:
 *   - Task must be in 'in_progress' status
 *   - Requesting worker must be assigned to the parent story
 *   - Parent story must be in 'in_progress' status
 *
 * Post-conditions:
 *   - Task status changes to 'done'
 *   - Task completedAt timestamp is set
 *   - Cascading re-evaluation is triggered (within the same transaction):
 *     1. Downstream tasks that depend on this task are re-evaluated
 *        (may transition from 'blocked' to 'pending')
 *     2. Parent story work status is re-derived (NOT auto-completed)
 *     3. Parent epic work status is re-derived
 *     4. Parent project work status is re-derived
 *   - Audit event is logged
 *
 * Response: 200 with {
 *   data: {
 *     task: { id, name, status, completed_at },
 *     cascading_updates: {
 *       unblocked_tasks: [{ id, name, new_status }],
 *       all_tasks_complete: boolean
 *     }
 *   }
 * }
 *
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import { createTaskRepository, getDb, writeAuditEvent } from '@laila/database';
import { NotFoundError, ConflictError, AuthorizationError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { triggerCascadingReevaluation } from '@/lib/api/cascading-reevaluation';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import {
  logTasksUnblocked,
  logEpicAutoComplete,
  logProjectAutoComplete,
} from '@/lib/audit/system-events';
import { withAuth } from '@/lib/middleware/with-auth';
import { guardWorkerStillAssigned } from '@/lib/orchestration/race-condition-guards';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

/**
 * Validates the `id` route parameter as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const taskIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/tasks/:id/complete -- Complete a task
// ---------------------------------------------------------------------------

/**
 * Transitions an in_progress task to done after validating:
 * - The task exists and is in 'in_progress' status
 * - The requesting worker is assigned to the parent story
 *
 * After completion, triggers cascading re-evaluation to:
 * - Unblock downstream tasks whose dependencies are now all complete
 * - Re-derive parent story, epic, and project work statuses
 * - Log an audit event for the task completion
 *
 * Response: 200 with spec-compliant response shape including
 * unblocked_tasks (id, name, new_status) and all_tasks_complete flag.
 *
 * Throws: 404 NotFoundError if task or parent story does not exist
 * Throws: 403 AuthorizationError with WORKER_NOT_ASSIGNED if worker is not assigned
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if task or parent story is not in_progress
 */
const handleComplete = withErrorHandler(
  withAuth(
    'agent',
    withValidation({ params: taskIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const auth = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        if (auth.type !== 'agent') {
          throw new AuthorizationError(
            DomainErrorCode.INSUFFICIENT_PERMISSIONS,
            'This endpoint requires worker authentication',
          );
        }

        const { tenantId, workerId } = auth;

        const db = getDb();
        const taskRepo = createTaskRepository(db);

        // 1. Verify the task exists
        const task = await taskRepo.findById(tenantId, id);
        if (!task) {
          throw new NotFoundError(DomainErrorCode.TASK_NOT_FOUND, `Task with id ${id} not found`);
        }

        // 2. Verify the task is in 'in_progress' status
        if (task.workStatus !== 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot complete task in "${task.workStatus}" status. Task must be in "in_progress" status to complete.`,
          );
        }

        // 3. Verify the parent story exists
        const parentStory = await taskRepo.getParentStory(tenantId, id);
        if (!parentStory) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Parent story for task ${id} not found`,
          );
        }

        // 4. Verify the requesting worker is assigned to the parent story.
        //    This check comes BEFORE the status check because when a story
        //    is reclaimed (timeout or manual unassignment), both the worker
        //    assignment AND status change. Returning WORKER_NOT_ASSIGNED
        //    gives the worker a clear, actionable signal.
        if (parentStory.assignedWorkerId !== workerId) {
          throw new AuthorizationError(
            DomainErrorCode.WORKER_NOT_ASSIGNED,
            `Worker ${workerId} is not assigned to the parent story. ` +
              `The story may have been reclaimed due to timeout or manual unassignment. ` +
              `Current story status: ${parentStory.workStatus}.`,
            { storyId: parentStory.id, currentStatus: parentStory.workStatus },
          );
        }

        // 5. Verify the parent story is in 'in_progress' status
        if (parentStory.workStatus !== 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot complete task: parent story is in "${parentStory.workStatus}" status. Parent story must be in "in_progress" status.`,
          );
        }

        // 6. Atomic operation: task completion + cascading re-evaluation
        //    All succeed or all roll back.
        const { updated, cascadeResult } = await taskRepo.withTransaction(async (tx) => {
          // 6a. Race condition guard (Defense Layer 3): Re-verify parent story
          //     status and worker assignment within the transaction. If the
          //     timeout checker reclaimed the story between steps 3-5 above
          //     and this point, the guard will throw a descriptive error.
          await guardWorkerStillAssigned(parentStory.id, workerId, tenantId, tx);

          // 6b. Transition the task to 'done' with completedAt timestamp
          const completedTask = await taskRepo.updateInTx(
            tenantId,
            id,
            { workStatus: 'done', completedAt: new Date() },
            task.version,
            tx,
          );

          // 6c. Trigger cascading re-evaluation within the same transaction
          const cascade = await triggerCascadingReevaluation(tenantId, id, tx);

          return { updated: completedTask, cascadeResult: cascade };
        });

        // 7. Log audit event for the task completion (outside transaction;
        //    audit writes to DynamoDB and should not block the PG transaction).
        const completeProjectId = cascadeResult.projectId ?? undefined;
        await writeAuditEvent({
          entityType: 'task',
          entityId: id,
          action: 'completed',
          actorType: 'worker',
          actorId: workerId,
          tenantId,
          ...(completeProjectId ? { projectId: completeProjectId } : {}),
          details: `Task "${task.title}" completed`,
          changes: {
            before: { workStatus: 'in_progress' },
            after: { workStatus: 'done', completedAt: updated.completedAt?.toISOString() },
          },
          metadata: {
            parentStoryId: parentStory.id,
            unblockedTaskCount: cascadeResult.unblockedTasks.length,
            allTasksComplete: cascadeResult.allTasksComplete,
          },
        });

        // 7b. Fire-and-forget system audit events for cascading changes.
        //     These log each unblocked task and any auto-complete transitions.
        if (cascadeResult.unblockedTasks.length > 0) {
          logTasksUnblocked({
            triggerTaskId: id,
            triggerTaskName: task.title,
            unblockedTasks: cascadeResult.unblockedTasks,
            tenantId,
            ...(completeProjectId ? { projectId: completeProjectId } : {}),
          });
        }

        if (
          cascadeResult.epicId &&
          cascadeResult.epicStatus === 'done' &&
          cascadeResult.previousEpicStatus !== 'done'
        ) {
          logEpicAutoComplete({
            epicId: cascadeResult.epicId,
            previousStatus: cascadeResult.previousEpicStatus ?? 'unknown',
            tenantId,
            ...(completeProjectId ? { projectId: completeProjectId } : {}),
          });
        }

        if (
          cascadeResult.projectId &&
          cascadeResult.projectStatus === 'done' &&
          cascadeResult.previousProjectStatus !== 'done'
        ) {
          logProjectAutoComplete({
            projectId: cascadeResult.projectId,
            previousStatus: cascadeResult.previousProjectStatus ?? 'unknown',
            tenantId,
          });
        }

        // 8. Send spec-compliant response
        res.status(200).json({
          data: {
            task: {
              id: updated.id,
              name: updated.title,
              status: 'complete',
              completed_at: updated.completedAt?.toISOString() ?? null,
            },
            cascading_updates: {
              unblocked_tasks: cascadeResult.unblockedTasks.map((t) => ({
                id: t.id,
                name: t.name,
                new_status: 'not_started',
              })),
              all_tasks_complete: cascadeResult.allTasksComplete,
            },
          },
        });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

/**
 * Next.js Pages Router API handler that dispatches to the correct handler
 * based on the HTTP method. Only POST is allowed for this endpoint.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'POST':
      return handleComplete(req, res);
    default:
      res.setHeader('Allow', 'POST');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
