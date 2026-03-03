/**
 * API route for manually unassigning a worker from an in-progress story.
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:storyId/unassign
 *
 * Pre-conditions:
 *   - Story must exist and belong to the authenticated tenant
 *   - Story must be in 'in_progress' workStatus (has an assigned worker)
 *   - Epic must belong to the specified project
 *   - Only human auth (worker auth rejected with 403)
 *   - Body must include { confirmation: true } (explicit confirmation required)
 *
 * Post-conditions:
 *   - Worker assignment is cleared
 *   - Story status changes to not_started or blocked (DAG-determined)
 *   - All in-progress tasks within the story are reset to not_started
 *   - Previous attempt is logged with reason "manual_unassignment"
 *   - Story re-enters the assignment pool
 *
 * Errors:
 *   - 404 STORY_NOT_FOUND if story does not exist
 *   - 404 EPIC_NOT_FOUND if epic does not exist or wrong project
 *   - 409 INVALID_STATUS_TRANSITION if story is not in 'in_progress' status
 *   - 400 VALIDATION_FAILED if confirmation is not true
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
// Schemas
// ---------------------------------------------------------------------------

const storyUnassignParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
  storyId: z.string().uuid(),
});

const storyUnassignBodySchema = z.object({
  confirmation: z.literal(true),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

const handleUnassign = withErrorHandler(
  withAuth(
    'human',
    withValidation({
      params: storyUnassignParamsSchema,
      body: storyUnassignBodySchema,
    })(async (req: NextApiRequest, res: NextApiResponse, data) => {
      const { tenantId } = (req as AuthenticatedRequest).auth;
      const { id: projectId, epicId, storyId } = data.params;

      const db = getDb();
      const epicRepo = createEpicRepository(db);
      const storyRepo = createStoryRepository(db);

      // Verify epic belongs to the project
      const epic = await epicRepo.findById(tenantId, epicId);
      if (!epic || epic.projectId !== projectId) {
        throw new NotFoundError(DomainErrorCode.EPIC_NOT_FOUND, `Epic with id ${epicId} not found`);
      }

      // 1. Fetch the story and verify it belongs to the epic
      const story = await storyRepo.findById(tenantId, storyId);
      if (!story || story.epicId !== epicId) {
        throw new NotFoundError(
          DomainErrorCode.STORY_NOT_FOUND,
          `Story with id ${storyId} not found`,
        );
      }

      // 2. Validate the story is in 'in_progress' status
      if (story.workStatus !== 'in_progress') {
        throw new ConflictError(
          DomainErrorCode.INVALID_STATUS_TRANSITION,
          `Cannot unassign story: current status is '${String(story.workStatus)}', expected 'in_progress'`,
        );
      }

      // 3. Determine target status using DAG dependency analysis
      const hasIncomplete = await storyRepo.hasIncompleteUpstreamDependencies(tenantId, storyId);
      const targetStatus = hasIncomplete ? 'blocked' : 'not_started';

      // 4. Unassign the story atomically (clears worker, resets tasks, logs attempt)
      const updated = await storyRepo.unassignStory(tenantId, storyId, targetStatus);

      res.status(200).json({ data: updated });
    }),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

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
