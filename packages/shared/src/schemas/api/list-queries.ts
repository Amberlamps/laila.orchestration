/**
 * @module @laila/shared/schemas/api/list-queries
 *
 * Zod schemas for list endpoint query parameters. Provides a reusable
 * base pagination schema and entity-specific list query schemas.
 *
 * Numeric query fields use `z.coerce.number()` to parse string inputs
 * from HTTP query strings automatically.
 */

import { z } from 'zod';

import { DEFAULT_PAGINATION_LIMIT, MAX_PAGINATION_LIMIT } from '../../constants/api';
import { prioritySchema } from '../../constants/priority';
import { projectLifecycleStatusSchema, workStatusSchema } from '../../constants/status';

// ---------------------------------------------------------------------------
// Sort order enum -- shared across all list endpoints
// ---------------------------------------------------------------------------

/** Valid sort directions for list query ordering */
export const sortOrderSchema = z.enum(['asc', 'desc']);

/** Inferred TypeScript type for sort order */
export type SortOrder = z.infer<typeof sortOrderSchema>;

// ---------------------------------------------------------------------------
// Base pagination schema -- reused by all list query schemas
// ---------------------------------------------------------------------------

/**
 * Base query parameters shared by every list endpoint.
 *
 * - `page` starts at 1 (first page) with a minimum of 1
 * - `limit` controls items per page, clamped between 1 and MAX_PAGINATION_LIMIT
 * - `sortBy` is a free-form string (validated per-entity at the service layer)
 * - `sortOrder` is either 'asc' or 'desc'
 */
export const paginationQuerySchema = z.object({
  /** Page number (1-indexed). Defaults to 1. */
  page: z.coerce.number().int().min(1).default(1),

  /** Number of items per page. Defaults to DEFAULT_PAGINATION_LIMIT. */
  limit: z.coerce.number().int().min(1).max(MAX_PAGINATION_LIMIT).default(DEFAULT_PAGINATION_LIMIT),

  /** Field name to sort results by. Defaults to 'createdAt'. */
  sortBy: z.string().min(1).max(100).default('createdAt'),

  /** Sort direction. Defaults to 'desc' (newest first). */
  sortOrder: sortOrderSchema.default('desc'),
});

/** Inferred TypeScript type for base pagination query parameters */
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ---------------------------------------------------------------------------
// Pagination response metadata -- included in every list response
// ---------------------------------------------------------------------------

/**
 * Pagination metadata returned alongside list data arrays.
 *
 * Provides enough information for clients to implement page navigation
 * without requiring additional API calls.
 */
export const paginationMetaSchema = z.object({
  /** Current page number (1-indexed) */
  page: z.number().int().positive(),

  /** Number of items per page */
  limit: z.number().int().positive(),

  /** Total number of items matching the query (before pagination) */
  total: z.number().int().nonnegative(),

  /** Total number of pages available */
  totalPages: z.number().int().nonnegative(),

  /** Whether a next page exists */
  hasNext: z.boolean(),

  /** Whether a previous page exists */
  hasPrev: z.boolean(),
});

/** Inferred TypeScript type for pagination metadata */
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

// ---------------------------------------------------------------------------
// Entity-specific list query schemas
// ---------------------------------------------------------------------------

/**
 * Query parameters for listing projects (GET /api/v1/projects).
 *
 * Extends base pagination with project-specific filters:
 * - `status` filters by project lifecycle status
 */
export const listProjectsQuerySchema = paginationQuerySchema.extend({
  /** Filter by project lifecycle status */
  status: projectLifecycleStatusSchema.optional(),
});

/** Inferred TypeScript type for list projects query parameters */
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

/** Query parameters for listing epics (GET /api/v1/epics). */
export const listEpicsQuerySchema = paginationQuerySchema.extend({
  /** Filter epics belonging to a specific project */
  projectId: z.string().uuid().optional(),

  /** Filter by work item status */
  status: workStatusSchema.optional(),

  /** Filter by priority level */
  priority: prioritySchema.optional(),
});

/** Inferred TypeScript type for list epics query parameters */
export type ListEpicsQuery = z.infer<typeof listEpicsQuerySchema>;

/** Query parameters for listing user stories (GET /api/v1/user-stories). */
export const listUserStoriesQuerySchema = paginationQuerySchema.extend({
  /** Filter user stories belonging to a specific project */
  projectId: z.string().uuid().optional(),

  /** Filter user stories belonging to a specific epic */
  epicId: z.string().uuid().optional(),

  /** Filter by work item status */
  status: workStatusSchema.optional(),

  /** Filter by priority level */
  priority: prioritySchema.optional(),
});

/** Inferred TypeScript type for list user stories query parameters */
export type ListUserStoriesQuery = z.infer<typeof listUserStoriesQuerySchema>;

/** Query parameters for listing tasks (GET /api/v1/tasks). */
export const listTasksQuerySchema = paginationQuerySchema.extend({
  /** Filter tasks belonging to a specific project */
  projectId: z.string().uuid().optional(),

  /** Filter tasks belonging to a specific epic */
  epicId: z.string().uuid().optional(),

  /** Filter tasks belonging to a specific user story */
  userStoryId: z.string().uuid().optional(),

  /** Filter by work item status */
  status: workStatusSchema.optional(),

  /** Filter by priority level */
  priority: prioritySchema.optional(),

  /** Filter by persona (role/skill profile) */
  personaId: z.string().uuid().optional(),
});

/** Inferred TypeScript type for list tasks query parameters */
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

/** Query parameters for listing workers (GET /api/v1/workers). */
export const listWorkersQuerySchema = paginationQuerySchema.extend({
  /** Filter by active/inactive state */
  isActive: z.coerce.boolean().optional(),
});

/** Inferred TypeScript type for list workers query parameters */
export type ListWorkersQuery = z.infer<typeof listWorkersQuerySchema>;

/** Query parameters for listing personas (GET /api/v1/personas). */
export const listPersonasQuerySchema = paginationQuerySchema.extend({
  /** Filter personas belonging to a specific project */
  projectId: z.string().uuid().optional(),
});

/** Inferred TypeScript type for list personas query parameters */
export type ListPersonasQuery = z.infer<typeof listPersonasQuerySchema>;
