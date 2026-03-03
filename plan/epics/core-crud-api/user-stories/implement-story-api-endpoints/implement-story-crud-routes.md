# Implement Story CRUD Routes

## Task Details

- **Title:** Implement Story CRUD Routes
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement User Story API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement CRUD API routes for the User Story entity. User stories are scoped under an epic (within a project) and contain tasks. They are the unit of work assignment — workers are assigned a whole story and execute its tasks. Stories track priority, estimated and actual cost, assignment state, and enforce read-only constraints when the story is in progress.

### Route Definitions

```typescript
// pages/api/v1/projects/[projectId]/epics/[epicId]/stories/index.ts
// Handles POST (create) and GET (list) for user stories within an epic.
// Requires human auth for mutations, human or worker auth for reads.

/**
 * POST /api/v1/projects/:projectId/epics/:epicId/stories
 * Create a new user story in Draft status.
 * Body: {
 *   name: string,
 *   description?: string,
 *   priority: number (1-10, higher = more important),
 *   sort_order?: number
 * }
 * Returns: 201 with created story
 * Throws: NotFoundError if parent epic/project does not exist
 */

/**
 * GET /api/v1/projects/:projectId/epics/:epicId/stories
 * List all non-deleted user stories for the epic.
 * Query: { page, limit, status?, assigned_worker_id?, sort_by?, sort_order? }
 * Returns: 200 with paginated story list including task count and derived status
 */
```

```typescript
// pages/api/v1/projects/[projectId]/epics/[epicId]/stories/[id].ts
// Handles GET (detail), PATCH (update), DELETE (soft-delete) for a single story.

/**
 * GET /api/v1/projects/:projectId/epics/:epicId/stories/:id
 * Get a single story with full details: tasks, assignment info, cost, timing.
 * Returns: 200 with story data
 */

/**
 * PATCH /api/v1/projects/:projectId/epics/:epicId/stories/:id
 * Update story fields (name, description, priority, sort_order).
 * READ-ONLY ENFORCEMENT: Returns 409 if story is in-progress or completed.
 * Only allowed when the story status is draft, not-started, or blocked.
 * Returns: 200 with updated story
 * Throws: ConflictError with READ_ONLY_VIOLATION if story is in-progress or completed
 */

/**
 * DELETE /api/v1/projects/:projectId/epics/:epicId/stories/:id
 * Soft-delete a story and cascade to child tasks.
 * Sets deleted_at on story and all tasks.
 * Cleans up dependency edges referencing deleted tasks.
 * READ-ONLY ENFORCEMENT: Cannot delete in-progress stories.
 * Returns: 204 No Content
 */
```

### Request Schemas

```typescript
// packages/shared/src/schemas/story.ts
// Zod schemas for user story API request validation.

import { z } from 'zod';

export const createStorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  priority: z.number().int().min(1).max(10).default(5),
  sort_order: z.number().int().min(0).default(0),
});

export const updateStorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const storyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['draft', 'not_started', 'blocked', 'in_progress', 'completed', 'failed'])
    .optional(),
  assigned_worker_id: z.string().uuid().optional(),
  sort_by: z.enum(['name', 'priority', 'created_at', 'updated_at']).default('priority'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});
```

### Read-Only Enforcement

```typescript
// apps/web/src/lib/api/guards/read-only-guard.ts
// Guard function that checks if a story (or its tasks) can be modified.
// Used by PATCH and DELETE handlers to enforce read-only constraints.
// Stories in "in_progress" or "completed" status are read-only.

import { ConflictError, DomainErrorCode } from '@laila/shared';

/**
 * Throws ConflictError if the story is in a read-only state.
 * A story is read-only when it is in-progress (assigned to a worker)
 * or completed (work is done and costs recorded).
 */
export function assertStoryEditable(storyStatus: string): void {
  const readOnlyStatuses = ['in_progress', 'completed'];
  if (readOnlyStatuses.includes(storyStatus)) {
    throw new ConflictError(
      DomainErrorCode.READ_ONLY_VIOLATION,
      `Cannot modify story in "${storyStatus}" status. The story is read-only while work is in progress or completed.`,
    );
  }
}
```

## Acceptance Criteria

- [ ] `POST` creates a story in Draft status with the specified priority
- [ ] `POST` validates that the parent project and epic exist
- [ ] `GET` list returns paginated, non-deleted stories with derived status and task count
- [ ] `GET` list supports filtering by `status` and `assigned_worker_id`
- [ ] `GET` list defaults to sorting by priority descending (highest priority first)
- [ ] `GET` detail returns story with full details including assignment info and cost
- [ ] `PATCH` updates allowed fields when story is in an editable state
- [ ] `PATCH` returns 409 with `READ_ONLY_VIOLATION` when story is in-progress or completed
- [ ] `DELETE` soft-deletes story and cascades to child tasks
- [ ] `DELETE` cleans up dependency edges for deleted tasks
- [ ] `DELETE` returns 409 with `READ_ONLY_VIOLATION` when story is in-progress
- [ ] All routes validate UUID parameters (projectId, epicId, id)
- [ ] All routes require human authentication for mutations
- [ ] Cost fields (cost_usd, cost_tokens) are read-only from CRUD endpoints (set only via completion)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The priority field (1-10) is used by the work assignment engine to select the next story for a worker. Higher priority stories are assigned first.
- Cost fields (`cost_usd`, `cost_tokens`) are set by the worker when completing a story via the completion endpoint (Epic 7). They are not editable via the PATCH endpoint. They should be included in GET responses but rejected if included in PATCH body.
- The read-only guard is extracted as a reusable function because it is also needed for task endpoints (tasks within an in-progress story are read-only).
- Consider adding a `GET /api/v1/stories?project_id=X` flat endpoint (without epic nesting) for cross-epic story queries. This is useful for the orchestration engine which needs to find eligible stories across all epics.

## References

- **Functional Requirements:** FR-STORY-001 (story CRUD), FR-STORY-002 (read-only enforcement), FR-STORY-003 (priority-based ordering)
- **Design Specification:** Section 7.3 (Story API), Section 7.3.1 (Story CRUD Routes), Section 7.3.3 (Read-Only Enforcement)
- **Database Schema:** stories table in `@laila/database`

## Estimated Complexity

High — More complex than project/epic CRUD due to read-only enforcement, priority handling, assignment state tracking, and the need to exclude cost fields from PATCH. The deep nesting (project > epic > story) adds parameter validation complexity.
