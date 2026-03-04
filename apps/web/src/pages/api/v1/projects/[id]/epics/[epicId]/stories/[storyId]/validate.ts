/**
 * API route for validating a story before publishing.
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/stories/:storyId/validate
 *
 * Validates all child tasks without changing story state.
 * Returns a list of validation issues grouped by task that must
 * be resolved before the story can be published.
 *
 * Checks performed:
 *   1. Story must be in pending (Draft) workStatus
 *   2. Story must have at least one task
 *   3. All tasks must have a persona reference assigned
 *   4. All tasks must have at least one acceptance criterion
 *   5. No circular task dependencies
 *
 * Response:
 *   - 200 { valid: true }  when all checks pass
 *   - 200 { valid: false, issues: TaskIssue[] }  when issues found
 *   - 404 STORY_NOT_FOUND if story does not exist
 *   - 404 EPIC_NOT_FOUND if epic does not exist or wrong project
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import { createEpicRepository, createStoryRepository, getDb } from '@laila/database';
import { NotFoundError, DomainErrorCode } from '@laila/shared';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/api/error-handler';
import { withValidation } from '@/lib/api/validation';
import { withAuth } from '@/lib/middleware/with-auth';

import type { AuthenticatedRequest } from '@/lib/middleware/with-auth';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskIssue {
  taskId: string;
  taskTitle: string;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const storyValidateParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
  storyId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:projectId/epics/:epicId/stories/:storyId/validate
// ---------------------------------------------------------------------------

const handleValidate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: storyValidateParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId, storyId } = data.params;

        const db = getDb();
        const epicRepo = createEpicRepository(db);
        const storyRepo = createStoryRepository(db);

        const taskIssues: TaskIssue[] = [];

        // 1. Verify epic belongs to the project
        const epic = await epicRepo.findById(tenantId, epicId);
        if (!epic || epic.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        // 2. Fetch the story and verify it belongs to the epic
        const story = await storyRepo.findById(tenantId, storyId);
        if (!story || story.epicId !== epicId) {
          throw new NotFoundError(
            DomainErrorCode.STORY_NOT_FOUND,
            `Story with id ${storyId} not found`,
          );
        }

        // 3. Check story is in pending (Draft) status
        if (story.workStatus !== 'pending') {
          res.status(200).json({
            valid: false,
            issues: [
              {
                taskId: '',
                taskTitle: 'Story Status',
                issues: [
                  `Story is in "${story.workStatus}" status. Only Draft stories can be published.`,
                ],
              },
            ],
          });
          return;
        }

        // 4. Fetch all tasks for validation
        const tasks = await storyRepo.findTasksForValidation(tenantId, storyId);

        // 5. Check at least one task exists
        if (tasks.length === 0) {
          res.status(200).json({
            valid: false,
            issues: [
              {
                taskId: '',
                taskTitle: 'Story Structure',
                issues: ['No tasks defined. At least one task is required before publishing.'],
              },
            ],
          });
          return;
        }

        // 6. Check each task for completeness
        for (const task of tasks) {
          const issues: string[] = [];

          if (!task.personaId) {
            issues.push('No persona assigned. Each task must have a persona reference.');
          }

          if (task.acceptanceCriteria.length === 0) {
            issues.push(
              'No acceptance criteria defined. Each task must have at least one acceptance criterion.',
            );
          }

          if (issues.length > 0) {
            taskIssues.push({
              taskId: task.id,
              taskTitle: task.title,
              issues,
            });
          }
        }

        // 7. Check for circular dependencies (if dependency info available)
        const taskIds = new Set(tasks.map((t) => t.id));
        const visited = new Set<string>();
        const inStack = new Set<string>();

        const depsMap = new Map<string, string[]>();
        for (const task of tasks) {
          const deps =
            'dependencyIds' in task
              ? ((task as unknown as { dependencyIds: string[] | undefined }).dependencyIds ?? [])
              : [];
          depsMap.set(
            task.id,
            deps.filter((id) => taskIds.has(id)),
          );
        }

        const hasCycle = (taskId: string): boolean => {
          if (inStack.has(taskId)) return true;
          if (visited.has(taskId)) return false;
          visited.add(taskId);
          inStack.add(taskId);
          for (const depId of depsMap.get(taskId) ?? []) {
            if (hasCycle(depId)) return true;
          }
          inStack.delete(taskId);
          return false;
        };

        let circularFound = false;
        for (const task of tasks) {
          if (hasCycle(task.id)) {
            circularFound = true;
            break;
          }
        }

        if (circularFound) {
          taskIssues.push({
            taskId: '',
            taskTitle: 'Task Dependencies',
            issues: [
              'Circular dependencies detected among tasks. All dependency cycles must be resolved.',
            ],
          });
        }

        if (taskIssues.length === 0) {
          res.status(200).json({ valid: true });
        } else {
          res.status(200).json({ valid: false, issues: taskIssues });
        }
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
      return handleValidate(req, res);
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
