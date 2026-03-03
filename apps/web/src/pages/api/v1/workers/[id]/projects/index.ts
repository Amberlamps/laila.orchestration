/**
 * API route for listing a worker's project access grants.
 *
 * GET /api/v1/workers/:id/projects -- List all projects the worker has access to
 *
 * Requires human authentication. Workers cannot list their own project access
 * through this endpoint.
 *
 * The response includes the access grant records from the worker_project_access
 * join table, each containing the worker_id, project_id, and granted_at timestamp.
 */

import { createWorkerRepository, getDb } from '@laila/database';
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
 * Returns all project access records for the specified worker.
 *
 * Validates that the worker exists before querying access records.
 * Returns an empty array if the worker has no project access grants.
 *
 * Response: 200 with { data: WorkerProjectAccess[] }
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

        res.status(200).json({ data: accessRecords });
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
