# Implement Epic CRUD Routes

## Task Details

- **Title:** Implement Epic CRUD Routes
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Epic API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement CRUD API routes for the Epic entity under `pages/api/v1/projects/[projectId]/epics/`. Epics are scoped under a project and contain user stories. They are created in Draft status and have a derived work status computed from child story statuses. Epics support soft-delete (setting a `deleted_at` timestamp) with cascade to child stories and tasks.

### Route Definitions

```typescript
// pages/api/v1/projects/[projectId]/epics/index.ts
// Handles POST (create) and GET (list) for epics within a project.
// Requires human auth. Project ID from route parameter.

/**
 * POST /api/v1/projects/:projectId/epics
 * Create a new epic in Draft status within the specified project.
 * Body: { name: string, description?: string, sort_order?: number }
 * Returns: 201 with created epic
 * Throws: NotFoundError if parent project does not exist
 */

/**
 * GET /api/v1/projects/:projectId/epics
 * List all (non-deleted) epics for the specified project.
 * Query: { page, limit, status?, sort_by?, sort_order? }
 * Returns: 200 with paginated epic list, each including story count and derived work status
 */
```

```typescript
// pages/api/v1/projects/[projectId]/epics/[id].ts
// Handles GET (detail), PATCH (update), DELETE (soft-delete) for a single epic.

/**
 * GET /api/v1/projects/:projectId/epics/:id
 * Get a single epic with summary statistics (story count, task count, derived status).
 * Returns: 200 with epic data
 * Throws: NotFoundError if epic does not exist or is soft-deleted
 */

/**
 * PATCH /api/v1/projects/:projectId/epics/:id
 * Update epic fields (name, description, sort_order).
 * Only allowed when parent project is in Draft status.
 * Returns: 200 with updated epic
 * Throws: ConflictError with READ_ONLY_VIOLATION if parent project is not in Draft
 */

/**
 * DELETE /api/v1/projects/:projectId/epics/:id
 * Soft-delete an epic and cascade to child stories and tasks.
 * Sets deleted_at timestamp on epic and all children.
 * Also cleans up dependency edges referencing deleted tasks.
 * Returns: 204 No Content
 */
```

### Request Schemas

```typescript
// packages/shared/src/schemas/epic.ts
// Zod schemas for epic API request validation.

import { z } from 'zod';

export const createEpicSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateEpicSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const epicParamsSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid().optional(),
});
```

## Acceptance Criteria

- [ ] `POST /api/v1/projects/:projectId/epics` creates an epic in Draft status and returns 201
- [ ] `POST` validates the request body using `createEpicSchema`
- [ ] `POST` verifies the parent project exists and returns 404 if not
- [ ] `GET /api/v1/projects/:projectId/epics` returns a paginated list of non-deleted epics
- [ ] `GET` list includes derived work status for each epic (computed from child stories)
- [ ] `GET /api/v1/projects/:projectId/epics/:id` returns a single epic with summary statistics
- [ ] `GET` detail returns 404 for non-existent or soft-deleted epics
- [ ] `PATCH /api/v1/projects/:projectId/epics/:id` updates allowed fields
- [ ] `PATCH` returns 409 with `READ_ONLY_VIOLATION` if parent project is not in Draft
- [ ] `DELETE /api/v1/projects/:projectId/epics/:id` soft-deletes the epic and cascades
- [ ] `DELETE` cleans up dependency edges referencing tasks within the deleted epic
- [ ] `DELETE` returns 204 No Content on success
- [ ] All routes validate `projectId` and `id` as UUIDs
- [ ] All routes require human authentication
- [ ] Soft-deleted epics are excluded from list queries by default
- [ ] No `any` types are used in the implementation

## Technical Notes

- The soft-delete with cascade must be atomic. Use Drizzle's `db.transaction()` to set `deleted_at` on the epic, all its stories, all its tasks, and clean up dependency edges in a single transaction.
- The derived work status for an epic is computed from child story statuses using the domain logic engine's `deriveEpicStatus()` function. This should be computed at query time (not stored) to avoid synchronization issues.
- When cleaning up dependency edges on delete, only remove edges where the deleted task is either the `from` or `to` node. This may unblock other tasks in different epics — consider triggering a status re-evaluation for affected stories.
- The `sort_order` field allows manual ordering of epics within a project for display purposes.

## References

- **Functional Requirements:** FR-EPIC-001 (epic CRUD), FR-EPIC-002 (epic listing)
- **Design Specification:** Section 7.2 (Epic API), Section 7.2.1 (Epic CRUD Routes)
- **Database Schema:** epics table in `@laila/database`
- **Domain Logic:** `deriveEpicStatus()` from `@laila/domain`

## Estimated Complexity

Medium — Similar to project CRUD but with added complexity from the parent-child relationship validation, soft-delete cascade, and derived status computation.
