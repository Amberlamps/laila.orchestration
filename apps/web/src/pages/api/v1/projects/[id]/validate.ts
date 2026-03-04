/**
 * API route for validating a project before publishing.
 *
 * POST /api/v1/projects/:id/validate
 *
 * Validates all child entities without changing project state.
 * Returns a list of validation issues that must be resolved before
 * the project can be published.
 *
 * Checks performed:
 *   1. Project must be in Draft lifecycle status
 *   2. Project must have at least one epic
 *   3. All epics must have workStatus === 'ready'
 *   4. All epics must have at least one story
 *   5. All stories must have at least one task
 *
 * Response:
 *   - 200 { valid: true }  when all checks pass
 *   - 200 { valid: false, issues: ValidationIssue[] }  when issues found
 *   - 404 PROJECT_NOT_FOUND if project does not exist
 *   - 405 METHOD_NOT_ALLOWED for non-POST methods
 *
 * Requires human authentication via Better Auth session.
 */

import {
  createProjectRepository,
  createEpicRepository,
  createStoryRepository,
  getDb,
} from '@laila/database';
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

interface ValidationIssue {
  entityType: string;
  entityName: string;
  issue: string;
}

// ---------------------------------------------------------------------------
// Param schema
// ---------------------------------------------------------------------------

const projectIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:id/validate
// ---------------------------------------------------------------------------

const handleValidate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: projectIdParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const epicRepo = createEpicRepository(db);
        const storyRepo = createStoryRepository(db);

        const issues: ValidationIssue[] = [];

        // 1. Fetch the project
        const project = await projectRepo.findById(tenantId, id);
        if (!project) {
          throw new NotFoundError(
            DomainErrorCode.PROJECT_NOT_FOUND,
            `Project with id ${id} not found`,
          );
        }

        // 2. Check project is in draft status
        if (project.lifecycleStatus !== 'draft') {
          issues.push({
            entityType: 'Project',
            entityName: project.name,
            issue: `Project is in "${project.lifecycleStatus}" status. Only Draft projects can be published.`,
          });
          // Return early — other checks are not relevant if not in draft
          res.status(200).json({ valid: false, issues });
          return;
        }

        // 3. Fetch all epics for this project
        const epics = await epicRepo.findAllByProject(tenantId, id);

        // 4. Check at least one epic exists
        if (epics.length === 0) {
          issues.push({
            entityType: 'Project',
            entityName: project.name,
            issue: 'No epics defined. At least one epic is required before publishing.',
          });
        }

        // 5. Check all epics are in 'ready' workStatus
        for (const epic of epics) {
          if (epic.workStatus !== 'ready') {
            issues.push({
              entityType: 'Epic',
              entityName: epic.name,
              issue: `Work status is "${epic.workStatus}" (must be "ready")`,
            });
          }
        }

        // 6. Check each epic has at least one story
        for (const epic of epics) {
          const stories = await storyRepo.findAllByEpic(tenantId, epic.id);

          if (stories.length === 0) {
            issues.push({
              entityType: 'Epic',
              entityName: epic.name,
              issue: 'No stories defined. Each epic must have at least one story.',
            });
          }

          // 7. Check each story has at least one task
          for (const story of stories) {
            const storyWithTasks = await storyRepo.findWithTaskCount(tenantId, story.id);
            if (storyWithTasks && storyWithTasks.taskCount === 0) {
              issues.push({
                entityType: 'Story',
                entityName: story.title,
                issue: 'No tasks defined. Each story must have at least one task.',
              });
            }
          }
        }

        if (issues.length === 0) {
          res.status(200).json({ valid: true });
        } else {
          res.status(200).json({ valid: false, issues });
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
