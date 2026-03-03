/**
 * API routes for the Epic collection within a project.
 *
 * POST /api/v1/projects/:projectId/epics  -- Create a new epic in Draft status
 * GET  /api/v1/projects/:projectId/epics  -- List epics with pagination, filtering, and derived status
 *
 * All routes require human authentication via Better Auth session.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import {
  createEpicRepository,
  createProjectRepository,
  getDb,
  type FindByProjectOptions,
} from '@laila/database';
import {
  listEpicsQuerySchema,
  type ListEpicsQuery,
  NotFoundError,
  DomainErrorCode,
} from '@laila/shared';
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
 * Validates the `id` route parameter (projectId) as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Request body for creating a new epic.
 * The projectId comes from the route parameter, not the body.
 * The sortOrder is auto-assigned by the repository if not provided.
 */
const createEpicBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:projectId/epics -- Create a new epic
// ---------------------------------------------------------------------------

/**
 * Creates a new epic in Draft (pending) status within the specified project.
 *
 * Request body: { name: string, description?: string | null }
 * Response: 201 with { data: Epic }
 * Throws: 404 NotFoundError with PROJECT_NOT_FOUND if parent project does not exist
 */
const handleCreate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema, body: createEpicBodySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId } = data.params;
        const { body } = data;

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

        // Create the epic within the project (repo auto-assigns sort_order if not provided)
        const createData: { name: string; description: string | null; sortOrder?: number } = {
          name: body.name,
          description: body.description ?? null,
        };
        if (body.sortOrder !== undefined) {
          createData.sortOrder = body.sortOrder;
        }
        const epic = await epicRepo.create(tenantId, projectId, createData);

        res.status(201).json({ data: epic });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:projectId/epics -- List epics
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of non-deleted epics for the specified project.
 * Each epic includes its derived work status (computed from child stories).
 *
 * Query parameters:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - status -- filter by work status
 * - sortBy (default: 'createdAt')
 * - sortOrder (default: 'desc')
 *
 * Response: 200 with { data: Epic[], pagination: PaginationMeta }
 */
const handleList = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema, query: listEpicsQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId } = data.params;
        const query = data.query as ListEpicsQuery;

        const db = getDb();
        const epicRepo = createEpicRepository(db);

        const options: FindByProjectOptions = {
          pagination: {
            page: query.page,
            limit: query.limit,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        };

        if (query.status) {
          options.status = query.status;
        }

        const result = await epicRepo.findByProject(tenantId, projectId, options);

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
