/**
 * API routes for the Task collection.
 *
 * POST /api/v1/tasks  -- Create a new task with optional dependency edges
 * GET  /api/v1/tasks  -- List tasks with pagination, filtering, and dependency info
 *
 * Tasks use a flat URL structure (not nested under stories) because
 * cross-story dependencies within the same project are allowed.
 * The `userStoryId` is provided in the request body for creation.
 *
 * Mutation routes require human authentication; read routes allow both
 * human and worker auth. Uses the standard middleware composition:
 * withErrorHandler > withAuth > withValidation.
 */

import {
  createTaskRepository,
  createStoryRepository,
  getDb,
  type FindTasksOptions,
} from '@laila/database';
import {
  createTaskSchema,
  listTasksQuerySchema,
  type ListTasksQuery,
  NotFoundError,
  ConflictError,
  DomainErrorCode,
} from '@laila/shared';

import { validateDagEdges } from '@/lib/api/dag-validation';
import { validateDependencyIds } from '@/lib/api/dependency-validation';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// POST /api/v1/tasks -- Create a new task
// ---------------------------------------------------------------------------

/**
 * Creates a new task within a user story.
 *
 * Validates:
 * - Parent story exists and is in an editable state (not in_progress)
 * - No self-dependencies
 * - All dependency_ids reference existing, non-deleted tasks within the same project
 * - No cross-project dependencies
 * - DAG cycle detection passes when dependencies are provided
 *
 * TOCTOU protection: Cycle detection and edge insertion happen within
 * the same database transaction to prevent race conditions.
 *
 * Request body: createTaskSchema (title, userStoryId, dependencyIds, etc.)
 * Response: 201 with { data: task }
 */
const handleCreate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ body: createTaskSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { body } = data;

        const db = getDb();
        const taskRepo = createTaskRepository(db);
        const storyRepo = createStoryRepository(db);

        // 1. Verify the parent story exists
        const story = await storyRepo.findById(tenantId, body.userStoryId);
        if (!story) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${body.userStoryId} not found`,
          );
        }

        // 2. Enforce read-only constraint (story must be editable)
        if (story.workStatus === 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.READ_ONLY_VIOLATION,
            `Cannot create task in story with "in_progress" status. The story is read-only while work is in progress.`,
          );
        }

        // 3. Get the project ID for this story (needed for cross-project validation)
        const projectId = await taskRepo.getProjectIdForStory(tenantId, body.userStoryId);
        if (!projectId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Could not resolve project for story ${body.userStoryId}`,
          );
        }

        // 4. Validate dependency IDs before the transaction (cheap checks first)
        const dependencyIds = body.dependencyIds ?? [];

        // 5. Atomic operation: create task + validate deps + insert edges
        //    All succeed or all roll back — no orphaned tasks on failure.
        const task = await taskRepo.withTransaction(async (tx) => {
          // 5a. Create the task within the transaction
          const created = await taskRepo.createInTx(
            tenantId,
            body.userStoryId,
            {
              title: body.title,
              description: body.description,
              acceptanceCriteria: body.acceptanceCriteria,
              technicalNotes: body.technicalNotes,
              personaId: body.personaId,
              references: body.references,
            },
            tx,
          );

          // 5b. Validate and insert dependency edges if provided
          if (dependencyIds.length > 0) {
            // Pre-edge validation: self-dep, existence, cross-project
            await validateDependencyIds(tenantId, created.id, projectId, dependencyIds, taskRepo);

            // DAG cycle detection within the transaction (TOCTOU-safe)
            await validateDagEdges(tenantId, projectId, created.id, dependencyIds, taskRepo, tx);

            // Insert edges within the same transaction
            await taskRepo.replaceDependenciesInTx(tenantId, created.id, dependencyIds, tx);
          }

          return created;
        });

        res.status(201).json({ data: task });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// GET /api/v1/tasks -- List tasks with filters
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of tasks with optional filters.
 *
 * Supports filtering by:
 * - projectId -- tasks within a project (joins through stories and epics)
 * - userStoryId -- tasks within a specific story
 * - status -- filter by work status
 * - personaId -- filter by assigned persona
 *
 * Each task includes its dependency IDs for client-side rendering.
 *
 * Query parameters: listTasksQuerySchema
 * Response: 200 with { data: tasks[], pagination: {...} }
 */
const handleList = withErrorHandler(
  withAuth(
    'both',
    withValidation({ query: listTasksQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const query = data.query as ListTasksQuery;

        const db = getDb();
        const taskRepo = createTaskRepository(db);

        const options: FindTasksOptions = {
          pagination: {
            page: query.page,
            limit: query.limit,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        };

        if (query.projectId) {
          options.projectId = query.projectId;
        }
        if (query.userStoryId) {
          options.storyId = query.userStoryId;
        }
        if (query.status) {
          options.status = query.status;
        }
        if (query.personaId) {
          options.personaId = query.personaId;
        }

        const result = await taskRepo.findWithFilters(tenantId, options);

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
