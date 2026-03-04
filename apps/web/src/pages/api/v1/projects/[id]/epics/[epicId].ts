/**
 * API routes for a single Epic resource within a project.
 *
 * GET    /api/v1/projects/:projectId/epics/:epicId -- Get epic detail with summary statistics
 * PATCH  /api/v1/projects/:projectId/epics/:epicId -- Update epic fields (Draft project only)
 * DELETE /api/v1/projects/:projectId/epics/:epicId -- Soft-delete epic with cascade
 *
 * All routes require human authentication via Better Auth session.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import {
  createEpicRepository,
  createProjectRepository,
  getDb,
  writeAuditEventFireAndForget,
} from '@laila/database';
import { updateEpicSchema, NotFoundError, ConflictError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Shared param schema for route parameter validation
// ---------------------------------------------------------------------------

/**
 * Validates both `id` (projectId) and `epicId` route parameters as UUIDs.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const epicParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:projectId/epics/:epicId -- Get epic detail
// ---------------------------------------------------------------------------

/**
 * Returns a single epic with summary statistics:
 * - Story counts grouped by work status
 * - Derived work status
 *
 * Response: 200 with { data: EpicWithStoryCounts }
 * Throws: 404 NotFoundError with EPIC_NOT_FOUND if epic does not exist or is soft-deleted
 */
const handleGetDetail = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: epicParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId } = data.params;

        const db = getDb();
        const epicRepo = createEpicRepository(db);

        const epic = await epicRepo.findWithStoryCounts(tenantId, epicId);
        if (!epic || epic.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        res.status(200).json({ data: epic });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/projects/:projectId/epics/:epicId -- Update epic
// ---------------------------------------------------------------------------

/**
 * Updates allowed epic fields. Only permitted when the parent project
 * is in Draft lifecycle status.
 *
 * Request body: { name?, description?, sortOrder?, version (required for optimistic locking) }
 * Response: 200 with { data: Epic }
 * Throws: 404 NotFoundError if project or epic does not exist
 * Throws: 409 ConflictError with READ_ONLY_VIOLATION if parent project is not in Draft
 * Throws: 409 ConflictError with OPTIMISTIC_LOCK_CONFLICT on version mismatch
 */
const handleUpdate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: epicParamsSchema, body: updateEpicSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId } = data.params;
        const body = data.body;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const epicRepo = createEpicRepository(db);

        // Verify the parent project exists
        const project = await projectRepo.findById(tenantId, projectId);
        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${projectId} not found`,
          );
        }

        // Only allow updates when parent project is in Draft status
        if (project.lifecycleStatus !== 'draft') {
          throw new ConflictError(
            DomainErrorCode.READ_ONLY_VIOLATION,
            `Epic cannot be modified because parent project is in '${project.lifecycleStatus}' status. Only projects in 'draft' status allow epic updates.`,
          );
        }

        // Verify the epic exists and belongs to the project
        const existing = await epicRepo.findById(tenantId, epicId);
        if (!existing || existing.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        // Build the update payload, only including fields that were provided
        const { version } = body;
        const updateData: Partial<{ name: string; description: string | null; sortOrder: number }> =
          {};

        if (body.name !== undefined) {
          updateData.name = body.name;
        }
        if (body.description !== undefined) {
          updateData.description = body.description;
        }
        if (body.sortOrder !== undefined) {
          updateData.sortOrder = body.sortOrder;
        }

        try {
          const updated = await epicRepo.update(tenantId, epicId, updateData, version);

          const auth = (req as AuthenticatedRequest).auth;
          const changedFields = Object.keys(updateData);
          writeAuditEventFireAndForget({
            entityType: 'epic',
            entityId: epicId,
            action: 'updated',
            actorType: auth.type === 'human' ? 'user' : 'worker',
            actorId: auth.type === 'human' ? auth.userId : auth.workerId,
            tenantId,
            projectId,
            details: `Epic "${updated.name}" updated (${changedFields.join(', ')})`,
            metadata: {
              changedFields,
              epicName: updated.name,
              projectId,
            },
          });

          res.status(200).json({ data: updated });
        } catch (error: unknown) {
          // Map repository ConflictError to HTTP ConflictError with domain code
          if (error instanceof Error && error.name === 'ConflictError') {
            throw new ConflictError(
              DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
              `Epic ${epicId} has been modified by another request. Please retry with the latest version.`,
            );
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/projects/:projectId/epics/:epicId -- Soft-delete epic
// ---------------------------------------------------------------------------

/**
 * Soft-deletes an epic and cascades to child stories and tasks.
 * Sets deleted_at timestamp on the epic and all children within
 * a single transaction. Also cleans up dependency edges referencing
 * tasks within the deleted epic.
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if epic does not exist
 */
const handleDelete = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: epicParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId } = data.params;

        const db = getDb();
        const epicRepo = createEpicRepository(db);

        // Verify the epic exists and belongs to the project before deleting
        const existing = await epicRepo.findById(tenantId, epicId);
        if (!existing || existing.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        await epicRepo.softDelete(tenantId, epicId);

        const auth = (req as AuthenticatedRequest).auth;
        writeAuditEventFireAndForget({
          entityType: 'epic',
          entityId: epicId,
          action: 'deleted',
          actorType: auth.type === 'human' ? 'user' : 'worker',
          actorId: auth.type === 'human' ? auth.userId : auth.workerId,
          tenantId,
          projectId,
          details: `Epic "${existing.name}" deleted`,
          changes: {
            before: { name: existing.name },
          },
          metadata: { epicName: existing.name, projectId },
        });

        res.status(204).end();
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

/**
 * Next.js Pages Router API handler that dispatches to the correct handler
 * based on the HTTP method.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'GET':
      return handleGetDetail(req, res);
    case 'PATCH':
      return handleUpdate(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      res.setHeader('Allow', 'GET, PATCH, DELETE');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
