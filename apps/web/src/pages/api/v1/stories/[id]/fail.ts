/**
 * API route for failing a story.
 *
 * POST /api/v1/stories/:id/fail
 *
 * Marks an in-progress story as failed. Called by the assigned worker when
 * an unrecoverable error is encountered, or by a human operator who decides
 * to manually fail the story.
 *
 * Pre-conditions:
 *   - Story must be in 'in_progress' status
 *   - If worker auth: worker must be assigned to this story
 *   - If human auth: user must have access (tenant isolation)
 *
 * Post-conditions:
 *   - Story status changes to 'failed'
 *   - Error message and optional details are recorded
 *   - Partial cost data is recorded (if provided)
 *   - Worker assignment is preserved (not cleared -- for debugging visibility)
 *   - Downstream blocked tasks remain blocked (no cascading status changes)
 *   - Parent epic and project work statuses are re-derived
 *   - An attempt history record is updated with failure details
 *   - A task statuses snapshot is captured at failure time
 *   - An audit event is logged with failure details
 *
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import {
  createStoryRepository,
  createTaskRepository,
  createEpicRepository,
  createProjectRepository,
  getDb,
  attemptHistoryTable,
  writeAuditEvent,
} from '@laila/database';
import {
  NotFoundError,
  ConflictError,
  AuthorizationError,
  DomainErrorCode,
  storyFailSchema,
} from '@laila/shared';
import { eq, and, sql } from 'drizzle-orm';
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
const storyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/stories/:id/fail -- Fail a story
// ---------------------------------------------------------------------------

/**
 * Marks an in-progress story as failed after validating:
 * - The story exists and is in 'in_progress' status
 * - If worker auth: the requesting worker is assigned to the story
 * - If human auth: the user belongs to the same tenant
 *
 * After failure:
 * - Story work status transitions to 'failed'
 * - The current in-progress attempt history record is updated with failure details
 * - A task statuses snapshot is captured
 * - Parent epic and project work statuses are re-derived
 * - An audit event is logged
 *
 * Response: 200 with { data: { story: { ... } } }
 * Throws: 404 NotFoundError if story does not exist
 * Throws: 403 AuthorizationError with WORKER_NOT_ASSIGNED if worker is not assigned
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if story is not in_progress
 */
const handleFail = withErrorHandler(
  withAuth(
    'both',
    withValidation({ body: storyFailSchema, params: storyIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const auth = (req as AuthenticatedRequest).auth;
        const { id } = data.params;
        const { error_message, error_details, partial_cost_usd, partial_cost_tokens } = data.body;

        const db = getDb();
        const storyRepo = createStoryRepository(db);
        const taskRepo = createTaskRepository(db);
        const epicRepo = createEpicRepository(db);
        const projectRepo = createProjectRepository(db);

        // 1. Verify the story exists
        const story = await storyRepo.findById(auth.tenantId, id);
        if (!story) {
          throw new NotFoundError(DomainErrorCode.STORY_NOT_FOUND, `Story with id ${id} not found`);
        }

        // 2. Verify the story is in 'in_progress' status
        if (story.workStatus !== 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot fail story in "${story.workStatus}" status. Story must be in "in_progress" status to fail.`,
          );
        }

        // 3. Validate authorization based on auth type
        let actorType: 'user' | 'worker';
        let actorId: string;

        switch (auth.type) {
          case 'agent': {
            // Worker must be assigned to this story
            if (story.assignedWorkerId !== auth.workerId) {
              throw new AuthorizationError(
                DomainErrorCode.WORKER_NOT_ASSIGNED,
                `Worker ${auth.workerId} is not assigned to this story. Only the assigned worker can fail the story.`,
              );
            }
            actorType = 'worker';
            actorId = auth.workerId;
            break;
          }
          case 'human': {
            // Human auth: tenant isolation is already enforced by findById
            actorType = 'user';
            actorId = auth.userId;
            break;
          }
          default: {
            const _exhaustive: never = auth;
            throw new AuthorizationError(
              DomainErrorCode.INSUFFICIENT_PERMISSIONS,
              `Unexpected auth type: ${JSON.stringify(_exhaustive)}`,
            );
          }
        }

        // 4. Capture task statuses snapshot before any changes
        const storyTasks = await taskRepo.findByStory(auth.tenantId, id, {
          pagination: { page: 1, limit: 1000, sortBy: 'createdAt', sortOrder: 'asc' },
        });

        const taskStatusesSnapshot: Record<string, string> = {};
        for (const task of storyTasks.data) {
          taskStatusesSnapshot[task.id] = task.workStatus;
        }

        // 5. Compute partial cost string for the numeric(10,4) column
        const costString = partial_cost_usd !== undefined ? partial_cost_usd.toFixed(4) : null;

        // 6. Update story status to 'failed' with partial cost data.
        //    Worker assignment is intentionally preserved (not cleared) for
        //    debugging visibility. The storyRepo.update method is used instead
        //    of completeAssignment because completeAssignment clears the worker.
        const updated = await storyRepo.update(
          auth.tenantId,
          id,
          {
            workStatus: 'failed',
            actualCost: costString,
          },
          story.version,
        );

        // 7. Build the full context record for durable attempt history storage.
        //    The `reason` field stores a JSON string with error message, error
        //    details, task snapshot, and partial cost context so that the full
        //    failure context is preserved in the durable attempt_history table
        //    (not only in audit metadata).
        const failureContext = JSON.stringify({
          error_message,
          ...(error_details !== undefined ? { error_details } : {}),
          ...(partial_cost_usd !== undefined ? { partial_cost_usd } : {}),
          ...(partial_cost_tokens !== undefined ? { partial_cost_tokens } : {}),
          task_statuses_snapshot: taskStatusesSnapshot,
        });

        // 8. Update the current in-progress attempt history record with failure
        //    details. The attempt record was created when the worker was assigned.
        //    We update it with completion timestamp, failure status, full context,
        //    cost, and duration.
        const now = new Date();

        await taskRepo.withTransaction(async (tx) => {
          await tx
            .update(attemptHistoryTable)
            .set({
              completedAt: now,
              status: 'failed',
              reason: failureContext,
              cost: costString,
              durationMs: sql`EXTRACT(EPOCH FROM (${now}::timestamptz - ${attemptHistoryTable.startedAt})) * 1000`,
            })
            .where(
              and(
                eq(attemptHistoryTable.userStoryId, id),
                eq(attemptHistoryTable.tenantId, auth.tenantId),
                eq(attemptHistoryTable.attemptNumber, story.attempts),
                eq(attemptHistoryTable.status, 'in_progress'),
              ),
            );
        });

        // 9. Re-derive parent epic work status.
        //    This updates the epic's status based on the aggregate of its
        //    child story statuses (including this newly-failed story).
        await epicRepo.computeDerivedStatus(auth.tenantId, story.epicId);

        // 10. Re-derive parent project work status.
        //     Examines all epics in the project to determine the aggregate status.
        const projectId = await taskRepo.getProjectIdForStory(auth.tenantId, id);
        if (projectId) {
          const allEpics = await epicRepo.findAllByProject(auth.tenantId, projectId);
          const allDone = allEpics.every((e) => e.workStatus === 'done');
          const anyActive = allEpics.some(
            (e) => e.workStatus === 'in_progress' || e.workStatus === 'done',
          );

          if (allDone) {
            await projectRepo.updateWorkStatus(auth.tenantId, projectId, 'done');
          } else if (anyActive) {
            await projectRepo.updateWorkStatus(auth.tenantId, projectId, 'in_progress');
          }
        }

        // 11. Log audit event with failure details.
        //     Errors are surfaced, not silenced.
        await writeAuditEvent({
          entityType: 'user_story',
          entityId: id,
          action: 'failed',
          actorType,
          actorId,
          tenantId: auth.tenantId,
          changes: {
            before: { workStatus: story.workStatus },
            after: { workStatus: 'failed' },
          },
          metadata: {
            error_message,
            ...(error_details !== undefined ? { error_details } : {}),
            ...(partial_cost_usd !== undefined ? { partial_cost_usd } : {}),
            ...(partial_cost_tokens !== undefined ? { partial_cost_tokens } : {}),
            task_statuses_snapshot: taskStatusesSnapshot,
            assigned_worker_id: story.assignedWorkerId,
            attempt_number: story.attempts,
          },
        });

        // 12. Return response
        res.status(200).json({
          data: {
            story: {
              id: updated.id,
              name: updated.title,
              status: updated.workStatus,
              failed_at: updated.updatedAt,
              error_message,
              assigned_worker_id: updated.assignedWorkerId,
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
      return handleFail(req, res);
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
