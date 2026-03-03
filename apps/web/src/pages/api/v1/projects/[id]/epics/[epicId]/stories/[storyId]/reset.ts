/**
 * API route for resetting a failed story back to not_started or blocked.
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:storyId/reset
 *
 * Pre-conditions:
 *   - Story must exist and belong to the authenticated tenant
 *   - Story must be in 'failed' workStatus
 *   - Epic must belong to the specified project
 *   - Only human auth (worker auth rejected with 403)
 *
 * Post-conditions:
 *   - Story status changes to not_started or blocked (DAG-determined)
 *   - Assigned worker is cleared
 *   - Previous attempt is logged in attempt history
 *   - Story re-enters the assignment pool
 *
 * The DAG determines the new status:
 *   - If all upstream dependencies are complete: not_started
 *   - If any upstream dependency is incomplete: blocked
 *
 * Errors:
 *   - 404 STORY_NOT_FOUND if story does not exist
 *   - 404 EPIC_NOT_FOUND if epic does not exist or wrong project
 *   - 409 INVALID_STATUS_TRANSITION if story is not in 'failed' status
 *   - 403 FORBIDDEN for worker auth
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import { createEpicRepository, createStoryRepository, getDb } from '@laila/database';
import { NotFoundError, ConflictError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const storyResetParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
  storyId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

const handleReset = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: storyResetParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId, storyId } = data.params;

        const db = getDb();
        const epicRepo = createEpicRepository(db);
        const storyRepo = createStoryRepository(db);

        // Verify epic belongs to the project
        const epic = await epicRepo.findById(tenantId, epicId);
        if (!epic || epic.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        // 1. Fetch the story and verify it belongs to the epic
        const story = await storyRepo.findById(tenantId, storyId);
        if (!story || story.epicId !== epicId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        // 2. Validate the story is in 'failed' status
        if (story.workStatus !== 'failed') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot reset story: current status is '${String(story.workStatus)}', expected 'failed'`,
          );
        }

        // 3. Determine target status using DAG dependency analysis
        const hasIncomplete = await storyRepo.hasIncompleteUpstreamDependencies(tenantId, storyId);
        const targetStatus = hasIncomplete ? 'blocked' : 'not_started';

        // 4. Reset the story atomically
        const updated = await storyRepo.resetStory(tenantId, storyId, targetStatus);

        res.status(200).json({ data: updated });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

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
