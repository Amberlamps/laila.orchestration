/**
 * API routes for a single Story resource within an epic.
 *
 * GET    /api/v1/projects/:projectId/epics/:epicId/stories/:storyId -- Get story detail with task count
 * PATCH  /api/v1/projects/:projectId/epics/:epicId/stories/:storyId -- Update story fields (editable state only)
 * DELETE /api/v1/projects/:projectId/epics/:epicId/stories/:storyId -- Soft-delete with cascade to tasks
 *
 * Read routes allow both human and worker auth; mutation routes require human authentication.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 */

import { createEpicRepository, createStoryRepository, getDb } from '@laila/database';
import { NotFoundError, ConflictError, DomainErrorCode, prioritySchema } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { assertStoryEditable } from '@/lib/api/guards/read-only-guard';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Shared param schema for route parameter validation
// ---------------------------------------------------------------------------

/**
 * Validates `id` (projectId), `epicId`, and `storyId` route parameters as UUIDs.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const storyDetailParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
  storyId: z.string().uuid(),
});

/**
 * Request body for updating a story.
 * All fields are optional for partial updates.
 * Requires `version` for optimistic locking.
 * Cost fields (costEstimate, actualCost) are NOT included -- they are read-only from CRUD.
 */
const updateStoryBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).nullable().optional(),
  priority: prioritySchema.optional(),
  version: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies the epic exists and belongs to the project specified in the URL.
 * Throws NotFoundError if the epic does not exist or belongs to a different project.
 */
const verifyEpicBelongsToProject = async (
  tenantId: string,
  projectId: string,
  epicId: string,
): Promise<void> => {
  const db = getDb();
  const epicRepo = createEpicRepository(db);
  const epic = await epicRepo.findById(tenantId, epicId);
  if (!epic || epic.projectId !== projectId) {
    throw new NotFoundError(DomainErrorCode.EPIC_NOT_FOUND, `Epic with id ${epicId} not found`);
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/projects/:projectId/epics/:epicId/stories/:storyId -- Get story detail
// ---------------------------------------------------------------------------

/**
 * Returns a single story with full details including task count,
 * assignment info, and cost fields.
 *
 * Response: 200 with { data: UserStoryWithTaskCount }
 * Throws: 404 NotFoundError with STORY_NOT_FOUND if story does not exist or wrong epic
 */
const handleGetDetail = withErrorHandler(
  withAuth(
    'both',
    withValidation({ params: storyDetailParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId, storyId } = data.params;

        // Verify epic belongs to the project
        await verifyEpicBelongsToProject(tenantId, projectId, epicId);

        const db = getDb();
        const storyRepo = createStoryRepository(db);

        const story = await storyRepo.findWithTaskCount(tenantId, storyId);
        if (!story || story.epicId !== epicId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        res.status(200).json({ data: story });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/projects/:projectId/epics/:epicId/stories/:storyId -- Update story
// ---------------------------------------------------------------------------

/**
 * Updates allowed story fields. Only permitted when the story is in an
 * editable state (not in_progress or completed/done).
 *
 * Request body: { title?, description?, priority?, version (required for optimistic locking) }
 * Response: 200 with { data: UserStory }
 * Throws: 404 NotFoundError if story does not exist
 * Throws: 409 ConflictError with READ_ONLY_VIOLATION if story is in-progress or done
 * Throws: 409 ConflictError with OPTIMISTIC_LOCK_CONFLICT on version mismatch
 */
const handleUpdate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: storyDetailParamsSchema, body: updateStoryBodySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId, storyId } = data.params;
        const body = data.body;

        // Verify epic belongs to the project
        await verifyEpicBelongsToProject(tenantId, projectId, epicId);

        const db = getDb();
        const storyRepo = createStoryRepository(db);

        // Verify the story exists and belongs to the epic
        const existing = await storyRepo.findById(tenantId, storyId);
        if (!existing || existing.epicId !== epicId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        // Enforce read-only constraint for in-progress or completed stories
        assertStoryEditable(existing.workStatus as string);

        // Build the update payload, only including fields that were provided
        const { version } = body;
        const updateData: Partial<{
          title: string;
          description: string | null;
          priority: string;
        }> = {};

        if (body.title !== undefined) {
          updateData.title = body.title;
        }
        if (body.description !== undefined) {
          updateData.description = body.description;
        }
        if (body.priority !== undefined) {
          updateData.priority = body.priority;
        }

        try {
          const updated = await storyRepo.update(tenantId, storyId, updateData, version);
          res.status(200).json({ data: updated });
        } catch (error: unknown) {
          // Map repository ConflictError to HTTP ConflictError with domain code
          if (error instanceof Error && error.name === 'ConflictError') {
            throw new ConflictError(
              DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
              `Story ${storyId} has been modified by another request. Please retry with the latest version.`,
            );
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/projects/:projectId/epics/:epicId/stories/:storyId -- Soft-delete
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a story and cascades to child tasks.
 * Sets deleted_at on story and all tasks.
 * Cleans up dependency edges referencing deleted tasks.
 *
 * READ-ONLY ENFORCEMENT: Cannot delete in-progress stories.
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if story does not exist
 * Throws: 409 ConflictError with READ_ONLY_VIOLATION when story is in-progress
 */
const handleDelete = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: storyDetailParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId, storyId } = data.params;

        // Verify epic belongs to the project
        await verifyEpicBelongsToProject(tenantId, projectId, epicId);

        const db = getDb();
        const storyRepo = createStoryRepository(db);

        // Verify the story exists and belongs to the epic before deleting
        const existing = await storyRepo.findById(tenantId, storyId);
        if (!existing || existing.epicId !== epicId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        // Enforce read-only constraint -- cannot delete in-progress stories
        // Note: completed/done stories CAN be deleted (unlike PATCH which blocks both)
        if (existing.workStatus === 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.READ_ONLY_VIOLATION,
            `Cannot delete story in "in_progress" status. The story is read-only while work is in progress.`,
          );
        }

        await storyRepo.softDeleteWithCascade(tenantId, storyId);

        res.status(204).end();
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
