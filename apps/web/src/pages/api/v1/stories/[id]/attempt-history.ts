/**
 * API route for fetching attempt history for a story.
 *
 * GET /api/v1/stories/:id/attempt-history
 *
 * Returns all attempt history records for the story, enriched with worker
 * names. Records are ordered by attempt number descending (newest first).
 *
 * Each entry contains:
 *   - id: attempt record UUID
 *   - workerId: worker UUID (or null if worker was deleted)
 *   - workerName: worker display name (or "Unknown Worker" if deleted)
 *   - assignedAt: ISO timestamp when the worker was assigned
 *   - unassignedAt: ISO timestamp when the attempt ended (null if in progress)
 *   - reason: "timeout" | "manual" | "failure" | "complete" | null
 *   - durationSeconds: elapsed seconds (null if still in progress)
 *
 * Errors:
 *   - 404 STORY_NOT_FOUND if story does not exist
 *   - 405 METHOD_NOT_ALLOWED for non-GET methods
 *
 * Requires human authentication via Better Auth session.
 */

import { createStoryRepository, createWorkerRepository, getDb } from '@laila/database';
import { NotFoundError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const storyParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Status-to-reason mapping
// ---------------------------------------------------------------------------

/**
 * Maps database attempt status values to the UI reason enum.
 *
 * Database statuses: 'in_progress', 'completed', 'failed', 'timed_out'
 * UI reasons: null (in progress), 'complete', 'failure', 'timeout', 'manual'
 */
const mapStatusToReason = (
  status: string,
  reason: string | null,
): 'timeout' | 'manual' | 'failure' | 'complete' | null => {
  if (status === 'in_progress') return null;
  if (status === 'completed') return 'complete';
  if (status === 'failed') return 'failure';
  if (status === 'timed_out') {
    // Distinguish between timeout and manual unassignment
    if (reason === 'manual_unassignment') return 'manual';
    return 'timeout';
  }
  return 'failure';
};

// ---------------------------------------------------------------------------
// GET /api/v1/stories/:id/attempt-history
// ---------------------------------------------------------------------------

const handleGetAttemptHistory = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: storyParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: storyId } = data.params;

        const db = getDb();
        const storyRepo = createStoryRepository(db);

        // 1. Verify the story exists
        const story = await storyRepo.findById(tenantId, storyId);
        if (!story) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        // 2. Get all attempts for this story
        const attempts = await storyRepo.getPreviousAttempts(tenantId, storyId);

        // 3. Enrich with worker names — batch-fetch unique worker IDs
        const workerIds = [
          ...new Set(attempts.map((a) => a.workerId).filter((id): id is string => id !== null)),
        ];

        const workerNames = new Map<string, string>();
        if (workerIds.length > 0) {
          const workerRepo = createWorkerRepository(db);
          for (const workerId of workerIds) {
            const worker = await workerRepo.findById(tenantId, workerId);
            if (worker) {
              workerNames.set(workerId, worker.name);
            }
          }
        }

        // 4. Transform to response shape (reverse chronological = newest first)
        const entries = attempts
          .map((attempt) => ({
            id: attempt.id,
            workerId: attempt.workerId ?? null,
            workerName: attempt.workerId
              ? (workerNames.get(attempt.workerId) ?? 'Unknown Worker')
              : 'Unknown Worker',
            assignedAt: attempt.startedAt.toISOString(),
            unassignedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
            reason: mapStatusToReason(attempt.status, attempt.reason),
            durationSeconds:
              attempt.durationMs !== null ? Math.floor(attempt.durationMs / 1000) : null,
          }))
          .reverse();

        res.status(200).json({ data: entries });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'GET':
      return handleGetAttemptHistory(req, res);
    default:
      res.setHeader('Allow', 'GET');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
