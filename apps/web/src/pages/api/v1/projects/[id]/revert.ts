/**
 * API route for reverting a project (transitioning from Ready back to Draft).
 *
 * POST /api/v1/projects/:id/revert
 *
 * Pre-conditions:
 *   - Project must exist and belong to the authenticated tenant
 *   - Project must be in Ready lifecycle status
 *   - No user stories may be in-progress, completed (done), or failed
 *
 * Post-conditions:
 *   - Project lifecycleStatus changes back to 'draft'
 *   - Project updatedAt timestamp is refreshed
 *   - Editing is re-enabled on the project and its children
 *
 * Errors:
 *   - 404 PROJECT_NOT_FOUND if project does not exist
 *   - 409 INVALID_STATUS_TRANSITION if project is not in Ready
 *   - 409 STORY_IN_PROGRESS if any stories have started work
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import { createProjectRepository, createStoryRepository, getDb } from '@laila/database';
import { validateTransition, PROJECT_TRANSITIONS, type ProjectStatus } from '@laila/domain';
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

const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:id/revert
// ---------------------------------------------------------------------------

const handleRevert = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const storyRepo = createStoryRepository(db);

        // 1. Fetch the project
        const project = await projectRepo.findById(tenantId, id);
        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${id} not found`,
          );
        }

        // 2. Validate the domain transition: ready -> draft
        const currentStatus = String(project.lifecycleStatus);
        if (!(currentStatus in PROJECT_TRANSITIONS)) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Project has unrecognized lifecycle status '${currentStatus}'. Cannot transition to 'draft'.`,
          );
        }

        const transitionResult = validateTransition(
          PROJECT_TRANSITIONS,
          currentStatus as ProjectStatus,
          'draft' as ProjectStatus,
        );

        if (!transitionResult.valid) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            transitionResult.reason,
          );
        }

        // 3. Check for stories that have started or completed work
        const activeStories = await storyRepo.findActiveByProject(tenantId, id);

        if (activeStories.length > 0) {
          const storyDetails = activeStories.map((story) => ({
            id: story.id,
            title: story.title,
            workStatus: story.workStatus,
          }));

          throw new ConflictError(
            DomainErrorCode.STORY_IN_PROGRESS,
            `Cannot revert project: ${String(activeStories.length)} story(ies) have started or completed work`,
            { activeStories: storyDetails },
          );
        }

        // 4. Update project lifecycle status back to 'draft'
        const currentVersion = project.version as number;
        const updated = await projectRepo.update(
          tenantId,
          id,
          { lifecycleStatus: 'draft' },
          currentVersion,
        );

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
      return handleRevert(req, res);
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
