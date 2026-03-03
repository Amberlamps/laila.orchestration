/**
 * API route for fetching aggregate counts for an epic.
 *
 * GET /api/v1/projects/:projectId/epics/:epicId/counts
 *
 * Returns authoritative aggregate data for a single epic:
 *   - totalStories: total number of non-deleted stories
 *   - totalTasks: total number of non-deleted tasks across all stories
 *   - hasInProgressWork: whether any story is in_progress or review status
 *
 * This endpoint provides the complete, non-paginated aggregates needed
 * for delete confirmation dialogs and in-progress work guards.
 *
 * Errors:
 *   - 404 EPIC_NOT_FOUND if epic does not exist or doesn't belong to the project
 *   - 405 METHOD_NOT_ALLOWED for non-GET methods
 *
 * Requires human authentication via Better Auth session.
 */

import { createEpicRepository, createStoryRepository, getDb } from '@laila/database';
import { NotFoundError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const epicParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:projectId/epics/:epicId/counts
// ---------------------------------------------------------------------------

const handleGetCounts = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: epicParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId } = data.params;

        const db = getDb();
        const epicRepo = createEpicRepository(db);
        const storyRepo = createStoryRepository(db);

        // 1. Fetch the epic and verify it belongs to the project
        const epic = await epicRepo.findById(tenantId, epicId);
        if (!epic || epic.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        // 2. Fetch all stories for this epic (non-paginated)
        const stories = await storyRepo.findAllByEpic(tenantId, epicId);

        // 3. Compute hasInProgressWork from story statuses
        const inProgressStatuses = ['in_progress', 'review'];
        const hasInProgressWork = stories.some((story) =>
          inProgressStatuses.includes(story.workStatus),
        );

        // 4. Compute total task count across all stories
        let totalTasks = 0;
        for (const story of stories) {
          const storyWithTasks = await storyRepo.findWithTaskCount(tenantId, story.id);
          if (storyWithTasks) {
            totalTasks += storyWithTasks.taskCount;
          }
        }

        res.status(200).json({
          data: {
            totalStories: stories.length,
            totalTasks,
            hasInProgressWork,
          },
        });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'GET':
      return handleGetCounts(req, res);
    default:
      res.setHeader('Allow', 'GET');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
