/**
 * API routes for a single Persona resource.
 *
 * GET    /api/v1/personas/:id -- Get persona detail with usage statistics
 * PATCH  /api/v1/personas/:id -- Update persona name, description, and/or systemPrompt
 * DELETE /api/v1/personas/:id -- Delete persona with active-task guard
 *
 * All routes require human authentication. Only humans can manage personas;
 * workers use personas assigned to their tasks.
 *
 * DELETION GUARD:
 * A persona cannot be deleted while active (non-terminal, non-deleted) tasks
 * reference it. The DELETE handler checks for active tasks and returns 409
 * with DELETION_BLOCKED if any exist, including the count of active tasks.
 */

import { createPersonaRepository, getDb } from '@laila/database';
import {
  updatePersonaSchema,
  NotFoundError,
  ConflictError,
  DomainErrorCode,
  ValidationError,
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
 * Validates the `id` route parameter as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const personaIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/personas/:id -- Get persona detail with usage statistics
// ---------------------------------------------------------------------------

/**
 * Returns a single persona with usage statistics:
 * - Total tasks referencing this persona
 * - Active (non-terminal, non-deleted) tasks referencing this persona
 *
 * Response: 200 with { data: { ...persona, taskCounts: { active, total } } }
 * Throws: 404 NotFoundError with PERSONA_NOT_FOUND if persona does not exist
 */
const handleGetDetail = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: personaIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const personaRepo = createPersonaRepository(db);

        const result = await personaRepo.findWithTaskCounts(tenantId, id);

        if (!result) {
          throw new NotFoundError(
            DomainErrorCode.PERSONA_NOT_FOUND,
            `Persona with id ${id} not found`,
          );
        }

        res.status(200).json({ data: result });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/personas/:id -- Update persona fields
// ---------------------------------------------------------------------------

/**
 * Updates allowed persona fields (name, description, systemPrompt).
 *
 * Personas do not use optimistic locking, so no version field is required.
 * Name uniqueness is enforced at the database level within each project.
 *
 * Request body: { name?: string, description?: string, systemPrompt?: string }
 * Response: 200 with { data: Persona }
 * Throws: 404 NotFoundError if persona does not exist
 * Throws: 400 ValidationError if new name duplicates an existing persona
 */
const handleUpdate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: personaIdParamsSchema, body: updatePersonaSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;
        const body = data.body;

        const db = getDb();
        const personaRepo = createPersonaRepository(db);

        // Build the update payload with only provided fields
        const updateData: { name?: string; description?: string | null; systemPrompt?: string } =
          {};
        if (body.name !== undefined) {
          updateData.name = body.name;
        }
        if (body.description !== undefined) {
          updateData.description = body.description ?? null;
        }
        if (body.systemPrompt !== undefined) {
          updateData.systemPrompt = body.systemPrompt;
        }

        try {
          const updated = await personaRepo.update(tenantId, id, updateData);

          if (!updated) {
            throw new NotFoundError(
              DomainErrorCode.PERSONA_NOT_FOUND,
              `Persona with id ${id} not found`,
            );
          }

          res.status(200).json({ data: updated });
        } catch (error: unknown) {
          // Re-throw NotFoundError as-is (it's already an HTTP error)
          if (error instanceof NotFoundError) {
            throw error;
          }
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
// DELETE /api/v1/personas/:id -- Delete persona with active-task guard
// ---------------------------------------------------------------------------

/**
 * Deletes a persona after verifying no active tasks reference it.
 *
 * Active tasks are those whose work status is NOT in a terminal state
 * (done, failed, skipped) and that have not been soft-deleted.
 *
 * If active tasks exist, the deletion is blocked with a 409 response
 * that includes the count of active tasks for user feedback.
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if persona does not exist
 * Throws: 409 ConflictError with DELETION_BLOCKED if active tasks exist
 */
const handleDelete = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: personaIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const personaRepo = createPersonaRepository(db);

        // Verify persona exists before attempting deletion
        const existing = await personaRepo.findById(tenantId, id);
        if (!existing) {
          throw new NotFoundError(
            DomainErrorCode.PERSONA_NOT_FOUND,
            `Persona with id ${id} not found`,
          );
        }

        try {
          await personaRepo.delete(tenantId, id);
          res.status(204).end();
        } catch (error: unknown) {
          // The repository throws a ValidationError when active tasks block deletion.
          // Map it to a 409 ConflictError with DELETION_BLOCKED code.
          if (error instanceof Error && error.name === 'ValidationError') {
            // Extract the active task count from the error message
            const countMatch = /(\d+) active task/.exec(error.message);
            const activeTaskCount = countMatch ? Number(countMatch[1]) : 0;

            throw new ConflictError(
              DomainErrorCode.DELETION_BLOCKED,
              `Persona ${id} cannot be deleted because ${String(activeTaskCount)} active task(s) reference it. ` +
                `Complete or reassign the tasks before deleting this persona.`,
              { activeTaskCount },
            );
          }
          throw error;
        }
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
      return handleGetDetail(req, res);
    case 'PATCH':
      return handleUpdate(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      res.setHeader('Allow', 'GET, PATCH, DELETE');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
