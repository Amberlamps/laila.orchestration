/**
 * API routes for the Story collection within an epic.
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/stories  -- Create a new story in pending status
 * GET  /api/v1/projects/:projectId/epics/:epicId/stories   -- List stories with pagination and filters
 *
 * Mutation routes require human authentication; read routes allow both human and worker auth.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import {
  createEpicRepository,
  createProjectRepository,
  createStoryRepository,
  getDb,
  type FindByEpicOptions,
} from '@laila/database';
import { NotFoundError, DomainErrorCode, workStatusSchema, prioritySchema } from '@laila/shared';
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
 * Validates the `id` (projectId) and `epicId` route parameters as UUIDs.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const storyCollectionParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
});

/**
 * Request body for creating a new story.
 * The epicId comes from the route parameter, not the body.
 * Priority uses text values ('critical', 'high', 'medium', 'low').
 */
const createStoryBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  priority: prioritySchema.optional().default('medium'),
  costEstimate: z.string().optional(),
  maxAttempts: z.number().int().positive().optional(),
});

/**
 * Query parameters for listing stories within an epic.
 * Extends base pagination with story-specific filters.
 */
const listStoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: workStatusSchema.optional(),
  priority: prioritySchema.optional(),
  assigned_worker_id: z.string().uuid().optional(),
  sort_by: z.string().min(1).max(100).default('priority'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

/** Inferred output type for the list stories query parameters */
type ListStoriesQuery = z.infer<typeof listStoriesQuerySchema>;

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:projectId/epics/:epicId/stories -- Create a new story
// ---------------------------------------------------------------------------

/**
 * Creates a new story in pending (draft) status within the specified epic.
 *
 * Request body: { title: string, description?: string | null, priority?: Priority }
 * Response: 201 with { data: UserStory }
 * Throws: 404 NotFoundError if parent project or epic does not exist
 */
const handleCreate = withErrorHandler(
  withAuth(
    'human',
    withValidation({
      params: storyCollectionParamsSchema,
      body: createStoryBodySchema,
    })(async (req: NextApiRequest, res: NextApiResponse, data) => {
      const { tenantId } = (req as AuthenticatedRequest).auth;
      const { id: projectId, epicId } = data.params;
      const { body } = data;

      const db = getDb();
      const projectRepo = createProjectRepository(db);
      const epicRepo = createEpicRepository(db);
      const storyRepo = createStoryRepository(db);

      // Verify the parent project exists
      const project = await projectRepo.findById(tenantId, projectId);
      if (!project) {
        throw new NotFoundError(
          DomainErrorCode.PROJECT_NOT_FOUND,
          `Project with id ${projectId} not found`,
        );
      }

      // Verify the parent epic exists and belongs to the project
      const epic = await epicRepo.findById(tenantId, epicId);
      if (!epic || epic.projectId !== projectId) {
        throw new NotFoundError(DomainErrorCode.EPIC_NOT_FOUND, `Epic with id ${epicId} not found`);
      }

      // Build the create data, only including provided optional fields
      const createData: {
        title: string;
        description: string | null;
        priority?: string;
        costEstimate?: string;
        maxAttempts?: number;
      } = {
        title: body.title,
        description: body.description ?? null,
      };

      if (body.priority !== undefined) {
        createData.priority = body.priority;
      }
      if (body.costEstimate !== undefined) {
        createData.costEstimate = body.costEstimate;
      }
      if (body.maxAttempts !== undefined) {
        createData.maxAttempts = body.maxAttempts;
      }

      const story = await storyRepo.create(tenantId, epicId, createData);

      res.status(201).json({ data: story });
    }),
  ),
);

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:projectId/epics/:epicId/stories -- List stories
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of non-deleted stories for the specified epic.
 * Each story includes a task count. Supports filtering by status,
 * assigned_worker_id, and priority.
 *
 * Query parameters:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - status -- filter by work status
 * - priority -- filter by priority level
 * - assigned_worker_id -- filter by assigned worker
 * - sort_by (default: 'priority')
 * - sort_order (default: 'desc')
 *
 * Response: 200 with { data: UserStoryWithTaskCount[], pagination: PaginationMeta }
 */
const handleList = withErrorHandler(
  withAuth(
    'both',
    withValidation({
      params: storyCollectionParamsSchema,
      query: listStoriesQuerySchema,
    })(async (req: NextApiRequest, res: NextApiResponse, data) => {
      const { tenantId } = (req as AuthenticatedRequest).auth;
      const { id: projectId, epicId } = data.params;
      const query = data.query as ListStoriesQuery;

      const db = getDb();
      const epicRepo = createEpicRepository(db);
      const storyRepo = createStoryRepository(db);

      // Verify the epic exists and belongs to the project
      const epic = await epicRepo.findById(tenantId, epicId);
      if (!epic || epic.projectId !== projectId) {
        throw new NotFoundError(DomainErrorCode.EPIC_NOT_FOUND, `Epic with id ${epicId} not found`);
      }

      const options: FindByEpicOptions = {
        pagination: {
          page: query.page,
          limit: query.limit,
          sortBy: query.sort_by,
          sortOrder: query.sort_order,
        },
      };

      if (query.status) {
        options.status = query.status;
      }
      if (query.priority) {
        options.priority = query.priority;
      }
      if (query.assigned_worker_id) {
        options.assignedWorkerId = query.assigned_worker_id;
      }

      const result = await storyRepo.findByEpicWithTaskCount(tenantId, epicId, options);

      res.status(200).json(result);
    }),
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
