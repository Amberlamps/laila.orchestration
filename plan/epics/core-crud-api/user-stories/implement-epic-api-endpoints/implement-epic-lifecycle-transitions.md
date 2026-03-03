# Implement Epic Lifecycle Transitions

## Task Details

- **Title:** Implement Epic Lifecycle Transitions
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Epic API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Epic CRUD Routes

## Description

Implement the publish lifecycle transition for epics. An epic transitions from Draft to Ready when all its child user stories are in Ready status. The Ready status is the editorial lifecycle status (distinct from the derived work status). Once an epic is Ready, its parent project can be published.

### Transition Endpoint

```typescript
// pages/api/v1/projects/[projectId]/epics/[id]/publish.ts
// Transitions an epic from Draft to Ready status.
// Validates all child user stories are in Ready status before allowing transition.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/api/auth';
import { ValidationError, DomainErrorCode, ConflictError } from '@laila/shared';
import { epicRepository, storyRepository } from '@laila/database';

/**
 * POST /api/v1/projects/:projectId/epics/:id/publish
 *
 * Pre-conditions:
 *   - Epic must be in Draft status
 *   - Epic must have at least one user story
 *   - All user stories must be in Ready status
 *   - Parent project must still be in Draft status (cannot publish epic under published project)
 *
 * Post-conditions:
 *   - Epic editorial status changes to Ready
 *   - Epic is now eligible to participate in project publish validation
 *
 * Errors:
 *   - 404 EPIC_NOT_FOUND if epic does not exist
 *   - 409 INVALID_STATUS_TRANSITION if epic is not in Draft
 *   - 400 VALIDATION_FAILED if any user story is not Ready (includes list of non-ready stories)
 */
```

## Acceptance Criteria

- [ ] `POST /api/v1/projects/:projectId/epics/:id/publish` transitions a Draft epic to Ready
- [ ] Publish validates that the epic has at least one user story
- [ ] Publish validates that all child user stories are in Ready status
- [ ] Publish returns 400 with a list of non-ready story IDs/names if validation fails
- [ ] Publish returns 409 with `INVALID_STATUS_TRANSITION` if the epic is not in Draft
- [ ] Publish returns 404 with `EPIC_NOT_FOUND` if the epic does not exist
- [ ] Publish requires human authentication
- [ ] Publish updates the `updated_at` timestamp on the epic
- [ ] Publish uses domain logic from `@laila/domain` for status transition validation
- [ ] No `any` types are used in the implementation

## Technical Notes

- The epic has two status dimensions: editorial status (Draft/Ready) and work status (derived from children). The publish transition only affects the editorial status. The work status is always computed dynamically.
- Consider whether publishing an epic under an already-published project should be allowed. If the project is already in Ready or In Progress status, publishing additional epics may require re-validation at the project level. For v1, restrict epic publish to only when the parent project is in Draft.
- The validation error for non-ready stories should include structured details (story IDs and names) so the frontend can display actionable information.

## References

- **Functional Requirements:** FR-EPIC-003 (epic publish)
- **Design Specification:** Section 7.2.2 (Epic Lifecycle Transitions)
- **Domain Logic:** Status transition validation from `@laila/domain`

## Estimated Complexity

Low-Medium — Simpler than project publish since it only checks one level of children (stories). The main complexity is in the validation logic and error reporting.
