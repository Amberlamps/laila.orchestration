/**
 * API routes for a single Project resource.
 *
 * GET    /api/v1/projects/:id -- Get project detail with summary statistics
 * PATCH  /api/v1/projects/:id -- Update project fields (Draft status only)
 * DELETE /api/v1/projects/:id -- Hard-delete project with cascade
 *
 * All routes require human authentication via Better Auth session.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import { createProjectRepository, getDb } from '@laila/database';
import { updateProjectSchema, NotFoundError, ConflictError, DomainErrorCode } from '@laila/shared';
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
 * Validates the `id` route parameter as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:id -- Get project detail
// ---------------------------------------------------------------------------

/**
 * Returns a single project with summary statistics:
 * - Epic counts grouped by work status
 * - Story counts grouped by work status
 * - Total epic and story counts
 * - Completion percentage (done + skipped stories / total stories)
 *
 * Response: 200 with { data: ProjectWithStats }
 * Throws: 404 NotFoundError with PROJECT_NOT_FOUND if project does not exist
 */
const handleGetDetail = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);

        try {
          const project = await projectRepo.findWithStats(tenantId, id);
          res.status(200).json({ data: project });
        } catch (error: unknown) {
          // Map repository NotFoundError to HTTP NotFoundError with domain code
          if (error instanceof Error && error.name === 'NotFoundError') {
            throw new NotFoundError(
              DomainErrorCode.PROJECT_NOT_FOUND,
              `Project with id ${id} not found`,
            );
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/projects/:id -- Update project
// ---------------------------------------------------------------------------

/**
 * Updates allowed project fields. Only permitted when the project is
 * in Draft lifecycle status.
 *
 * Request body: { name?, description?, version (required for optimistic locking) }
 * Response: 200 with { data: Project }
 * Throws: 404 NotFoundError if project does not exist
 * Throws: 409 ConflictError with READ_ONLY_VIOLATION if project is not in Draft
 * Throws: 409 ConflictError with OPTIMISTIC_LOCK_CONFLICT on version mismatch
 */
const handleUpdate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema, body: updateProjectSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;
        const body = data.body;

        const db = getDb();
        const projectRepo = createProjectRepository(db);

        // Fetch the current project to check lifecycle status
        const existing = await projectRepo.findById(tenantId, id);
        if (!existing) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${id} not found`,
          );
        }

        // Only allow updates when project is in Draft status
        if (existing.lifecycleStatus !== 'draft') {
          throw new ConflictError(
            DomainErrorCode.READ_ONLY_VIOLATION,
            `Project cannot be modified in '${String(existing.lifecycleStatus)}' status. Only projects in 'draft' status can be updated.`,
          );
        }

        // Build the update payload, only including fields that were provided
        const { version } = body;
        const updateData: Record<string, string | null> = {};

        if (body.name !== undefined) {
          updateData.name = body.name;
        }
        if (body.description !== undefined) {
          updateData.description = body.description;
        }

        try {
          const updated = await projectRepo.update(tenantId, id, updateData, version);
          res.status(200).json({ data: updated });
        } catch (error: unknown) {
          // Map repository ConflictError to HTTP ConflictError with domain code
          if (error instanceof Error && error.name === 'ConflictError') {
            throw new ConflictError(
              DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
              `Project ${id} has been modified by another request. Please retry with the latest version.`,
            );
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/projects/:id -- Hard-delete project with cascade
// ---------------------------------------------------------------------------

/**
 * Hard-deletes a project and all child entities (epics, stories, tasks,
 * dependency edges) in a single transaction.
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if project does not exist
 */
const handleDelete = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);

        try {
          await projectRepo.hardDeleteCascade(tenantId, id);
          res.status(204).end();
        } catch (error: unknown) {
          // Map repository NotFoundError to HTTP NotFoundError with domain code
          if (error instanceof Error && error.name === 'NotFoundError') {
            throw new NotFoundError(
              DomainErrorCode.PROJECT_NOT_FOUND,
              `Project with id ${id} not found`,
            );
          }
          throw error;
        }
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
