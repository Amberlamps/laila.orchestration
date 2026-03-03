/**
 * API route for listing a worker's project access grants.
 *
 * GET /api/v1/workers/:id/projects -- List all projects the worker has access to
 *
 * Requires human authentication. Workers cannot list their own project access
 * through this endpoint.
 *
 * The response includes the access grant records enriched with the current
 * assignment info (if the worker has an in-progress story in that project).
 */

import { createWorkerRepository, getDb, userStoriesTable, epicsTable } from '@laila/database';
import { NotFoundError, DomainErrorCode } from '@laila/shared';
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
 * Validates the `id` route parameter as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const workerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/workers/:id/projects -- List worker project access
// ---------------------------------------------------------------------------

/**
 * Returns all project access records for the specified worker, enriched with
 * the current assignment info per project.
 *
 * Each record includes:
 * - workerId, projectId, grantedAt (from worker_project_access)
 * - currentAssignment: { storyId, storyTitle } | null (from user_stories)
 *
 * Response: 200 with { data: EnrichedProjectAccess[] }
 * Throws: 404 NotFoundError with WORKER_NOT_FOUND if worker does not exist
 */
const handleList = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        // Verify worker exists before listing access
        const worker = await workerRepo.findById(tenantId, id);
        if (!worker) {
          throw new NotFoundError(
            DomainErrorCode.WORKER_NOT_FOUND,
            `Worker with id ${id} not found`,
          );
        }

        const accessRecords = await workerRepo.getProjectAccess(tenantId, id);

        // Fetch in-progress/assigned stories for this worker, grouped by project
        const assignedStories = await db
          .select({
            storyId: userStoriesTable.id,
            storyTitle: userStoriesTable.title,
            workStatus: userStoriesTable.workStatus,
            projectId: epicsTable.projectId,
          })
          .from(userStoriesTable)
          .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
          .where(
            and(
              eq(userStoriesTable.tenantId, tenantId),
              eq(userStoriesTable.assignedWorkerId, id),
              inArray(userStoriesTable.workStatus, ['in_progress', 'assigned']),
              isNull(userStoriesTable.deletedAt),
              isNull(epicsTable.deletedAt),
            ),
          );

        // Build a map of projectId -> current assignment
        const assignmentByProject = new Map<string, { storyId: string; storyTitle: string }>();
        for (const story of assignedStories) {
          // Use the first found story per project (worker typically has one active story per project)
          if (!assignmentByProject.has(story.projectId)) {
            assignmentByProject.set(story.projectId, {
              storyId: story.storyId,
              storyTitle: story.storyTitle,
            });
          }
        }

        // Enrich access records with current assignment info
        const enrichedRecords = accessRecords.map((record) => ({
          ...record,
          currentAssignment: assignmentByProject.get(record.projectId) ?? null,
        }));

        res.status(200).json({ data: enrichedRecords });
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
      return handleList(req, res);
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
