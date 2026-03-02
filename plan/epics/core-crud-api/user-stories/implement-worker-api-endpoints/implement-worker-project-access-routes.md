# Implement Worker Project Access Routes

## Task Details

- **Title:** Implement Worker Project Access Routes
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Worker API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Worker CRUD Routes

## Description

Implement endpoints for managing worker project access. Workers must be explicitly granted access to specific projects before they can request work assignments. This access control layer prevents workers from being assigned to projects they are not authorized for.

### Route Definitions

```typescript
// pages/api/v1/workers/[id]/projects/[projectId].ts
// Handles POST (grant access) and DELETE (revoke access) for worker project access.
// Requires human auth.

/**
 * POST /api/v1/workers/:id/projects/:projectId
 * Grant a worker access to a project.
 *
 * Pre-conditions:
 *   - Worker must exist
 *   - Project must exist
 *   - Access must not already be granted (idempotent — returns 200 if already granted)
 *
 * Post-conditions:
 *   - Worker can now request work assignments for this project
 *
 * Returns: 200 with { worker_id, project_id, granted_at }
 * Throws: NotFoundError if worker or project does not exist
 */

/**
 * DELETE /api/v1/workers/:id/projects/:projectId
 * Revoke a worker's access to a project.
 *
 * Pre-conditions:
 *   - Worker must have access to the project
 *   - If the worker has an in-progress story in this project,
 *     return 409 with ASSIGNMENT_CONFLICT (must unassign first)
 *
 * Post-conditions:
 *   - Worker can no longer request work assignments for this project
 *
 * Returns: 204 No Content
 * Throws: ConflictError with ASSIGNMENT_CONFLICT if worker has in-progress work
 */
```

```typescript
// pages/api/v1/workers/[id]/projects/index.ts
// Handles GET (list) for worker project access.

/**
 * GET /api/v1/workers/:id/projects
 * List all projects the worker has access to.
 * Returns: 200 with project list including access grant timestamp
 */
```

## Acceptance Criteria

- [ ] `POST /api/v1/workers/:id/projects/:projectId` grants project access to a worker
- [ ] Grant is idempotent (re-granting returns 200, not an error)
- [ ] Grant validates that both the worker and project exist
- [ ] `DELETE /api/v1/workers/:id/projects/:projectId` revokes project access
- [ ] Revoke returns 409 if the worker has in-progress work in the project
- [ ] Revoke returns 204 on success
- [ ] `GET /api/v1/workers/:id/projects` lists all projects the worker can access
- [ ] All routes require human authentication
- [ ] Access grant is stored in the worker_project_access join table
- [ ] No `any` types are used in the implementation

## Technical Notes

- The worker-project access table is a simple join table (`worker_id`, `project_id`, `granted_at`). It uses a composite unique constraint on `(worker_id, project_id)` to prevent duplicate entries.
- The idempotent grant behavior (returning 200 for re-grants) simplifies client logic — the client can call grant without checking if access already exists.
- The revoke guard (cannot revoke if in-progress work exists) prevents a scenario where a worker loses access mid-execution. The human must first unassign the story, then revoke access.
- This access control is checked by the work assignment endpoint (Epic 7) during eligibility evaluation.

## References

- **Functional Requirements:** FR-WORKER-003 (project access management)
- **Design Specification:** Section 7.5.2 (Worker Project Access)
- **Database Schema:** worker_project_access table in `@laila/database`

## Estimated Complexity

Low-Medium — Straightforward CRUD on a join table with some validation guards. The idempotent grant pattern simplifies the implementation.
