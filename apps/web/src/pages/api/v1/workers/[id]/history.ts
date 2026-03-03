/**
 * API route for listing a worker's work history (attempt history).
 *
 * GET /api/v1/workers/:id/history -- List all assignment attempts for a worker
 *
 * Requires human authentication. Returns attempt_history records joined with
 * user story titles and project names for display.
 *
 * Ordered by started_at descending (most recent first).
 */

import {
  attemptHistoryTable,
  userStoriesTable,
  epicsTable,
  projectsTable,
  createWorkerRepository,
  getDb,
} from '@laila/database';
import { NotFoundError, DomainErrorCode } from '@laila/shared';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const workerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/workers/:id/history -- List worker attempt history
// ---------------------------------------------------------------------------

const handleList = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        // Verify worker exists
        const worker = await workerRepo.findById(tenantId, id);
        if (!worker) {
          throw new NotFoundError(
            DomainErrorCode.WORKER_NOT_FOUND,
            `Worker with id ${id} not found`,
          );
        }

        // Query attempt history joined with story + epic + project
        const results = await db
          .select({
            id: attemptHistoryTable.id,
            storyId: attemptHistoryTable.userStoryId,
            storyTitle: userStoriesTable.title,
            projectId: projectsTable.id,
            projectName: projectsTable.name,
            status: attemptHistoryTable.status,
            startedAt: attemptHistoryTable.startedAt,
            completedAt: attemptHistoryTable.completedAt,
            durationMs: attemptHistoryTable.durationMs,
            cost: attemptHistoryTable.cost,
          })
          .from(attemptHistoryTable)
          .innerJoin(userStoriesTable, eq(attemptHistoryTable.userStoryId, userStoriesTable.id))
          .innerJoin(epicsTable, eq(userStoriesTable.epicId, epicsTable.id))
          .innerJoin(projectsTable, eq(epicsTable.projectId, projectsTable.id))
          .where(
            and(
              eq(attemptHistoryTable.tenantId, tenantId),
              eq(attemptHistoryTable.workerId, id),
              isNull(userStoriesTable.deletedAt),
              isNull(epicsTable.deletedAt),
              isNull(projectsTable.deletedAt),
            ),
          )
          .orderBy(desc(attemptHistoryTable.startedAt));

        res.status(200).json({ data: results });
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
