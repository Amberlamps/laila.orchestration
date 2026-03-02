/**
 * @module @laila/shared/schemas/api/list-responses
 *
 * Zod schemas for paginated list API responses. Each list response
 * wraps an array of entity items with pagination metadata so clients
 * can implement page navigation.
 *
 * All list responses follow the same structure:
 *   { data: Entity[], pagination: PaginationMeta }
 */

import { z } from 'zod';

import { epicSchema } from '../epic';
import { personaSchema } from '../persona';
import { projectSchema } from '../project';
import { taskSchema } from '../task';
import { userStorySchema } from '../user-story';
import { workerSchema } from '../worker';

import { paginationMetaSchema } from './list-queries';

/**
 * Helper to create a paginated list response schema for a given entity.
 *
 * Every list endpoint returns:
 * - `data` -- array of entity items for the current page
 * - `pagination` -- metadata with page, limit, totalItems, totalPages
 */
const createListResponseSchema = <T extends z.ZodTypeAny>(entitySchema: T) =>
  z.object({
    data: z.array(entitySchema),
    pagination: paginationMetaSchema,
  });

/**
 * Paginated list response for projects (GET /api/v1/projects).
 */
export const projectListResponseSchema = createListResponseSchema(projectSchema);

/** Inferred TypeScript type for paginated project list response */
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;

/**
 * Paginated list response for epics (GET /api/v1/epics).
 */
export const epicListResponseSchema = createListResponseSchema(epicSchema);

/** Inferred TypeScript type for paginated epic list response */
export type EpicListResponse = z.infer<typeof epicListResponseSchema>;

/**
 * Paginated list response for user stories (GET /api/v1/user-stories).
 */
export const userStoryListResponseSchema = createListResponseSchema(userStorySchema);

/** Inferred TypeScript type for paginated user story list response */
export type UserStoryListResponse = z.infer<typeof userStoryListResponseSchema>;

/**
 * Paginated list response for tasks (GET /api/v1/tasks).
 */
export const taskListResponseSchema = createListResponseSchema(taskSchema);

/** Inferred TypeScript type for paginated task list response */
export type TaskListResponse = z.infer<typeof taskListResponseSchema>;

/**
 * Paginated list response for workers (GET /api/v1/workers).
 */
export const workerListResponseSchema = createListResponseSchema(workerSchema);

/** Inferred TypeScript type for paginated worker list response */
export type WorkerListResponse = z.infer<typeof workerListResponseSchema>;

/**
 * Paginated list response for personas (GET /api/v1/personas).
 */
export const personaListResponseSchema = createListResponseSchema(personaSchema);

/** Inferred TypeScript type for paginated persona list response */
export type PersonaListResponse = z.infer<typeof personaListResponseSchema>;
