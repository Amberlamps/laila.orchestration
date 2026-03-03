/**
 * API route for validating an epic before publishing.
 *
 * POST /api/v1/projects/:projectId/epics/:epicId/validate
 *
 * Validates all child entities without changing epic state.
 * Returns a list of validation issues that must be resolved before
 * the epic can be published.
 *
 * Checks performed:
 *   1. Epic must be in pending (Draft) workStatus
 *   2. Parent project must be in draft lifecycle status
 *   3. Epic must have at least one user story
 *   4. All stories must be in 'ready' workStatus
 *   5. All stories must have at least one task
 *
 * Response:
 *   - 200 { valid: true }  when all checks pass
 *   - 200 { valid: false, issues: ValidationIssue[] }  when issues found
 *   - 404 EPIC_NOT_FOUND if epic does not exist
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

const epicParamsSchema = z.object({
  id: z.string().uuid(),
  epicId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/projects/:projectId/epics/:epicId/validate
// ---------------------------------------------------------------------------

const handleValidate = withErrorHandler(
  withAuth(
    'human',
    withValidation({ params: epicParamsSchema })(
      async (req: NextApiRequest, res: NextApiResponse, data) => {
        const { tenantId } = (req as AuthenticatedRequest).auth;
        const { id: projectId, epicId } = data.params;

        const db = getDb();
        const projectRepo = createProjectRepository(db);
        const epicRepo = createEpicRepository(db);
        const storyRepo = createStoryRepository(db);

        const issues: ValidationIssue[] = [];

        // 1. Fetch the epic and verify it belongs to the project
        const epic = await epicRepo.findById(tenantId, epicId);
        if (!epic || epic.projectId !== projectId) {
          throw new NotFoundError(
            DomainErrorCode.EPIC_NOT_FOUND,
            `Epic with id ${epicId} not found`,
          );
        }

        // 2. Check epic is in draft (pending) status
        if (epic.workStatus !== 'pending') {
          issues.push({
            entityType: 'Epic',
            entityName: epic.name,
            issue: `Epic is in "${String(epic.workStatus)}" status. Only Draft epics can be published.`,
          });
          // Return early — other checks are not relevant if not in draft
          res.status(200).json({ valid: false, issues });
          return;
        }

        // 3. Check parent project is in draft lifecycle status
        const project = await projectRepo.findById(tenantId, projectId);
        if (project && project.lifecycleStatus !== 'draft') {
          issues.push({
            entityType: 'Project',
            entityName: String(project.name),
            issue: `Parent project is in "${String(project.lifecycleStatus)}" status. Epic can only be published when project is in Draft status.`,
          });
        }

        // 4. Fetch all stories for this epic
        const stories = await storyRepo.findAllByEpic(tenantId, epicId);

        // 5. Check at least one story exists
        if (stories.length === 0) {
          issues.push({
            entityType: 'Epic',
            entityName: epic.name,
            issue: 'No stories defined. At least one story is required before publishing.',
          });
        }

        // 6. Check all stories are in 'ready' workStatus
        for (const story of stories) {
          if (story.workStatus !== 'ready') {
            issues.push({
              entityType: 'Story',
              entityName: story.title,
              issue: `Work status is "${story.workStatus}" (must be "ready"). Story must be ready before the epic can be published.`,
            });
          }
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
