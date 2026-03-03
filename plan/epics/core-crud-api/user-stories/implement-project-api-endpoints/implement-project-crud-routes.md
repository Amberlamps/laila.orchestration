# Implement Project CRUD Routes

## Task Details

- **Title:** Implement Project CRUD Routes
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Project API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Implement the standard CRUD API routes for the Project entity under `pages/api/v1/projects/`. Projects are the top-level container in the orchestration hierarchy. They are created in Draft status and support pagination, filtering by status, and hard-delete with cascade.

### Route Definitions

```typescript
// pages/api/v1/projects/index.ts
// Handles POST (create) and GET (list) for projects.
// Requires human auth (Google OAuth session via Better Auth).
// Uses withErrorHandler, withAuth, and withValidation composition.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withAuth } from '@/lib/api/auth';
import { withValidation } from '@/lib/api/validation';
import { createProjectSchema, projectListQuerySchema } from '@laila/shared';
import { projectRepository } from '@laila/database';

/**
 * POST /api/v1/projects
 * Create a new project in Draft status.
 * Body: { name: string, description?: string, timeout_duration_minutes?: number }
 * Returns: 201 with created project
 */

/**
 * GET /api/v1/projects
 * List all projects for the authenticated user.
 * Query: { page, limit, status?, sort_by?, sort_order? }
 * Returns: 200 with { data: Project[], pagination: { page, limit, total, totalPages } }
 */
```

```typescript
// pages/api/v1/projects/[id].ts
// Handles GET (detail), PATCH (update), DELETE (hard-delete) for a single project.
// Requires human auth. Project ID from route parameter.

/**
 * GET /api/v1/projects/:id
 * Get a single project by ID with summary statistics
 * (epic count, story count, completion percentage).
 * Returns: 200 with project data
 * Throws: NotFoundError if project does not exist
 */

/**
 * PATCH /api/v1/projects/:id
 * Update project fields (name, description, timeout_duration_minutes).
 * Only allowed when project is in Draft status.
 * Returns: 200 with updated project
 * Throws: ConflictError with READ_ONLY_VIOLATION if project is not in Draft
 */

/**
 * DELETE /api/v1/projects/:id
 * Hard-delete a project and all child entities (epics, stories, tasks, edges).
 * Returns: 204 No Content
 * Throws: NotFoundError if project does not exist
 */
```

### Pagination Response Shape

```typescript
// Standard paginated list response used by all list endpoints.
// The pagination metadata enables clients to navigate through results.

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Request Schemas

```typescript
// packages/shared/src/schemas/project.ts
// Zod schemas for project API request validation.

import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  timeout_duration_minutes: z.number().int().min(5).max(10080).default(60),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  timeout_duration_minutes: z.number().int().min(5).max(10080).optional(),
});

export const projectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'ready', 'in_progress', 'completed']).optional(),
  sort_by: z.enum(['name', 'created_at', 'updated_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});
```

## Acceptance Criteria

- [ ] `POST /api/v1/projects` creates a project in Draft status and returns 201 with the created project
- [ ] `POST /api/v1/projects` validates the request body using `createProjectSchema` from `@laila/shared`
- [ ] `GET /api/v1/projects` returns a paginated list of projects for the authenticated user
- [ ] `GET /api/v1/projects` supports filtering by `status` query parameter
- [ ] `GET /api/v1/projects` supports pagination with `page` and `limit` query parameters
- [ ] `GET /api/v1/projects` supports sorting by `name`, `created_at`, `updated_at` with configurable order
- [ ] `GET /api/v1/projects/:id` returns a single project with summary statistics (epic count, story count, completion percentage)
- [ ] `GET /api/v1/projects/:id` returns 404 with `PROJECT_NOT_FOUND` code when project does not exist
- [ ] `PATCH /api/v1/projects/:id` updates allowed fields and returns 200 with the updated project
- [ ] `PATCH /api/v1/projects/:id` returns 409 with `READ_ONLY_VIOLATION` if the project is not in Draft status
- [ ] `DELETE /api/v1/projects/:id` hard-deletes the project and all child entities (cascade)
- [ ] `DELETE /api/v1/projects/:id` returns 204 No Content on success
- [ ] All routes require human authentication via Better Auth session
- [ ] All routes use `withErrorHandler`, `withAuth`, and `withValidation` middleware composition
- [ ] All routes use the project repository from `@laila/database` for database operations
- [ ] No `any` types are used in the implementation

## Technical Notes

- Use Drizzle ORM's `db.transaction()` for the hard-delete cascade to ensure atomicity — deleting dependency edges, tasks, stories, epics, and finally the project in a single transaction.
- The project list endpoint should use Drizzle's `count()` aggregate for the total count in a separate query (or a window function) to avoid loading all rows into memory.
- The `timeout_duration_minutes` field on the project determines how long a worker can hold a story before it is reclaimed by the timeout checker.
- Next.js Pages Router route files use `req.method` to dispatch to the appropriate handler within a single file, or use separate files with dynamic route segments.

## References

- **Functional Requirements:** FR-PROJ-001 (project CRUD), FR-PROJ-002 (project listing with pagination)
- **Design Specification:** Section 7.1 (Project API), Section 7.1.1 (Project CRUD Routes)
- **Database Schema:** projects table in `@laila/database`
- **OpenAPI Specification:** /api/v1/projects endpoints

## Estimated Complexity

Medium — Standard CRUD with pagination, filtering, and cascade delete. The cascade delete requires a multi-table transaction.
