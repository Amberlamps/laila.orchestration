/**
 * API route for completing a story.
 *
 * POST /api/v1/stories/:id/complete
 *
 * Marks an in-progress story as completed after all tasks are done. Called by
 * the assigned worker to record cost data and finalize the story. Triggers
 * status propagation to the parent epic and project.
 *
 * Pre-conditions:
 *   - Story must be in 'in_progress' status
 *   - Requesting worker must be assigned to this story
 *   - All tasks in the story must be in 'done' status
 *
 * Post-conditions:
 *   - Story status changes to 'done'
 *   - Story completedAt timestamp is set
 *   - Cost data (cost_usd, cost_tokens) is recorded
 *   - Worker assignment is cleared (worker is free for new assignments)
 *   - Current in-progress attempt is updated to 'completed'
 *   - Parent epic work status is re-derived
 *   - Parent project work status is re-derived
 *   - An audit event is logged with completion details
 *   - All PG operations run within a single transaction
 *
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import {
  createStoryRepository,
  createTaskRepository,
  createEpicRepository,
  createProjectRepository,
  getDb,
  userStoriesTable,
  attemptHistoryTable,
  writeAuditEvent,
} from '@laila/database';
import {
  NotFoundError,
  ConflictError,
  AuthorizationError,
  ValidationError,
  DomainErrorCode,
  storyCompleteSchema,
} from '@laila/shared';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { logEpicAutoComplete, logProjectAutoComplete } from '@/lib/audit/system-events';
import { withAuth } from '@/lib/middleware/with-auth';
import { guardWorkerStillAssigned } from '@/lib/orchestration/race-condition-guards';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { DrizzleDb } from '@laila/database';
import type { WorkStatus } from '@laila/shared';
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

/**
 * Shape of the story row returned by the drizzle `.returning()` call
 * within the transaction. Only the fields accessed in the response.
 */
interface CompletedStoryRow {
  id: string;
  title: string;
  workStatus: string;
  attempts: number;
  updatedAt: Date | string;
}

// ---------------------------------------------------------------------------
// POST /api/v1/stories/:id/complete -- Complete a story
// ---------------------------------------------------------------------------

/**
 * Marks an in-progress story as completed after validating:
 * - The story exists and is in 'in_progress' status
 * - The requesting worker is assigned to the story
 * - All tasks in the story are in 'done' status
 * - Cost data is valid
 *
 * After completion (all within a single transaction):
 * - Story work status transitions to 'done', worker assignment cleared
 * - The current in-progress attempt history record is updated
 * - Parent epic and project work statuses are re-derived
 *
 * After the transaction, an audit event is logged.
 *
 * Response: 200 with { data: { story: { ... }, epic_status, project_status } }
 * Throws: 404 NotFoundError if story does not exist
 * Throws: 403 AuthorizationError with WORKER_NOT_ASSIGNED if worker is not assigned
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if story is not in_progress
 * Throws: 400 ValidationError if not all tasks are in 'done' status
 */
const handleComplete = withErrorHandler(
  withAuth(
    'agent',
    withValidation({ body: storyCompleteSchema, params: storyIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const auth = (req as AuthenticatedRequest).auth;

        if (auth.type !== 'agent') {
          throw new AuthorizationError(
            DomainErrorCode.INSUFFICIENT_PERMISSIONS,
            'This endpoint requires worker authentication',
          );
        }

        const { id } = data.params;
        const { cost_usd, cost_tokens } = data.body;
        const { tenantId, workerId } = auth;

        const db = getDb();
        const storyRepo = createStoryRepository(db);
        const taskRepo = createTaskRepository(db);

        // 1. Verify the story exists
        const story = await storyRepo.findById(tenantId, id);
        if (!story) {
          throw new NotFoundError(DomainErrorCode.STORY_NOT_FOUND, `Story with id ${id} not found`);
        }

        // 2. Verify the requesting worker is assigned to this story.
        //    This check comes BEFORE the status check because when a story
        //    is reclaimed (timeout or manual unassignment), both the worker
        //    assignment AND status change. Returning WORKER_NOT_ASSIGNED
        //    gives the worker a clear, actionable signal.
        if (story.assignedWorkerId !== workerId) {
          throw new AuthorizationError(
            DomainErrorCode.WORKER_NOT_ASSIGNED,
            `Worker ${workerId} is not assigned to this story. ` +
              `The story may have been reclaimed due to timeout or manual unassignment. ` +
              `Current story status: ${String(story.workStatus)}.`,
            { storyId: story.id, currentStatus: String(story.workStatus) },
          );
        }

        // 3. Verify the story is in 'in_progress' status
        if (story.workStatus !== 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot complete story in "${String(story.workStatus)}" status. Story must be in "in_progress" status to complete.`,
          );
        }

        // 4. Verify all tasks in the story are in 'done' status
        const storyTasks = await taskRepo.findByStory(tenantId, id, {
          pagination: { page: 1, limit: 1000, sortBy: 'createdAt', sortOrder: 'asc' },
        });

        const incompleteTasks = storyTasks.data.filter((task) => task.workStatus !== 'done');
        if (incompleteTasks.length > 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            `Cannot complete story: ${String(incompleteTasks.length)} task(s) are not in "done" status. All tasks must be completed before the story can be marked as complete.`,
            {
              incomplete_tasks: incompleteTasks.map((task) => ({
                id: task.id,
                title: task.title,
                status: task.workStatus,
              })),
            },
          );
        }

        // 5. Format cost for the numeric(10,4) column
        const costString = cost_usd.toFixed(4);

        // 5b. Capture previous epic and project statuses BEFORE the
        //     transaction so we can detect auto-complete transitions
        //     and log system audit events after the transaction commits.
        const epicRepo = createEpicRepository(db);
        const storyEpicId = story.epicId as string;
        const epicBefore = await epicRepo.findById(tenantId, storyEpicId);
        const previousEpicStatus = (epicBefore?.workStatus as string | undefined) ?? null;

        const projectIdForAudit = await taskRepo.getProjectIdForStory(tenantId, id);
        let previousProjectStatus: string | null = null;
        if (projectIdForAudit) {
          const projectRepo = createProjectRepository(db);
          const projectBefore = await projectRepo.findById(tenantId, projectIdForAudit);
          previousProjectStatus = (projectBefore?.workStatus as string | undefined) ?? null;
        }

        // 6. Single atomic transaction: story completion + attempt history +
        //    epic/project status propagation. All succeed or all roll back.
        interface TransactionResult {
          updated: CompletedStoryRow;
          epicStatus: string;
          projectStatus: string;
          projectId: string | null;
        }

        const txResult: TransactionResult = await taskRepo.withTransaction(
          async (tx: DrizzleDb) => {
            // 6a. Race condition guard (Defense Layer 3): Re-verify story
            //     status and worker assignment within the transaction. If the
            //     timeout checker reclaimed the story between steps 1-3 above
            //     and this point, the guard will throw a descriptive error.
            await guardWorkerStillAssigned(id, workerId, tenantId, tx);

            const now = new Date();

            // 6b. Update story: set terminal status, record cost, clear assignment
            const rows = await tx
              .update(userStoriesTable)
              .set({
                workStatus: 'done',
                actualCost: costString,
                assignedWorkerId: null,
                assignedAt: null,
                lastActivityAt: null,
                version: sql`${userStoriesTable.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(userStoriesTable.id, id),
                  eq(userStoriesTable.tenantId, tenantId),
                  eq(userStoriesTable.version, story.version),
                  eq(userStoriesTable.workStatus, 'in_progress'),
                ),
              )
              .returning();

            const completedStory = rows[0] as CompletedStoryRow | undefined;
            if (!completedStory) {
              throw new ConflictError(
                DomainErrorCode.INVALID_STATUS_TRANSITION,
                `Story ${id} could not be completed due to a concurrent update. Please retry.`,
              );
            }

            // 6c. Update the corresponding attempt_history record
            await tx
              .update(attemptHistoryTable)
              .set({
                completedAt: now,
                status: 'completed',
                cost: costString,
                durationMs: sql`EXTRACT(EPOCH FROM (${now}::timestamptz - ${attemptHistoryTable.startedAt})) * 1000`,
              })
              .where(
                and(
                  eq(attemptHistoryTable.userStoryId, id),
                  eq(attemptHistoryTable.tenantId, tenantId),
                  eq(attemptHistoryTable.attemptNumber, completedStory.attempts),
                  eq(attemptHistoryTable.status, 'in_progress'),
                ),
              );

            // 6d. Re-derive parent epic work status within the same transaction
            const txAsDb = tx as unknown as Parameters<typeof createEpicRepository>[0];
            const txEpicRepo = createEpicRepository(txAsDb);
            const txProjectRepo = createProjectRepository(txAsDb);
            const txTaskRepo = createTaskRepository(txAsDb);

            const derivedEpicStatus = await txEpicRepo.computeDerivedStatus(tenantId, story.epicId);

            // 6e. Re-derive parent project work status within the same transaction
            let derivedProjectStatus = 'pending';
            const projectId = await txTaskRepo.getProjectIdForStory(tenantId, id);
            if (projectId) {
              const allEpics = await txEpicRepo.findAllByProject(tenantId, projectId);
              const allDone = allEpics.every((e) => e.workStatus === 'done');
              const anyActive = allEpics.some(
                (e) => e.workStatus === 'in_progress' || e.workStatus === 'done',
              );

              if (allDone) {
                await txProjectRepo.updateWorkStatus(tenantId, projectId, 'done' as WorkStatus);
                derivedProjectStatus = 'done';
              } else if (anyActive) {
                await txProjectRepo.updateWorkStatus(
                  tenantId,
                  projectId,
                  'in_progress' as WorkStatus,
                );
                derivedProjectStatus = 'in_progress';
              }
            }

            return {
              updated: completedStory,
              epicStatus: derivedEpicStatus,
              projectStatus: derivedProjectStatus,
              projectId,
            };
          },
        );

        const { updated, epicStatus, projectStatus } = txResult;

        // 7. Compute duration_seconds from assignedAt to completion.
        //    The story's assignedAt represents when the worker started.
        //    updatedAt on the returned record is the completion timestamp.
        const completedAt =
          updated.updatedAt instanceof Date ? updated.updatedAt : new Date(updated.updatedAt);
        const startedAt =
          story.assignedAt instanceof Date
            ? story.assignedAt
            : story.assignedAt
              ? new Date(story.assignedAt as unknown as string)
              : null;
        const durationSeconds = startedAt
          ? Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000)
          : 0;

        // 8. Log audit event with completion details and cost data.
        //    Audit writes to DynamoDB (outside PG transaction) but errors
        //    are surfaced, not silenced.
        const storyCompleteProjectId = txResult.projectId ?? undefined;
        await writeAuditEvent({
          entityType: 'user_story',
          entityId: id,
          action: 'completed',
          actorType: 'worker',
          actorId: workerId,
          tenantId,
          ...(storyCompleteProjectId ? { projectId: storyCompleteProjectId } : {}),
          details: `Story "${String(story.title)}" completed`,
          changes: {
            before: { workStatus: 'in_progress' },
            after: { workStatus: 'done', completedAt: completedAt.toISOString() },
          },
          metadata: {
            cost_usd,
            cost_tokens,
            cost_string: costString,
            duration_seconds: durationSeconds,
            assigned_worker_id: story.assignedWorkerId,
            attempt_number: story.attempts,
            epic_status: epicStatus,
            project_status: projectStatus,
          },
        });

        // 8b. Fire-and-forget system audit events for auto-complete
        //     transitions on the parent epic and project.
        if (epicStatus === 'done' && previousEpicStatus !== 'done') {
          logEpicAutoComplete({
            epicId: storyEpicId,
            previousStatus: previousEpicStatus ?? 'unknown',
            tenantId,
            projectId: storyCompleteProjectId,
          });
        }

        if (txResult.projectId && projectStatus === 'done' && previousProjectStatus !== 'done') {
          logProjectAutoComplete({
            projectId: txResult.projectId,
            previousStatus: previousProjectStatus ?? 'unknown',
            tenantId,
          });
        }

        // 9. Return response
        res.status(200).json({
          data: {
            story: {
              id: updated.id,
              name: updated.title,
              status: 'done',
              completed_at: completedAt.toISOString(),
              cost_usd,
              cost_tokens,
              duration_seconds: durationSeconds,
            },
            epic_status: epicStatus,
            project_status: projectStatus,
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
