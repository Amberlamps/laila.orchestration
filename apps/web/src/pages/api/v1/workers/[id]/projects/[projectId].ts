/**
 * API routes for managing a single worker-project access grant.
 *
 * POST   /api/v1/workers/:id/projects/:projectId -- Grant project access (idempotent)
 * DELETE /api/v1/workers/:id/projects/:projectId -- Revoke project access
 *
 * All routes require human authentication. Only humans can manage worker
 * project access; workers cannot grant or revoke their own access.
 *
 * BUSINESS RULES:
 * - Grant is idempotent: re-granting an existing access returns 200 with
 *   the existing record, not an error.
 * - Revoke checks for in-progress work: if the worker has assigned or
 *   in-progress stories in the target project, a 409 ASSIGNMENT_CONFLICT
 *   is returned. The human must unassign the stories first.
 */

import {
  createWorkerRepository,
  createProjectRepository,
  getDb,
  userStoriesTable,
  epicsTable,
} from '@laila/database';
import { NotFoundError, ConflictError, DomainErrorCode } from '@laila/shared';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

/**
 * Validates both `id` (worker UUID) and `projectId` (project UUID) route
 * parameters. Next.js Pages Router puts dynamic route params into `req.query`.
 */
const workerProjectParamsSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates that both the worker and project exist within the tenant scope.
 * Throws NotFoundError with the appropriate domain error code if either
 * entity is missing.
 */
const validateWorkerAndProjectExist = async (
  tenantId: string,
  workerId: string,
  projectId: string,
): Promise<void> => {
  const db = getDb();
  const workerRepo = createWorkerRepository(db);
  const projectRepo = createProjectRepository(db);

  const [worker, project] = await Promise.all([
    workerRepo.findById(tenantId, workerId),
    projectRepo.findById(tenantId, projectId),
  ]);

  if (!worker) {
    throw new NotFoundError(
      DomainErrorCode.WORKER_NOT_FOUND,
      `Worker with id ${workerId} not found`,
    );
  }

  if (!project) {
    throw new NotFoundError(
      DomainErrorCode.PROJECT_NOT_FOUND,
      `Project with id ${projectId} not found`,
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/v1/workers/:id/projects/:projectId -- Grant project access
// ---------------------------------------------------------------------------

/**
 * Grants a worker access to a specific project.
 *
 * The grant is idempotent: if the worker already has access to the project,
 * the existing access record is returned with a 200 status instead of
 * creating a duplicate or returning an error. This simplifies client logic
 * since clients can call grant without checking existing access first.
 *
 * Pre-conditions:
 *   - Worker must exist in the tenant
 *   - Project must exist in the tenant
 *
 * Response: 200 with { data: WorkerProjectAccess }
 * Throws: 404 NotFoundError if worker or project does not exist
 */
const handleGrant = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerProjectParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: workerId, projectId } = data.params;

        await validateWorkerAndProjectExist(tenantId, workerId, projectId);

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        // Check if access already exists (idempotent grant)
        const existingRecords = await workerRepo.getProjectAccess(tenantId, workerId);
        const existing = existingRecords.find((record) => record.projectId === projectId);

        if (existing) {
          res.status(200).json({ data: existing });
          return;
        }

        const accessRecord = await workerRepo.grantProjectAccess(tenantId, workerId, projectId);
        res.status(200).json({ data: accessRecord });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/workers/:id/projects/:projectId -- Revoke project access
// ---------------------------------------------------------------------------

/** Query schema for the DELETE endpoint — optional force parameter. */
const revokeQuerySchema = z.object({
  force: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

/**
 * Revokes a worker's access to a specific project.
 *
 * Before revoking, checks if the worker has in-progress or assigned stories
 * that belong to the target project (via the epic -> project chain). If such
 * stories exist and force is not set, the revoke is blocked with a 409
 * ASSIGNMENT_CONFLICT. Pass ?force=true to unassign all stories in the
 * project before revoking access.
 *
 * Query parameters:
 *   - force (optional, default: false) -- unassign stories and force revocation
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if worker or project does not exist
 * Throws: 409 ConflictError with ASSIGNMENT_CONFLICT if worker has in-progress work
 */
const handleRevoke = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerProjectParamsSchema, query: revokeQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: workerId, projectId } = data.params;
        const { force } = data.query;

        await validateWorkerAndProjectExist(tenantId, workerId, projectId);

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        // Check for in-progress stories in the target project.
        // Stories belong to epics, and epics belong to projects. We need to
        // find stories assigned to this worker that are in an active state
        // AND belong to epics within the target project.
        const inProgressStoriesInProject = await db
          .select({
            id: userStoriesTable.id,
            title: userStoriesTable.title,
            workStatus: userStoriesTable.workStatus,
          })
          .from(userStoriesTable)
          .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
          .where(
            and(
              eq(userStoriesTable.tenantId, tenantId),
              eq(userStoriesTable.assignedWorkerId, workerId),
              eq(epicsTable.projectId, projectId),
              inArray(userStoriesTable.workStatus, ['in_progress', 'assigned']),
              isNull(userStoriesTable.deletedAt),
              isNull(epicsTable.deletedAt),
            ),
          );

        if (inProgressStoriesInProject.length > 0 && !force) {
          throw new ConflictError(
            DomainErrorCode.ASSIGNMENT_CONFLICT,
            `Cannot revoke project access: worker ${workerId} has ` +
              `${String(inProgressStoriesInProject.length)} in-progress story assignment(s) ` +
              `in project ${projectId}. Use ?force=true to unassign stories and revoke access.`,
            {
              inProgressStories: inProgressStoriesInProject.map((story) => ({
                id: story.id,
                title: story.title,
                workStatus: story.workStatus,
              })),
            },
          );
        }

        // If force=true and there are in-progress stories, unassign them first
        if (inProgressStoriesInProject.length > 0 && force) {
          await db
            .update(userStoriesTable)
            .set({
              assignedWorkerId: null,
              assignedAt: null,
              workStatus: 'pending',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userStoriesTable.tenantId, tenantId),
                eq(userStoriesTable.assignedWorkerId, workerId),
                inArray(
                  userStoriesTable.id,
                  inProgressStoriesInProject.map((s) => s.id),
                ),
              ),
            );
        }

        const revoked = await workerRepo.revokeProjectAccess(tenantId, workerId, projectId);

        if (!revoked) {
          throw new NotFoundError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            `Worker ${workerId} does not have access to project ${projectId}`,
          );
        }

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
    case 'POST':
      return handleGrant(req, res);
    case 'DELETE':
      return handleRevoke(req, res);
    default:
      res.setHeader('Allow', 'POST, DELETE');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
