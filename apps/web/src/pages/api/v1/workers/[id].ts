/**
 * API routes for a single Worker resource.
 *
 * GET    /api/v1/workers/:id -- Get worker detail with activity summary
 * PATCH  /api/v1/workers/:id -- Update worker name and/or description
 * DELETE /api/v1/workers/:id -- Delete worker with safety guards
 *
 * All routes require human authentication. Only humans can manage workers;
 * workers cannot modify or delete other workers.
 *
 * SECURITY NOTES:
 * - The api_key_hash is NEVER returned in any response.
 * - DELETE invalidates the worker's API key by removing the worker record
 *   (the key hash is stored on the worker, so deletion = key invalidation).
 * - DELETE returns 409 DELETION_BLOCKED if the worker has in-progress stories,
 *   unless force=true is provided to override.
 * - Force-delete unassigns all stories before deleting the worker.
 */

import {
  createWorkerRepository,
  getDb,
  writeAuditEventFireAndForget,
  type Worker,
} from '@laila/database';
import {
  updateWorkerBodySchema,
  deleteWorkerQuerySchema,
  NotFoundError,
  ConflictError,
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
 * Validates the `id` route parameter as a UUID.
 * Next.js Pages Router puts dynamic route params into `req.query`.
 */
const workerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Response helper -- strip sensitive fields from worker records
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
// GET /api/v1/workers/:id -- Get worker detail with activity summary
// ---------------------------------------------------------------------------

/**
 * Returns a single worker with activity summary:
 * - Number of currently assigned stories
 * - Number of completed stories (historical)
 * - Number of projects the worker has access to
 *
 * Response: 200 with { data: { ...worker, activity: ActivitySummary } }
 * Throws: 404 NotFoundError with WORKER_NOT_FOUND if worker does not exist
 */
const handleGetDetail = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        const result = await workerRepo.findWithActivity(tenantId, id);

        if (!result) {
          throw new NotFoundError(
            DomainErrorCode.WORKER_NOT_FOUND,
            `Worker with id ${id} not found`,
          );
        }

        res.status(200).json({
          data: {
            ...sanitizeWorker(result.worker),
            activity: result.activity,
          },
        });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/workers/:id -- Update worker name/description
// ---------------------------------------------------------------------------

/**
 * Updates allowed worker fields (name and description only).
 *
 * Uses optimistic locking via the updatedAt timestamp to prevent
 * concurrent modification races.
 *
 * Request body: { name?: string, description?: string | null }
 * Response: 200 with { data: Worker }
 * Throws: 404 NotFoundError if worker does not exist
 * Throws: 409 ConflictError on concurrent modification
 */
const handleUpdate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerIdParamsSchema, body: updateWorkerBodySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;
        const body = data.body;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        // Fetch the current worker to get updatedAt for optimistic locking
        const existing = await workerRepo.findById(tenantId, id);
        if (!existing) {
          throw new NotFoundError(
            DomainErrorCode.WORKER_NOT_FOUND,
            `Worker with id ${id} not found`,
          );
        }

        const updateData: { name?: string; description?: string | null } = {};
        if (body.name !== undefined) {
          updateData.name = body.name;
        }
        if (body.description !== undefined) {
          updateData.description = body.description;
        }

        try {
          const updated = await workerRepo.update(tenantId, id, updateData, existing.updatedAt);

          const auth = (req as AuthenticatedRequest).auth;
          const changedFields = Object.keys(updateData);
          writeAuditEventFireAndForget({
            entityType: 'worker',
            entityId: id,
            action: 'updated',
            actorType: auth.type === 'human' ? 'user' : 'worker',
            actorId: auth.type === 'human' ? auth.userId : auth.workerId,
            tenantId,
            details: `Worker "${updated.name}" updated (${changedFields.join(', ')})`,
            metadata: {
              changedFields,
              workerName: updated.name,
            },
          });

          res.status(200).json({ data: sanitizeWorker(updated) });
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'ConflictError') {
            throw new ConflictError(
              DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
              `Worker ${id} has been modified by another request. Please retry with the latest version.`,
            );
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/workers/:id -- Delete worker with safety guards
// ---------------------------------------------------------------------------

/**
 * Deletes a worker and invalidates its API key.
 *
 * Safety guard: if the worker has in-progress story assignments, the
 * deletion is blocked with a 409 response that includes the list of
 * affected stories. Pass ?force=true to override: all stories are
 * unassigned (reverted to pending) before the worker is deleted.
 *
 * Query parameters:
 * - force (optional, default: false) -- override deletion guard
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if worker does not exist
 * Throws: 409 ConflictError with DELETION_BLOCKED if in-progress stories exist
 */
const handleDelete = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: workerIdParamsSchema, query: deleteWorkerQuerySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;
        const { force } = data.query;

        const db = getDb();
        const workerRepo = createWorkerRepository(db);

        // Verify worker exists before checking assignments
        const existing = await workerRepo.findById(tenantId, id);
        if (!existing) {
          throw new NotFoundError(
            DomainErrorCode.WORKER_NOT_FOUND,
            `Worker with id ${id} not found`,
          );
        }

        // Check for in-progress story assignments
        const inProgressStories = await workerRepo.findInProgressStories(tenantId, id);

        if (inProgressStories.length > 0 && !force) {
          throw new ConflictError(
            DomainErrorCode.DELETION_BLOCKED,
            `Worker ${id} has ${String(inProgressStories.length)} in-progress story assignment(s). ` +
              `Use ?force=true to unassign all stories and delete the worker.`,
            {
              inProgressStories: inProgressStories.map((story) => ({
                id: story.id,
                title: story.title,
                workStatus: story.workStatus,
              })),
            },
          );
        }

        // If force=true and there are in-progress stories, unassign them first
        if (inProgressStories.length > 0 && force) {
          await workerRepo.unassignAllStories(tenantId, id);
        }

        // Delete the worker (this invalidates the API key since the hash
        // is stored on the worker record)
        try {
          await workerRepo.hardDelete(tenantId, id);
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'NotFoundError') {
            throw new NotFoundError(
              DomainErrorCode.WORKER_NOT_FOUND,
              `Worker with id ${id} not found`,
            );
          }
          throw error;
        }

        const auth = (req as AuthenticatedRequest).auth;
        writeAuditEventFireAndForget({
          entityType: 'worker',
          entityId: id,
          action: 'deleted',
          actorType: auth.type === 'human' ? 'user' : 'worker',
          actorId: auth.type === 'human' ? auth.userId : auth.workerId,
          tenantId,
          details: `Worker "${existing.name}" deleted${force === true ? ' (force)' : ''}`,
          changes: {
            before: { name: existing.name },
          },
          metadata: {
            workerName: existing.name,
            forceDeleted: force === true,
          },
        });

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
