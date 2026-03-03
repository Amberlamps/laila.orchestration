/**
 * API routes for a single Task resource.
 *
 * GET    /api/v1/tasks/:id -- Get task detail with resolved dependencies and dependents
 * PATCH  /api/v1/tasks/:id -- Update task fields with read-only enforcement and DAG validation
 * DELETE /api/v1/tasks/:id -- Soft-delete task with dependency edge cleanup
 *
 * Read routes allow both human and worker auth; mutation routes require human auth.
 * Uses the standard middleware composition: withErrorHandler > withAuth > withValidation.
 *
 * READ-ONLY ENFORCEMENT:
 * Tasks whose parent story has workStatus === 'in_progress' cannot be modified or deleted.
 * This is checked by fetching the parent story and asserting its status.
 *
 * TOCTOU PROTECTION:
 * Dependency validation and edge insertion happen within the same database transaction.
 * Soft-delete and edge cleanup also happen within a single transaction.
 */

import { createTaskRepository, getDb, type UpdateTaskData } from '@laila/database';
import { updateTaskSchema, NotFoundError, ConflictError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { cleanupAndSoftDelete } from '@/lib/api/dag-cleanup';
import { validateDagEdges } from '@/lib/api/dag-validation';
import { validateDependencyIds } from '@/lib/api/dependency-validation';
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
const taskIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/tasks/:id -- Get task detail with resolved dependencies
// ---------------------------------------------------------------------------

/**
 * Returns a single task with full details including:
 * - All task entity fields
 * - dependencies: resolved task summaries (id, title, workStatus) of prerequisite tasks
 * - dependents: resolved task summaries of tasks that depend on this one
 *
 * Response: 200 with { data: { ...task, dependencies: [], dependents: [] } }
 * Throws: 404 NotFoundError if task does not exist
 */
const handleGetDetail = withErrorHandler(
  withAuth(
    'both',
    withValidation({ params: taskIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const taskRepo = createTaskRepository(db);

        const result = await taskRepo.findDetailById(tenantId, id);

        if (!result) {
          throw new NotFoundError(DomainErrorCode.TASK_NOT_FOUND, `Task with id ${id} not found`);
        }

        res.status(200).json({
          data: {
            ...result.task,
            dependencies: result.dependencies,
            dependents: result.dependents,
          },
        });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// PATCH /api/v1/tasks/:id -- Update task fields
// ---------------------------------------------------------------------------

/**
 * Updates allowed task fields with optimistic locking and read-only enforcement.
 *
 * If `dependencyIds` is provided, the full dependency list is replaced
 * (delete all existing edges, insert new ones, run cycle detection).
 * Omitting `dependencyIds` leaves dependencies unchanged.
 *
 * TOCTOU protection: cycle detection and edge replacement happen within
 * the same database transaction.
 *
 * Request body: updateTaskSchema
 * Response: 200 with { data: task }
 * Throws: 404 NotFoundError if task does not exist
 * Throws: 409 ConflictError with READ_ONLY_VIOLATION if parent story is in-progress
 * Throws: 409 ConflictError with OPTIMISTIC_LOCK_CONFLICT on version mismatch
 * Throws: 400 ValidationError with DAG_CYCLE_DETECTED if dependencies create a cycle
 * Throws: 400 ValidationError with INVALID_DEPENDENCY for self-dep or cross-project dep
 */
const handleUpdate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: taskIdParamsSchema, body: updateTaskSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;
        const body = data.body;

        const db = getDb();
        const taskRepo = createTaskRepository(db);

        // 1. Verify the task exists
        const existing = await taskRepo.findById(tenantId, id);
        if (!existing) {
          throw new NotFoundError(DomainErrorCode.TASK_NOT_FOUND, `Task with id ${id} not found`);
        }

        // 2. Enforce read-only constraint via parent story
        const parentStory = await taskRepo.getParentStory(tenantId, id);
        if (!parentStory) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Parent story for task ${id} not found`,
          );
        }

        if (parentStory.workStatus === 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.READ_ONLY_VIOLATION,
            `Cannot modify task in a story with "in_progress" status. The story is read-only while work is in progress.`,
          );
        }

        // 3. Pre-transaction validation for dependency_ids if provided
        const dependencyIds = body.dependencyIds;
        let resolvedProjectId = '';

        if (dependencyIds !== undefined && dependencyIds.length > 0) {
          const projectId = await taskRepo.getProjectIdForTask(tenantId, id);
          if (!projectId) {
            throw new NotFoundError(
              DomainErrorCode.TASK_NOT_FOUND,
              `Could not resolve project for task ${id}`,
            );
          }
          resolvedProjectId = projectId;

          // Pre-transaction validation: self-dep, existence, cross-project
          await validateDependencyIds(tenantId, id, resolvedProjectId, dependencyIds, taskRepo);
        }

        // 4. Build the update payload, only including fields that were provided
        const { version } = body;
        const updateData: UpdateTaskData = {};

        if (body.title !== undefined) {
          updateData.title = body.title;
        }
        if (body.description !== undefined) {
          updateData.description = body.description;
        }
        if (body.personaId !== undefined) {
          updateData.personaId = body.personaId;
        }
        if (body.acceptanceCriteria !== undefined) {
          updateData.acceptanceCriteria = body.acceptanceCriteria;
        }
        if (body.technicalNotes !== undefined) {
          updateData.technicalNotes = body.technicalNotes;
        }
        if (body.references !== undefined) {
          updateData.references = body.references;
        }

        // 5. Atomic operation: dependency replacement + task update
        //    All succeed or all roll back — no partial state on lock failure.
        try {
          const updated = await taskRepo.withTransaction(async (tx) => {
            // 5a. Handle dependency_ids replacement if provided
            if (dependencyIds !== undefined) {
              if (dependencyIds.length > 0) {
                // DAG cycle detection within the transaction (TOCTOU-safe)
                await validateDagEdges(
                  tenantId,
                  resolvedProjectId,
                  id,
                  dependencyIds,
                  taskRepo,
                  tx,
                );

                // Replace edges within the same transaction
                await taskRepo.replaceDependenciesInTx(tenantId, id, dependencyIds, tx);
              } else {
                // Empty array means clear all dependencies
                await taskRepo.replaceDependenciesInTx(tenantId, id, [], tx);
              }
            }

            // 5b. Update task fields with optimistic locking within the same tx
            return taskRepo.updateInTx(tenantId, id, updateData, version, tx);
          });

          res.status(200).json({ data: updated });
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'ConflictError') {
            throw new ConflictError(
              DomainErrorCode.OPTIMISTIC_LOCK_CONFLICT,
              `Task ${id} has been modified by another request. Please retry with the latest version.`,
            );
          }
          throw error;
        }
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/tasks/:id -- Soft-delete task with edge cleanup
// ---------------------------------------------------------------------------

/**
 * Soft-deletes a task and atomically removes all dependency edges
 * (both incoming and outgoing) where this task participates.
 *
 * READ-ONLY ENFORCEMENT: Cannot delete tasks whose parent story is in-progress.
 *
 * The edge cleanup and soft-delete happen within the same transaction
 * to ensure atomicity.
 *
 * Response: 204 No Content
 * Throws: 404 NotFoundError if task does not exist
 * Throws: 409 ConflictError with READ_ONLY_VIOLATION when parent story is in-progress
 */
const handleDelete = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: taskIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const taskRepo = createTaskRepository(db);

        // 1. Verify the task exists
        const existing = await taskRepo.findById(tenantId, id);
        if (!existing) {
          throw new NotFoundError(DomainErrorCode.TASK_NOT_FOUND, `Task with id ${id} not found`);
        }

        // 2. Enforce read-only constraint via parent story
        const parentStory = await taskRepo.getParentStory(tenantId, id);
        if (parentStory && parentStory.workStatus === 'in_progress') {
          throw new ConflictError(
            DomainErrorCode.READ_ONLY_VIOLATION,
            `Cannot delete task in a story with "in_progress" status. The story is read-only while work is in progress.`,
          );
        }

        // 3. Atomic edge cleanup + soft-delete within a single transaction
        await taskRepo.withTransaction(async (tx) =>
          cleanupAndSoftDelete(tenantId, id, taskRepo, tx),
        );

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
