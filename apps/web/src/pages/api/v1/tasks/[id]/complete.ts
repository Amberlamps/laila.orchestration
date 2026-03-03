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
 *   - Requesting worker must be the one assigned to the parent story
 *
 * Post-conditions:
 *   - Task status changes to 'done'
 *   - Task completedAt timestamp is set
 *   - Cascading re-evaluation is triggered (within the same transaction):
 *     1. Downstream tasks that depend on this task are re-evaluated
 *        (may transition from 'blocked' to 'pending')
 *     2. Parent story work status is re-derived
 *     3. Parent epic work status is re-derived
 *     4. Parent project work status is re-derived
 *
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import { createTaskRepository, getDb } from '@laila/database';
import { NotFoundError, ConflictError, AuthorizationError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { triggerCascadingReevaluation } from '@/lib/api/cascading-reevaluation';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

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
 *
 * Response: 200 with { data: task, cascade: CascadeResult }
 * Throws: 404 NotFoundError if task or parent story does not exist
 * Throws: 403 AuthorizationError with WORKER_NOT_ASSIGNED if worker is not assigned
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if task is not in_progress
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
            `Cannot complete task in "${String(task.workStatus)}" status. Task must be in "in_progress" status to complete.`,
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

        // 4. Verify the requesting worker is assigned to the parent story
        if (parentStory.assignedWorkerId !== workerId) {
          throw new AuthorizationError(
            DomainErrorCode.WORKER_NOT_ASSIGNED,
            `Worker ${workerId} is not assigned to the parent story. Only the assigned worker can complete tasks.`,
          );
        }

        // 5. Atomic operation: task completion + cascading re-evaluation
        //    All succeed or all roll back.
        const { updated, cascadeResult } = await taskRepo.withTransaction(async (tx) => {
          // 5a. Transition the task to 'done' with completedAt timestamp
          const completedTask = await taskRepo.updateInTx(
            tenantId,
            id,
            { workStatus: 'done', completedAt: new Date() },
            task.version,
            tx,
          );

          // 5b. Trigger cascading re-evaluation within the same transaction
          const cascade = await triggerCascadingReevaluation(tenantId, id, tx);

          return { updated: completedTask, cascadeResult: cascade };
        });

        res.status(200).json({
          data: updated,
          cascade: {
            unblockedTaskIds: cascadeResult.unblockedTaskIds,
            storyStatus: cascadeResult.storyStatus,
            epicStatus: cascadeResult.epicStatus,
            projectStatus: cascadeResult.projectStatus,
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
