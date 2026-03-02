# Implement Task CRUD Routes

## Task Details

- **Title:** Implement Task CRUD Routes
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Task API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement CRUD API routes for the Task entity. Tasks are the leaf nodes in the orchestration hierarchy (Project > Epic > Story > Task) and the nodes in the project-wide dependency DAG. Each task has a dependency list (references to other tasks it depends on), a persona reference, acceptance criteria, technical notes, and references. Tasks inherit the read-only constraint from their parent story.

### Route Definitions

```typescript
// pages/api/v1/tasks/index.ts
// Handles POST (create) and GET (list) for tasks.
// Tasks can be listed across stories (flat query with project filter)
// or scoped under a specific story.

/**
 * POST /api/v1/tasks
 * Create a new task.
 * Body: {
 *   story_id: string (UUID),
 *   name: string,
 *   description?: string,
 *   persona_id?: string (UUID),
 *   acceptance_criteria: string[],
 *   technical_notes?: string,
 *   references?: string[],
 *   dependency_ids?: string[] (task IDs this task depends on),
 *   sort_order?: number
 * }
 * Returns: 201 with created task
 * Throws: NotFoundError if parent story does not exist
 * Throws: ConflictError with READ_ONLY_VIOLATION if parent story is in-progress
 */

/**
 * GET /api/v1/tasks
 * List tasks with filters.
 * Query: { project_id, story_id?, status?, persona_id?, page, limit, sort_by, sort_order }
 * Returns: 200 with paginated task list including dependency info
 */
```

```typescript
// pages/api/v1/tasks/[id].ts
// Handles GET (detail), PATCH (update), DELETE (soft-delete) for a single task.

/**
 * GET /api/v1/tasks/:id
 * Get a single task with full details: dependencies (as task summaries),
 * dependents (tasks that depend on this one), persona details,
 * acceptance criteria, technical notes, references.
 * Returns: 200 with task data
 */

/**
 * PATCH /api/v1/tasks/:id
 * Update task fields. Cannot modify tasks whose parent story is in-progress.
 * If dependency_ids is updated, triggers DAG cycle detection.
 * Body: {
 *   name?: string,
 *   description?: string,
 *   persona_id?: string,
 *   acceptance_criteria?: string[],
 *   technical_notes?: string,
 *   references?: string[],
 *   dependency_ids?: string[],
 *   sort_order?: number
 * }
 * Returns: 200 with updated task
 * Throws: ConflictError with READ_ONLY_VIOLATION if parent story is in-progress
 * Throws: ValidationError with DAG_CYCLE_DETECTED if new dependencies create a cycle
 */

/**
 * DELETE /api/v1/tasks/:id
 * Soft-delete a task. Cleans up all dependency edges where this task
 * is either a dependency (to) or dependent (from).
 * Cannot delete tasks whose parent story is in-progress.
 * Returns: 204 No Content
 */
```

### Request Schemas

```typescript
// packages/shared/src/schemas/task.ts
// Zod schemas for task API request validation.

import { z } from "zod";

export const createTaskSchema = z.object({
  story_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  persona_id: z.string().uuid().optional(),
  acceptance_criteria: z.array(z.string().min(1).max(2000)).min(0).default([]),
  technical_notes: z.string().max(10000).optional(),
  references: z.array(z.string().url().max(2000)).max(20).default([]),
  dependency_ids: z.array(z.string().uuid()).max(50).default([]),
  sort_order: z.number().int().min(0).default(0),
});

export const updateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  persona_id: z.string().uuid().nullable().optional(),
  acceptance_criteria: z.array(z.string().min(1).max(2000)).optional(),
  technical_notes: z.string().max(10000).nullable().optional(),
  references: z.array(z.string().url().max(2000)).max(20).optional(),
  dependency_ids: z.array(z.string().uuid()).max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
});
```

## Acceptance Criteria

- [ ] `POST /api/v1/tasks` creates a task and returns 201
- [ ] `POST` validates parent story exists and is in an editable state
- [ ] `POST` creates dependency edges for provided `dependency_ids`
- [ ] `POST` triggers DAG cycle detection if `dependency_ids` is non-empty
- [ ] `GET /api/v1/tasks` returns paginated tasks with dependency info
- [ ] `GET` supports filtering by `project_id`, `story_id`, `status`, `persona_id`
- [ ] `GET /api/v1/tasks/:id` returns task with resolved dependencies (task summaries, not just IDs)
- [ ] `GET` detail includes dependents (tasks that depend on this task)
- [ ] `PATCH` updates allowed fields and respects read-only enforcement
- [ ] `PATCH` triggers DAG cycle detection when `dependency_ids` is modified
- [ ] `PATCH` replaces the full dependency list (not incremental add/remove) when `dependency_ids` is provided
- [ ] `DELETE` soft-deletes the task and removes all dependency edges
- [ ] `DELETE` respects read-only enforcement (cannot delete tasks in in-progress stories)
- [ ] All dependency IDs are validated to reference existing, non-deleted tasks within the same project
- [ ] Cross-story dependencies within the same project are allowed
- [ ] Cross-project dependencies are rejected with a clear error message
- [ ] No `any` types are used in the implementation

## Technical Notes

- Tasks use a flat URL structure (`/api/v1/tasks`) rather than deeply nested under stories because tasks can have cross-story dependencies. The `story_id` is provided in the request body for creation.
- The dependency list update uses a "replace all" strategy: the provided `dependency_ids` replaces the entire dependency list. This simplifies the API compared to incremental add/remove operations. The implementation should: (1) delete all existing edges for this task's `from`, (2) insert new edges, (3) run cycle detection. This must be atomic within a transaction.
- The GET detail endpoint resolves dependencies into task summaries (id, name, status) rather than just IDs, so the client can display meaningful dependency information without additional requests.
- The `acceptance_criteria` field is an array of strings stored as JSONB in PostgreSQL. Each string is a single criterion that will be displayed as a checklist item to the worker.

## References

- **Functional Requirements:** FR-TASK-001 (task CRUD), FR-TASK-002 (dependency management), FR-TASK-003 (read-only enforcement)
- **Design Specification:** Section 7.4 (Task API), Section 7.4.1 (Task CRUD Routes)
- **Database Schema:** tasks table, dependency_edges table in `@laila/database`
- **Domain Logic:** DAG cycle detection from `@laila/domain`

## Estimated Complexity

High — Task CRUD is the most complex entity due to dependency management, DAG validation, read-only enforcement inheritance, flat URL routing with cross-story queries, and the need to resolve dependency summaries in GET responses.
