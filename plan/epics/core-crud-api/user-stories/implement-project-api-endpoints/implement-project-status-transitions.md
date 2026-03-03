# Implement Project Status Transitions

## Task Details

- **Title:** Implement Project Status Transitions
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Project API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Project CRUD Routes

## Description

Implement lifecycle status transition endpoints for projects. A project follows the lifecycle: Draft -> Ready -> In Progress -> Completed. The publish and revert transitions are explicit actions triggered by the human user; the in-progress and completed transitions are system-driven based on child entity status changes.

### Transition Endpoints

```typescript
// pages/api/v1/projects/[id]/publish.ts
// Transitions a project from Draft to Ready status.
// Validates that all child epics are in Ready status before allowing the transition.
// This is the "launch" action — once a project is Ready, workers can be assigned.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/api/auth';
import { ValidationError, DomainErrorCode, ConflictError } from '@laila/shared';
import { projectRepository, epicRepository } from '@laila/database';

/**
 * POST /api/v1/projects/:id/publish
 *
 * Pre-conditions:
 *   - Project must be in Draft status
 *   - Project must have at least one epic
 *   - All epics must be in Ready status
 *
 * Post-conditions:
 *   - Project status changes to Ready
 *   - Project is now eligible for work assignment
 *
 * Errors:
 *   - 404 PROJECT_NOT_FOUND if project does not exist
 *   - 409 INVALID_STATUS_TRANSITION if project is not in Draft
 *   - 400 VALIDATION_FAILED if any epic is not Ready (includes list of non-ready epics)
 */
```

```typescript
// pages/api/v1/projects/[id]/revert.ts
// Reverts a project from Ready back to Draft status.
// Only allowed if no work has started (no stories in progress or completed).
// This is the "undo launch" action.

/**
 * POST /api/v1/projects/:id/revert
 *
 * Pre-conditions:
 *   - Project must be in Ready status
 *   - No user stories may be in-progress, completed, or failed
 *
 * Post-conditions:
 *   - Project status changes back to Draft
 *   - Editing is re-enabled on the project and its children
 *
 * Errors:
 *   - 404 PROJECT_NOT_FOUND if project does not exist
 *   - 409 INVALID_STATUS_TRANSITION if project is not in Ready
 *   - 409 STORY_IN_PROGRESS if any stories have started work
 */
```

## Acceptance Criteria

- [ ] `POST /api/v1/projects/:id/publish` transitions a Draft project to Ready
- [ ] Publish validates that the project has at least one epic
- [ ] Publish validates that all child epics are in Ready status
- [ ] Publish returns 400 with a list of non-ready epic IDs/names if validation fails
- [ ] Publish returns 409 with `INVALID_STATUS_TRANSITION` if the project is not in Draft
- [ ] `POST /api/v1/projects/:id/revert` transitions a Ready project back to Draft
- [ ] Revert validates that no user stories are in-progress, completed, or failed
- [ ] Revert returns 409 with `STORY_IN_PROGRESS` if any work has started
- [ ] Revert returns 409 with `INVALID_STATUS_TRANSITION` if the project is not in Ready
- [ ] Both endpoints return 404 with `PROJECT_NOT_FOUND` if the project does not exist
- [ ] Both endpoints require human authentication
- [ ] Both endpoints update the `updated_at` timestamp on the project
- [ ] Both endpoints use domain logic from `@laila/domain` for status transition validation
- [ ] No `any` types are used in the implementation

## Technical Notes

- The publish action is the most important gate in the system. It ensures that all structural work (defining epics, stories, tasks, and their dependencies) is complete before workers can be assigned. A project with incomplete children should never enter Ready status.
- The revert action is a safety valve that allows undoing a premature publish. It should be conservative — if any work has been done (even if all stories are still in "not-started"), the revert should be allowed. But if any story is "in-progress", "completed", or "failed", revert must be blocked.
- Consider using the status transition validation from `@laila/domain` (the `isValidTransition` function from the status transition engine) to validate that the transition is allowed at the domain level, and then performing the child validation checks in the API layer.
- The validation error for non-ready epics should include structured details so the frontend can highlight which epics need attention.

## References

- **Functional Requirements:** FR-PROJ-003 (project publish), FR-PROJ-004 (project revert)
- **Design Specification:** Section 7.1.2 (Project Lifecycle Transitions)
- **Domain Logic:** Status transition engine from `@laila/domain`

## Estimated Complexity

Medium — The publish validation requires querying all child epics and checking their statuses. The revert validation requires checking all descendant stories. Both are multi-query operations that benefit from efficient repository methods.
