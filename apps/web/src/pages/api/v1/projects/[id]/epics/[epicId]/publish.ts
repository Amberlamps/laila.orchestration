/**
 * API route for publishing an epic (transitioning from Draft to Ready).
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/publish
 *
 * Pre-conditions:
 *   - Epic must exist and belong to the authenticated tenant
 *   - Epic must be in 'pending' workStatus (Draft editorial status)
 *   - Parent project must be in 'draft' lifecycle status
 *   - Epic must have at least one user story
 *   - All user stories must have workStatus === 'ready'
 *
 * Post-conditions:
 *   - Epic workStatus changes to 'ready'
 *   - Epic updatedAt timestamp is refreshed
 *
 * Errors:
 *   - 404 EPIC_NOT_FOUND if epic does not exist
 *   - 404 PROJECT_NOT_FOUND if parent project does not exist
 *   - 409 INVALID_STATUS_TRANSITION if epic is not in Draft or project is not in Draft
 *   - 400 VALIDATION_FAILED if no stories exist or any story is not Ready
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import {
  createProjectRepository,
  createEpicRepository,
  createStoryRepository,
  getDb,
  writeAuditEventFireAndForget,
  type UserStory,
} from '@laila/database';
import {
  validateTransition,
  EPIC_LIFECYCLE_TRANSITIONS,
  type EpicLifecycleStatus,
} from '@laila/domain';
import { NotFoundError, ConflictError, ValidationError, DomainErrorCode } from '@laila/shared';
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filters stories that are not in 'ready' workStatus and returns
 * structured details for the error response.
 */
const buildNonReadyStoryDetails = (
  stories: UserStory[],
): Array<{ id: string; title: string; workStatus: string }> => {
  return stories
    .filter((story) => story.workStatus !== 'ready')
    .map((story) => ({
      id: story.id,
      title: story.title,
      workStatus: story.workStatus,
    }));
};

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:projectId/epics/:epicId/publish
// ---------------------------------------------------------------------------

const handlePublish = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: epicParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
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

        // 2. Validate the domain transition: pending (Draft) -> ready (Ready)
        const currentStatus = epic.workStatus;
        if (!(currentStatus in EPIC_LIFECYCLE_TRANSITIONS)) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Epic has unrecognized lifecycle status '${currentStatus}'. Cannot transition to 'ready'.`,
          );
        }

        const transitionResult = validateTransition(
          EPIC_LIFECYCLE_TRANSITIONS,
          currentStatus as EpicLifecycleStatus,
          'ready' as EpicLifecycleStatus,
        );

        if (!transitionResult.valid) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            transitionResult.reason,
          );
        }

        // 3. Verify parent project exists and is in Draft status
        const project = await projectRepo.findById(tenantId, projectId);
        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${projectId} not found`,
          );
        }

        if (project.lifecycleStatus !== 'draft') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot publish epic: parent project is in '${project.lifecycleStatus}' status, expected 'draft'`,
          );
        }

        // 4. Fetch all stories for this epic
        const stories = await storyRepo.findAllByEpic(tenantId, epicId);

        // 5. Validate at least one story exists
        if (stories.length === 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            'Epic must have at least one user story before publishing',
            { reason: 'NO_STORIES' },
          );
        }

        // 6. Validate all stories are in 'ready' workStatus
        const nonReadyStories = buildNonReadyStoryDetails(stories);

        if (nonReadyStories.length > 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            `Cannot publish epic: ${String(nonReadyStories.length)} story(ies) are not in Ready status`,
            { nonReadyStories },
          );
        }

        // 7. Bump version and updatedAt to record the publish validation.
        //    The workStatus is derived at read time from child story statuses,
        //    so we do not set it directly here. Since all stories are 'ready',
        //    the derived workStatus will be 'ready'.
        const currentVersion = epic.version;
        const updated = await epicRepo.update(tenantId, epicId, {}, currentVersion);

        const auth = (req as AuthenticatedRequest).auth;
        writeAuditEventFireAndForget({
          entityType: 'epic',
          entityId: epicId,
          action: 'status_changed',
          actorType: auth.type === 'human' ? 'user' : 'worker',
          actorId: auth.type === 'human' ? auth.userId : auth.workerId,
          tenantId,
          projectId,
          details: `Epic "${epic.name}" published (${currentStatus} → ready)`,
          changes: {
            before: { workStatus: currentStatus },
            after: { workStatus: 'ready' },
          },
          metadata: {
            oldStatus: currentStatus,
            newStatus: 'ready',
            epicName: epic.name,
            projectId,
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

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'POST':
      return handlePublish(req, res);
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
