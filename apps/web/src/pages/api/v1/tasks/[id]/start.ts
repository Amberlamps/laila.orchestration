/**
 * API route for starting a task.
 *
 * POST /api/v1/tasks/:id/start
 *
 * Transitions a task from 'pending' to 'in_progress'. Only callable by the
 * worker (agent) assigned to the parent story. Enforces finish-to-start
 * semantics: all upstream dependency tasks must be complete ('done') before
 * a task can start.
 *
 * Pre-conditions:
 *   - Task must be in 'pending' status
 *   - Parent story must be in 'in_progress' status
 *   - Requesting worker must be the one assigned to the parent story
 *   - All upstream dependency tasks must be complete ('done')
 *
 * Post-conditions:
 *   - Task status changes to 'in_progress'
 *   - Task startedAt timestamp is set
 *
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import { createTaskRepository, getDb, writeAuditEventFireAndForget } from '@laila/database';
import { NotFoundError, ConflictError, AuthorizationError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

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
// POST /api/v1/tasks/:id/start -- Start a task
// ---------------------------------------------------------------------------

/**
 * Transitions a pending task to in_progress after validating:
 * - The task exists and is in 'pending' status
 * - The parent story is in 'in_progress' status
 * - The requesting worker is assigned to the parent story
 * - All upstream dependency tasks are complete ('done')
 *
 * Response: 200 with { data: task }
 * Throws: 404 NotFoundError if task or parent story does not exist
 * Throws: 403 AuthorizationError with WORKER_NOT_ASSIGNED if worker is not assigned
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if task is not pending
 * Throws: 409 ConflictError with INVALID_DEPENDENCY if upstream deps are not complete
 */
const handleStart = withErrorHandler(
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

        // 2. Verify the task is in 'pending' status
        if (task.workStatus !== 'pending') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot start task in "${String(task.workStatus)}" status. Task must be in "pending" status to start.`,
          );
        }

        // 3. Verify the parent story exists and is in 'in_progress' status
        const parentStory = await taskRepo.getParentStory(tenantId, id);
        if (!parentStory) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Parent story for task ${id} not found`,
          );
        }

        if (parentStory.workStatus !== 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot start task when parent story is in "${parentStory.workStatus}" status. Parent story must be "in_progress".`,
          );
        }

        // 4. Verify the requesting worker is assigned to the parent story
        if (parentStory.assignedWorkerId !== workerId) {
          throw new AuthorizationError(
            DomainErrorCode.WORKER_NOT_ASSIGNED,
            `Worker ${workerId} is not assigned to the parent story. Only the assigned worker can start tasks.`,
          );
        }

        // 5. Verify all upstream dependency tasks are complete ('done')
        const dependencies = await taskRepo.getDependencies(tenantId, id);
        const blockingTasks = dependencies.filter((dep) => dep.workStatus !== 'done');

        if (blockingTasks.length > 0) {
          const blockingIds = blockingTasks.map((t) => t.id);
          const blockingSummaries = blockingTasks.map((t) => ({
            id: t.id,
            title: t.title,
            workStatus: t.workStatus,
          }));

          throw new ConflictError(
            DomainErrorCode.INVALID_DEPENDENCY,
            `Cannot start task: ${String(blockingTasks.length)} upstream dependenc${blockingTasks.length === 1 ? 'y is' : 'ies are'} not complete`,
            {
              blockingTaskIds: blockingIds,
              blockingTasks: blockingSummaries,
            },
          );
        }

        // 6. Transition the task to 'in_progress' with startedAt timestamp
        const updated = await taskRepo.update(
          tenantId,
          id,
          { workStatus: 'in_progress', startedAt: new Date() },
          task.version,
        );

        const startProjectId = await taskRepo.getProjectIdForTask(tenantId, id);
        writeAuditEventFireAndForget({
          entityType: 'task',
          entityId: id,
          action: 'status_changed',
          actorType: 'worker',
          actorId: workerId,
          tenantId,
          ...(startProjectId ? { projectId: startProjectId } : {}),
          details: `Task "${String(task.title)}" started`,
          changes: {
            before: { workStatus: 'pending' },
            after: { workStatus: 'in_progress' },
          },
          metadata: {
            oldStatus: 'pending',
            newStatus: 'in_progress',
            taskTitle: task.title,
            parentStoryId: parentStory.id,
          },
        });

        res.status(200).json({ data: updated });
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
      return handleStart(req, res);
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
