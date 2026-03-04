/**
 * API route for publishing a story (transitioning from Draft to Ready).
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:storyId/publish
 *
 * Pre-conditions:
 *   - Story must exist and belong to the authenticated tenant
 *   - Story must be in 'pending' workStatus (Draft editorial status)
 *   - Story must have at least one task
 *   - All tasks must have a persona reference assigned
 *   - All tasks must have at least one acceptance criterion
 *
 * Post-conditions:
 *   - Story workStatus changes to 'ready'
 *   - Story updatedAt timestamp is refreshed
 *
 * Errors:
 *   - 404 STORY_NOT_FOUND if story does not exist
 *   - 404 EPIC_NOT_FOUND if epic does not exist or wrong project
 *   - 409 INVALID_STATUS_TRANSITION if story is not in Draft (pending)
 *   - 400 VALIDATION_FAILED if no tasks exist or tasks have missing fields
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import {
  createEpicRepository,
  createStoryRepository,
  getDb,
  writeAuditEventFireAndForget,
} from '@laila/database';
import { NotFoundError, ConflictError, ValidationError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const storyPublishParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
  storyId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validates tasks for publish readiness and returns details about
 * incomplete tasks (missing persona or acceptance criteria).
 */
const findIncompleteTasks = (
  tasks: Array<{
    id: string;
    title: string;
    personaId: string | null;
    acceptanceCriteria: string[];
  }>,
): Array<{ id: string; title: string; missingFields: string[] }> => {
  const incomplete: Array<{ id: string; title: string; missingFields: string[] }> = [];

  for (const task of tasks) {
    const missingFields: string[] = [];

    if (!task.personaId) {
      missingFields.push('personaId');
    }

    if (task.acceptanceCriteria.length === 0) {
      missingFields.push('acceptanceCriteria');
    }

    if (missingFields.length > 0) {
      incomplete.push({
        id: task.id,
        title: task.title,
        missingFields,
      });
    }
  }

  return incomplete;
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

const handlePublish = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: storyPublishParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId, storyId } = data.params;

        const db = getDb();
        const epicRepo = createEpicRepository(db);
        const storyRepo = createStoryRepository(db);

        // Verify epic belongs to the project
        const epic = await epicRepo.findById(tenantId, epicId);
        if (!epic || epic.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        // 1. Fetch the story and verify it belongs to the epic
        const story = await storyRepo.findById(tenantId, storyId);
        if (!story || story.epicId !== epicId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        // 2. Validate the story is in 'pending' (Draft) status
        if (story.workStatus !== 'pending') {
          throw new ConflictError(
            DomainErrorCode.INVALID_STATUS_TRANSITION,
            `Cannot publish story: current status is '${story.workStatus}', expected 'pending' (Draft)`,
          );
        }

        // 3. Fetch all tasks for validation
        const tasks = await storyRepo.findTasksForValidation(tenantId, storyId);

        // 4. Validate at least one task exists
        if (tasks.length === 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            'Story must have at least one task before publishing',
            { reason: 'NO_TASKS' },
          );
        }

        // 5. Validate all tasks have persona and acceptance criteria
        const incompleteTasks = findIncompleteTasks(tasks);

        if (incompleteTasks.length > 0) {
          throw new ValidationError(
            DomainErrorCode.VALIDATION_FAILED,
            `Cannot publish story: ${String(incompleteTasks.length)} task(s) have missing required fields`,
            { incompleteTasks },
          );
        }

        // 6. Transition the story from pending to ready
        const updated = await storyRepo.publishStory(tenantId, storyId);

        const auth = (req as AuthenticatedRequest).auth;
        writeAuditEventFireAndForget({
          entityType: 'user_story',
          entityId: storyId,
          action: 'status_changed',
          actorType: auth.type === 'human' ? 'user' : 'worker',
          actorId: auth.type === 'human' ? auth.userId : auth.workerId,
          tenantId,
          projectId,
          details: `Story "${story.title}" published (pending → ready)`,
          changes: {
            before: { workStatus: 'pending' },
            after: { workStatus: 'ready' },
          },
          metadata: {
            oldStatus: 'pending',
            newStatus: 'ready',
            storyTitle: story.title,
            epicId,
            projectId,
          },
        });

        res.status(200).json({ data: updated });
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Method dispatcher
// ---------------------------------------------------------------------------

const handler = async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  switch (req.method) {
    case 'POST':
      return handlePublish(req, res);
    default:
      res.setHeader('Allow', 'POST');
      res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method ?? 'UNKNOWN'} not allowed`,
        },
      });
  }
};

export default handler;
