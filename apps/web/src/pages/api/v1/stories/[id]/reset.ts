/**
 * API route for resetting a failed story.
 *
 * POST /api/v1/stories/:id/reset
 *
 * Resets a failed story back into the assignment pool. The reset determines
 * whether the story should go to "not_started" or "blocked" based on the
 * current DAG state, clears the worker assignment, optionally resets task
 * statuses, and logs an audit event.
 *
 * Pre-conditions:
 *   - Story must be in 'failed' status
 *   - Only human auth is accepted (worker auth returns 403)
 *
 * Post-conditions:
 *   - Story status changes to 'not_started' or 'blocked' (DAG-determined):
 *     - If all upstream cross-story task dependencies are complete: 'not_started'
 *       (DB stores 'ready' for assignment flow compatibility)
 *     - If any upstream cross-story task dependency is incomplete: 'blocked'
 *   - Worker assignment is cleared
 *   - If reset_tasks is true:
 *     - In-progress and failed tasks are reset to 'not_started' (DB: 'pending')
 *     - Completed tasks (done) are preserved
 *     - Blocked tasks are re-evaluated (may become 'not_started' if deps complete)
 *     - Pending tasks are left as-is
 *   - Parent epic and project work statuses are re-derived
 *   - An audit event is logged
 *   - Version field is incremented
 *
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import {
  createStoryRepository,
  createTaskRepository,
  createEpicRepository,
  createProjectRepository,
  getDb,
  writeAuditEvent,
} from '@laila/database';
import { NotFoundError, ConflictError, DomainErrorCode, storyResetSchema } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest, HumanAuthContext } from '@/lib/middleware/with-auth';
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
 * Minimal story shape used for status evaluation during reset.
 * Contains only the fields accessed in the reset logic.
 */
interface StoryRecord {
  id: string;
  title: string;
  workStatus: string;
  epicId: string;
  assignedWorkerId: string | null;
  attempts: number;
  version: number;
}

/**
 * Minimal task shape used for status evaluation during reset.
 * Contains only the fields accessed in the reset logic.
 */
interface TaskRecord {
  id: string;
  workStatus: string;
}

// ---------------------------------------------------------------------------
// Status mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps internal DB work status values to the external API contract.
 *
 * The assignment flow uses DB status 'ready' for stories eligible for
 * assignment, but the API contract uses 'not_started' for the same concept.
 * Similarly, tasks use DB status 'pending' for not-started tasks.
 */
const mapStoryStatusToApi = (dbStatus: string): string => {
  switch (dbStatus) {
    case 'ready':
      return 'not_started';
    case 'blocked':
      return 'blocked';
    default:
      return dbStatus;
  }
};

// ---------------------------------------------------------------------------
// POST /api/v1/stories/:id/reset -- Reset a failed story
// ---------------------------------------------------------------------------

/**
 * Resets a failed story back to the assignment pool after validating:
 * - The story exists and is in 'failed' status
 * - The request uses human auth (worker auth is rejected by withAuth)
 *
 * After reset:
 * - Story status is set to 'ready' (API: 'not_started') or 'blocked' based on DAG
 * - Worker assignment is cleared
 * - Task statuses are selectively reset (when reset_tasks is true)
 * - Parent epic and project work statuses are re-derived
 * - An audit event is logged
 *
 * Response: 200 with { data: { story: { ... }, task_resets: { ... } } }
 * Throws: 404 NotFoundError if story does not exist
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if story is not failed
 */
const handleReset = withErrorHandler(
  withAuth(
    'human',
    withValidation({ body: storyResetSchema, params: storyIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        // withAuth('human', ...) guarantees only human auth reaches here.
        const auth = (req as AuthenticatedRequest).auth as HumanAuthContext;
        const { id } = data.params as { id: string };
        const { reset_tasks } = data.body as { reset_tasks: boolean };

        const db = getDb();
        const storyRepo = createStoryRepository(db);
        const taskRepo = createTaskRepository(db);
        const epicRepo = createEpicRepository(db);
        const projectRepo = createProjectRepository(db);

        // 1. Verify the story exists
        const storyRaw = await storyRepo.findById(auth.tenantId, id);
        if (!storyRaw) {
          throw new NotFoundError(DomainErrorCode.STORY_NOT_FOUND, `Story with id ${id} not found`);
        }
        const story = storyRaw as unknown as StoryRecord;

        // 2. Verify the story is in 'failed' status
        if (story.workStatus !== 'failed') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot reset story in "${story.workStatus}" status. Story must be in "failed" status to reset.`,
          );
        }

        // 3. Determine target status via DAG analysis
        //    Check if this story has any incomplete cross-story dependencies.
        //    If all upstream deps are complete: 'ready' (DB value for assignable stories)
        //    If any upstream dep is incomplete: 'blocked'
        const hasIncompleteUpstream = await storyRepo.hasIncompleteUpstreamDependencies(
          auth.tenantId,
          id,
        );
        const targetDbStatus = hasIncompleteUpstream ? 'blocked' : 'ready';

        // 4. Atomically reset the story: clear worker assignment, set target
        //    status, increment version, and update attempt history.
        const updatedRaw = await storyRepo.resetStory(auth.tenantId, id, targetDbStatus);
        const updated = updatedRaw as unknown as StoryRecord;

        // 5. Reset task statuses (when reset_tasks is true)
        let resetCount = 0;
        let preservedCount = 0;

        if (reset_tasks) {
          const storyTasks = await taskRepo.findByStory(auth.tenantId, id, {
            pagination: { page: 1, limit: 1000, sortBy: 'createdAt', sortOrder: 'asc' },
          });

          const tasks = storyTasks.data as unknown as TaskRecord[];
          const taskIdsToResetToPending: string[] = [];
          const blockedTaskIds: string[] = [];

          for (const task of tasks) {
            switch (task.workStatus) {
              case 'done':
                // Preserve completed tasks -- work already done
                preservedCount += 1;
                break;
              case 'in_progress':
              case 'failed':
                // Reset in-progress and failed tasks to 'pending' (API: 'not_started')
                taskIdsToResetToPending.push(task.id);
                break;
              case 'blocked':
                // Blocked tasks need re-evaluation
                blockedTaskIds.push(task.id);
                break;
              case 'pending':
              case 'ready':
                // Already in a non-active state, leave as-is
                break;
              default:
                // Unknown status -- leave as-is for safety
                break;
            }
          }

          // Reset in-progress and failed tasks to 'pending' (API: 'not_started')
          if (taskIdsToResetToPending.length > 0) {
            await taskRepo.bulkUpdateStatus(auth.tenantId, taskIdsToResetToPending, 'pending');
            resetCount += taskIdsToResetToPending.length;
          }

          // Re-evaluate blocked tasks: check if all their dependencies are
          // now complete. If so, transition to 'pending' (API: 'not_started').
          for (const blockedTaskId of blockedTaskIds) {
            const dependencies = await taskRepo.getDependencies(auth.tenantId, blockedTaskId);
            const allDepsComplete = dependencies.every((dep) => dep.workStatus === 'done');

            if (allDepsComplete) {
              await taskRepo.bulkUpdateStatus(auth.tenantId, [blockedTaskId], 'pending');
              resetCount += 1;
            }
            // If deps are not all complete, the task stays blocked (no count change)
          }
        }

        // 6. Re-derive parent epic work status
        await epicRepo.computeDerivedStatus(auth.tenantId, story.epicId);

        // 7. Re-derive parent project work status
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

        // 8. Log audit event
        await writeAuditEvent({
          entityType: 'user_story',
          entityId: id,
          action: 'reset',
          actorType: 'user',
          actorId: auth.userId,
          tenantId: auth.tenantId,
          changes: {
            before: { workStatus: 'failed' },
            after: { workStatus: targetDbStatus },
          },
          metadata: {
            reset_tasks,
            reset_count: resetCount,
            preserved_count: preservedCount,
            previous_attempts: updated.attempts,
            previous_assigned_worker_id: story.assignedWorkerId,
          },
        });

        // 9. Return response with API-level status names
        //    DB 'ready' -> API 'not_started', DB 'blocked' -> API 'blocked'
        res.status(200).json({
          data: {
            story: {
              id: updated.id,
              name: updated.title,
              status: mapStoryStatusToApi(updated.workStatus),
              previous_attempts: updated.attempts,
            },
            task_resets: {
              reset_count: resetCount,
              preserved_count: preservedCount,
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
      return handleReset(req, res);
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
