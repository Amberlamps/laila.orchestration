/**
 * API route for publishing a project (transitioning from Draft to Ready).
 *
 * POST /api/v1/projects/:id/publish
 *
 * Pre-conditions:
 *   - Project must exist and belong to the authenticated tenant
 *   - Project must be in Draft lifecycle status
 *   - Project must have at least one epic
 *   - All epics must have workStatus === 'ready'
 *
 * Post-conditions:
 *   - Project lifecycleStatus changes to 'ready'
 *   - Project updatedAt timestamp is refreshed
 *
 * Errors:
 *   - 404 PROJECT_NOT_FOUND if project does not exist
 *   - 409 INVALID_STATUS_TRANSITION if project is not in Draft
 *   - 400 VALIDATION_FAILED if no epics exist or any epic is not Ready
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import {
  createProjectRepository,
  createEpicRepository,
  getDb,
  writeAuditEventFireAndForget,
  type EpicRecord,
} from '@laila/database';
import { validateTransition, PROJECT_TRANSITIONS, type ProjectStatus } from '@laila/domain';
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

const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filters epics that are not in 'ready' workStatus and returns
 * structured details for the error response.
 */
const buildNonReadyEpicDetails = (
  epics: EpicRecord[],
): Array<{ id: string; name: string; workStatus: string }> => {
  return epics
    .filter((epic) => epic.workStatus !== 'ready')
    .map((epic) => ({
      id: epic.id,
      name: epic.name,
      workStatus: epic.workStatus,
    }));
};

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:id/publish
// ---------------------------------------------------------------------------

const handlePublish = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const epicRepo = createEpicRepository(db);

        // 1. Fetch the project
        const project = await projectRepo.findById(tenantId, id);
        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${id} not found`,
          );
        }

        // 2. Validate the domain transition: draft -> ready
        const currentStatus = project.lifecycleStatus;
        if (!(currentStatus in PROJECT_TRANSITIONS)) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Project has unrecognized lifecycle status '${currentStatus}'. Cannot transition to 'ready'.`,
          );
        }

        const transitionResult = validateTransition(
          PROJECT_TRANSITIONS,
          currentStatus as ProjectStatus,
          'ready' as ProjectStatus,
        );

        if (!transitionResult.valid) {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            transitionResult.reason,
          );
        }

        // 3. Fetch all epics for this project
        const epics = await epicRepo.findAllByProject(tenantId, id);

        // 4. Validate at least one epic exists
        if (epics.length === 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            'Project must have at least one epic before publishing',
            { reason: 'NO_EPICS' },
          );
        }

        // 5. Validate all epics are in 'ready' workStatus
        const nonReadyEpics = buildNonReadyEpicDetails(epics);

        if (nonReadyEpics.length > 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            `Cannot publish project: ${String(nonReadyEpics.length)} epic(s) are not in Ready status`,
            { nonReadyEpics },
          );
        }

        // 6. Update project lifecycle status to 'ready'
        const currentVersion = project.version;
        const updated = await projectRepo.update(
          tenantId,
          id,
          { lifecycleStatus: 'ready' },
          currentVersion,
        );

        const auth = (req as AuthenticatedRequest).auth;
        writeAuditEventFireAndForget({
          entityType: 'project',
          entityId: id,
          action: 'status_changed',
          actorType: auth.type === 'human' ? 'user' : 'worker',
          actorId: auth.type === 'human' ? auth.userId : auth.workerId,
          tenantId,
          projectId: id,
          details: `Project "${project.name}" published (${currentStatus} → ready)`,
          changes: {
            before: { lifecycleStatus: currentStatus },
            after: { lifecycleStatus: 'ready' },
          },
          metadata: {
            oldStatus: currentStatus,
            newStatus: 'ready',
            projectName: project.name,
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
