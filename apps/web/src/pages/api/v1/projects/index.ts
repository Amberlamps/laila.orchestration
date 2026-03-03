/**
 * API routes for the Project collection.
 *
 * POST /api/v1/projects  -- Create a new project in Draft status
 * GET  /api/v1/projects  -- List projects with pagination, filtering, and sorting
 *
 * All routes require human authentication via Better Auth session.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import { createProjectRepository, getDb, type FindProjectsOptions } from '@laila/database';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  type ListProjectsQuery,
} from '@laila/shared';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// POST /api/v1/projects -- Create a new project
// ---------------------------------------------------------------------------

/**
 * Creates a new project in Draft status for the authenticated user.
 *
 * Request body: { name: string, description?: string | null, lifecycleStatus?: string }
 * Response: 201 with { data: Project }
 */
const handleCreate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ body: createProjectSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { body } = data;

        const db = getDb();
        const projectRepo = createProjectRepository(db);

        const project = await projectRepo.create(tenantId, {
          name: body.name,
          description: body.description,
          workerInactivityTimeoutMinutes: body.workerInactivityTimeoutMinutes,
        });

        res.status(201).json({ data: project });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// GET /api/v1/projects -- List projects
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of projects for the authenticated user.
 *
 * Query parameters:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - status -- filter by project lifecycle status
 * - sortBy (default: 'createdAt')
 * - sortOrder (default: 'desc')
 *
 * Response: 200 with { data: Project[], pagination: PaginationMeta }
 */
const handleList = withErrorHandler(
  withAuth(
    'human',
    withValidation({ query: listProjectsQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const query = data.query as ListProjectsQuery;

        const db = getDb();
        const projectRepo = createProjectRepository(db);

        const options: FindProjectsOptions = {
          pagination: {
            page: query.page,
            limit: query.limit,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        };

        if (query.status) {
          options.lifecycleStatus = query.status;
        }

        const result = await projectRepo.findByTenant(tenantId, options);

        res.status(200).json(result);
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
