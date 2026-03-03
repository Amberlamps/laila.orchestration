/**
 * API route for validating task dependencies (cycle detection).
 *
 * POST /api/v1/tasks/:id/validate-dependencies
 *
 * Validates whether a proposed set of dependency IDs would create a
 * circular dependency without persisting any changes. Returns a
 * validation result with cycle path information if a cycle is detected.
 *
 * Response:
 *   - 200 { valid: true }  when no cycles detected
 *   - 200 { valid: false, cyclePath: string[], message: string }  when cycle found
 *   - 404 TASK_NOT_FOUND if task does not exist
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import { createTaskRepository, getDb } from '@laila/database';
import { buildAdjacencyList, detectCycle } from '@laila/domain';
import { NotFoundError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { DagEdge } from '@laila/domain';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  dependencyIds: z.array(z.string().uuid()).max(50),
});

// ---------------------------------------------------------------------------
// POST /api/v1/tasks/:id/validate-dependencies
// ---------------------------------------------------------------------------

const handleValidateDependencies = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: paramsSchema, body: bodySchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: taskId } = data.params;
        const { dependencyIds } = data.body;

        const db = getDb();
        const taskRepo = createTaskRepository(db);

        // Verify the task exists
        const existing = await taskRepo.findById(tenantId, taskId);
        if (!existing) {
          throw new NotFoundError(
            DomainErrorCode.TASK_NOT_FOUND,
            `Task with id ${taskId} not found`,
          );
        }

        // If no dependencies proposed, trivially valid
        if (dependencyIds.length === 0) {
          res.status(200).json({ valid: true });
          return;
        }

        // Resolve the project for this task
        const projectId = await taskRepo.getProjectIdForTask(tenantId, taskId);
        if (!projectId) {
          throw new NotFoundError(
            DomainErrorCode.TASK_NOT_FOUND,
            `Could not resolve project for task ${taskId}`,
          );
        }

        // Load all edges in the project (read-only — pass db as the query
        // handle since Drizzle's db interface is compatible with tx)
        const existingEdges = await taskRepo.getProjectEdgesInTx(tenantId, projectId, db);

        // Filter out existing edges for this task (replace-all strategy)
        const filteredEdges: DagEdge[] = existingEdges
          .filter((e) => e.dependentTaskId !== taskId)
          .map((e) => ({ from: e.dependentTaskId, to: e.prerequisiteTaskId }));

        // Build adjacency list from remaining edges
        const adjacencyList = buildAdjacencyList(filteredEdges);

        // Validate each proposed edge sequentially
        for (const dependencyId of dependencyIds) {
          // Self-dependency check
          if (dependencyId === taskId) {
            res.status(200).json({
              valid: false,
              cyclePath: [taskId, taskId],
              message: 'A task cannot depend on itself',
            });
            return;
          }

          const proposedEdge: DagEdge = { from: taskId, to: dependencyId };
          const result = detectCycle(adjacencyList, proposedEdge);

          if (result.hasCycle) {
            // Resolve task titles for the cycle path
            const taskTitleEntries: string[] = [];
            for (const cycleId of result.cyclePath) {
              const t = await taskRepo.findById(tenantId, cycleId);
              taskTitleEntries.push(t ? t.title : cycleId);
            }

            const cycleTitlePath = taskTitleEntries.join(' -> ');

            res.status(200).json({
              valid: false,
              cyclePath: result.cyclePath,
              message: `Circular dependency detected: ${cycleTitlePath}`,
            });
            return;
          }

          // Add validated edge for subsequent checks
          const existing = adjacencyList.get(taskId);
          if (existing) {
            existing.add(dependencyId);
          } else {
            adjacencyList.set(taskId, new Set([dependencyId]));
          }
        }

        res.status(200).json({ valid: true });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    return handleValidateDependencies(req, res);
  }

  res.setHeader('Allow', 'POST');
  res.status(405).json({
    error: {
      code: 'METHOD_NOT_ALLOWED',
      message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
    },
  });
}
