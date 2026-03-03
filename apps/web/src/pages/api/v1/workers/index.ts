/**
 * API routes for the Worker collection.
 *
 * POST /api/v1/workers  -- Create a new worker with a cryptographically secure API key
 * GET  /api/v1/workers  -- List workers with pagination (api_key_prefix only, never full key)
 *
 * All routes require human authentication. Only humans can manage workers;
 * workers cannot create or list other workers.
 *
 * SECURITY NOTES:
 * - The API key is returned in plain text ONLY in the POST creation response (one-time reveal).
 * - The API key is stored as a SHA-256 hash in the database. It cannot be recovered.
 * - The api_key_prefix (first 12 chars) is stored for O(1) lookup during authentication.
 * - The api_key_hash is NEVER included in any API response.
 */

import {
  createWorkerRepository,
  getDb,
  type FindWorkersOptions,
  type Worker,
} from '@laila/database';
import { createWorkerSchema, listWorkersQuerySchema, type ListWorkersQuery } from '@laila/shared';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Response helpers -- strip sensitive fields from worker records
// ---------------------------------------------------------------------------

/**
 * Strips the api_key_hash from a worker record for safe API response.
 * The hash must NEVER be exposed in any response -- only the prefix.
 */
const sanitizeWorker = (worker: Worker) => ({
  id: worker.id,
  tenantId: worker.tenantId,
  name: worker.name,
  description: worker.description,
  apiKeyPrefix: worker.apiKeyPrefix,
  isActive: worker.isActive,
  lastSeenAt: worker.lastSeenAt,
  createdAt: worker.createdAt,
  updatedAt: worker.updatedAt,
});

// ---------------------------------------------------------------------------
// POST /api/v1/workers -- Create a new worker
// ---------------------------------------------------------------------------

/**
 * Creates a new worker with a freshly generated API key.
 *
 * The raw API key is included in the response for one-time reveal.
 * After this response, the key cannot be retrieved -- only its hash
 * and prefix are stored in the database.
 *
 * Request body: { name: string, description?: string | null }
 * Response: 201 with { data: { ...worker, api_key: string } }
 */
const handleCreate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ body: createWorkerSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { body } = data;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        const { worker, rawApiKey } = await workerRepo.create(tenantId, {
          name: body.name,
          description: body.description ?? undefined,
        });

        // Return the sanitized worker WITH the one-time plaintext API key
        res.status(201).json({
          data: {
            ...sanitizeWorker(worker),
            api_key: rawApiKey,
          },
        });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// GET /api/v1/workers -- List workers
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of workers for the authenticated tenant.
 *
 * Workers are returned with api_key_prefix only -- the full key hash
 * is never exposed. Supports optional isActive filter.
 *
 * Query parameters:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - sortBy (default: 'createdAt')
 * - sortOrder (default: 'desc')
 * - isActive (optional boolean filter)
 *
 * Response: 200 with { data: Worker[], pagination: PaginationMeta }
 */
const handleList = withErrorHandler(
  withAuth(
    'human',
    withValidation({ query: listWorkersQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const query = data.query as ListWorkersQuery;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        const options: FindWorkersOptions = {
          pagination: {
            page: query.page,
            limit: query.limit,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        };

        if (query.isActive !== undefined) {
          options.isActive = query.isActive;
        }

        const result = await workerRepo.findByTenant(tenantId, options);

        // Strip api_key_hash from every worker in the response
        res.status(200).json({
          data: result.data.map(sanitizeWorker),
          pagination: result.pagination,
        });
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
      return handleCreate(req, res);
    case 'GET':
      return handleList(req, res);
    default:
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
