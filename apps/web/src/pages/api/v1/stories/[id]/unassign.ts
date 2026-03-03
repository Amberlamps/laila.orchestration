/**
 * API route for manually unassigning a worker from a story.
 *
 * POST /api/v1/stories/:id/unassign
 *
 * Allows a human operator to remove a worker from an in-progress story.
 * This is used when an operator determines that a worker is not making
 * progress, is producing incorrect results, or needs to be replaced.
 * Requires explicit confirmation to prevent accidental unassignment.
 *
 * Pre-conditions:
 *   - Story must be in 'in_progress' status (has an assigned worker)
 *   - Only human auth is accepted (worker auth returns 403)
 *   - confirmation must be explicitly set to true
 *
 * Post-conditions:
 *   - Worker assignment is cleared
 *   - Story status changes to 'not_started' or 'blocked' (DAG-determined):
 *     - If all upstream cross-story task dependencies are complete: 'not_started'
 *       (DB stores 'ready' for assignment flow compatibility)
 *     - If any upstream cross-story task dependency is incomplete: 'blocked'
 *   - All in-progress tasks within the story are reset to 'not_started'
 *   - Completed tasks are preserved (not reset)
 *   - An attempt history record is updated with reason 'manual_unassignment'
 *   - Version field is incremented
 *   - Parent epic and project work statuses are re-derived
 *   - An audit event is logged with operator info and optional reason
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
import { NotFoundError, ConflictError, DomainErrorCode, storyUnassignSchema } from '@laila/shared';
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
 * Minimal story shape used for status evaluation during unassignment.
 * Contains only the fields accessed in the unassignment logic.
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
 * Minimal task shape used for status evaluation during unassignment.
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
// POST /api/v1/stories/:id/unassign -- Manually unassign a worker
// ---------------------------------------------------------------------------

/**
 * Manually unassigns a worker from an in-progress story after validating:
 * - The story exists and is in 'in_progress' status
 * - The request uses human auth (worker auth is rejected by withAuth)
 * - The confirmation field is explicitly set to true
 *
 * After unassignment:
 * - Story status is set to 'ready' (API: 'not_started') or 'blocked' based on DAG
 * - Worker assignment is cleared
 * - In-progress tasks are reset to 'not_started' (DB: 'pending')
 * - Completed tasks are preserved
 * - Attempt history record is updated with 'manual_unassignment' reason
 * - Parent epic and project work statuses are re-derived
 * - An audit event is logged with operator info
 *
 * Response: 200 with { data: { story: { ... }, task_resets: { ... } } }
 * Throws: 404 NotFoundError if story does not exist
 * Throws: 409 ConflictError with INVALID_STATUS_TRANSITION if story is not in_progress
 */
const handleUnassign = withErrorHandler(
  withAuth(
    'human',
    withValidation({ body: storyUnassignSchema, params: storyIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        // withAuth('human', ...) guarantees only human auth reaches here.
        const auth = (req as AuthenticatedRequest).auth as HumanAuthContext;
        const { id } = data.params as { id: string };
        const { reason } = data.body as { confirmation: true; reason?: string };

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

        // 2. Verify the story is in 'in_progress' status
        if (story.workStatus !== 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot unassign worker from story in "${story.workStatus}" status. Story must be in "in_progress" status to unassign.`,
          );
        }

        // 3. Capture the previous worker ID before clearing the assignment
        const previousWorkerId = story.assignedWorkerId;

        // 4. Capture task statuses before the unassignment to count resets
        //    accurately. The unassignStory transaction will reset in-progress
        //    tasks, so we need to know the pre-reset state.
        const storyTasks = await taskRepo.findByStory(auth.tenantId, id, {
          pagination: { page: 1, limit: 1000, sortBy: 'createdAt', sortOrder: 'asc' },
        });

        const tasks = storyTasks.data as unknown as TaskRecord[];
        let resetCount = 0;
        let preservedCount = 0;

        for (const task of tasks) {
          switch (task.workStatus) {
            case 'done':
              // Completed tasks will be preserved (not reset)
              preservedCount += 1;
              break;
            case 'in_progress':
              // In-progress tasks will be reset to not_started
              resetCount += 1;
              break;
            default:
              // Other statuses (pending, ready, blocked, failed) are not
              // counted as either reset or preserved for this operation
              break;
          }
        }

        // 5. Determine target status via DAG analysis
        //    Check if this story has any incomplete cross-story dependencies.
        //    If all upstream deps are complete: 'ready' (DB value for assignable stories)
        //    If any upstream dep is incomplete: 'blocked'
        const hasIncompleteUpstream = await storyRepo.hasIncompleteUpstreamDependencies(
          auth.tenantId,
          id,
        );
        const targetDbStatus = hasIncompleteUpstream ? 'blocked' : 'ready';

        // 6. Atomically unassign the story: clear worker assignment, set target
        //    status, increment version, reset in-progress tasks, and update
        //    attempt history. The unassignStory method handles all of this
        //    within a single transaction.
        const updatedRaw = await storyRepo.unassignStory(auth.tenantId, id, targetDbStatus, reason);
        const updated = updatedRaw as unknown as StoryRecord;

        // 7. Re-derive parent epic work status
        //    This updates the epic's status based on the aggregate of its
        //    child story statuses (including this newly-unassigned story).
        await epicRepo.computeDerivedStatus(auth.tenantId, story.epicId);

        // 8. Re-derive parent project work status
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

        // 9. Log audit event with operator info and optional reason
        await writeAuditEvent({
          entityType: 'user_story',
          entityId: id,
          action: 'unassigned',
          actorType: 'user',
          actorId: auth.userId,
          tenantId: auth.tenantId,
          changes: {
            before: { workStatus: 'in_progress' },
            after: { workStatus: targetDbStatus },
          },
          metadata: {
            previous_worker_id: previousWorkerId,
            new_status: mapStoryStatusToApi(targetDbStatus),
            reason: reason ?? 'No reason provided',
            reset_count: resetCount,
            preserved_count: preservedCount,
            previous_attempts: updated.attempts,
          },
        });

        // 10. Return response with API-level status names
        //     DB 'ready' -> API 'not_started', DB 'blocked' -> API 'blocked'
        res.status(200).json({
          data: {
            story: {
              id: updated.id,
              name: updated.title,
              status: mapStoryStatusToApi(updated.workStatus),
              previous_worker_id: previousWorkerId,
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
      return handleUnassign(req, res);
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
