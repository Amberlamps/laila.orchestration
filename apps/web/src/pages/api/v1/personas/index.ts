/**
 * API routes for the Persona collection.
 *
 * POST /api/v1/personas  -- Create a new persona
 * GET  /api/v1/personas  -- List personas with pagination and usage counts
 *
 * All routes require human authentication. Only humans can manage personas;
 * workers use personas assigned to their tasks.
 *
 * Personas define the role, system prompt context, and behavioral instructions
 * for AI workers executing tasks. Each task references a persona that tells
 * the worker how to approach the work. Personas are scoped to a project.
 */

import {
  createPersonaRepository,
  createProjectRepository,
  getDb,
  writeAuditEventFireAndForget,
  type PersonaListOptions,
} from '@laila/database';
import {
  createPersonaSchema,
  listPersonasQuerySchema,
  type ListPersonasQuery,
  DomainErrorCode,
  ValidationError,
  NotFoundError,
} from '@laila/shared';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// POST /api/v1/personas -- Create a new persona
// ---------------------------------------------------------------------------

/**
 * Creates a new persona for the authenticated tenant.
 *
 * Request body: { name: string, description?: string, systemPrompt: string, projectId: string }
 * Response: 201 with { data: Persona }
 *
 * Validates that the specified projectId exists within the tenant scope.
 * Throws 400 ValidationError if the name already exists within the project
 * (enforced by the database unique constraint on project_id + name).
 * Throws 404 NotFoundError if the projectId does not exist.
 */
const handleCreate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ body: createPersonaSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { body } = data;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const personaRepo = createPersonaRepository(db);

        // Validate that the project exists within the tenant scope
        const project = await projectRepo.findById(tenantId, body.projectId);
        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${body.projectId} not found`,
          );
        }

        try {
          const persona = await personaRepo.create(tenantId, {
            name: body.name,
            description: body.description ?? null,
            systemPrompt: body.systemPrompt,
            projectId: body.projectId,
          });

          const auth = (req as AuthenticatedRequest).auth;
          writeAuditEventFireAndForget({
            entityType: 'persona',
            entityId: persona.id,
            action: 'created',
            actorType: auth.type === 'human' ? 'user' : 'worker',
            actorId: auth.type === 'human' ? auth.userId : auth.workerId,
            tenantId,
            details: `Persona "${body.name}" created`,
            changes: {
              after: { name: body.name, description: body.description ?? null },
            },
            metadata: { personaName: body.name, projectId: body.projectId },
          });

          res.status(201).json({ data: persona });
        } catch (error: unknown) {
          // Map repository ValidationError to HTTP ValidationError
          if (error instanceof Error && error.name === 'ValidationError') {
            throw new ValidationError(DomainErrorCode.VALIDATION_FAILED, error.message);
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// GET /api/v1/personas -- List personas with usage counts
// ---------------------------------------------------------------------------

/**
 * Returns a paginated list of personas for the authenticated tenant.
 * Each persona includes a `usageCount` field representing the number of
 * active (non-terminal, non-deleted) tasks referencing it.
 *
 * Query parameters:
 * - page (default: 1)
 * - limit (default: 20, max: 100)
 * - sortBy (default: 'createdAt')
 * - sortOrder (default: 'desc')
 * - projectId (optional) — filter by project
 *
 * Response: 200 with { data: PersonaWithUsageCount[], pagination: PaginationMeta }
 */
const handleList = withErrorHandler(
  withAuth(
    'human',
    withValidation({ query: listPersonasQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const query = data.query as ListPersonasQuery;

        const db = getDb();
        const personaRepo = createPersonaRepository(db);

        const options: PersonaListOptions = {
          pagination: {
            page: query.page,
            limit: query.limit,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
          projectId: query.projectId,
        };

        const result = await personaRepo.findByTenantWithUsageCount(tenantId, options);

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
