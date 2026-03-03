/**
 * @module @laila/shared/schemas/api
 *
 * Barrel export for all API request/response schemas.
 *
 * Organized by concern:
 * - **Entity CRUD schemas** -- create/update request bodies and single-item responses
 * - **List query schemas** -- pagination, sorting, and entity-specific filters
 * - **List response schemas** -- paginated arrays with metadata
 * - **Work assignment** -- discriminated union for orchestration protocol
 * - **Work completion** -- worker result reporting
 * - **API key management** -- key creation and summary
 */

// ---------------------------------------------------------------------------
// Entity create/update request schemas and single-item responses
// ---------------------------------------------------------------------------

export {
  createProjectSchema,
  type CreateProject,
  updateProjectSchema,
  type UpdateProject,
  projectResponseSchema,
  type ProjectResponse,
} from './project';

export {
  createEpicSchema,
  type CreateEpic,
  updateEpicSchema,
  type UpdateEpic,
  epicResponseSchema,
  type EpicResponse,
} from './epic';

export {
  createUserStorySchema,
  type CreateUserStory,
  updateUserStorySchema,
  type UpdateUserStory,
  userStoryResponseSchema,
  type UserStoryResponse,
} from './user-story';

export {
  createTaskSchema,
  type CreateTask,
  updateTaskSchema,
  type UpdateTask,
  taskResponseSchema,
  type TaskResponse,
} from './task';

export {
  createWorkerSchema,
  type CreateWorker,
  updateWorkerSchema,
  type UpdateWorker,
  updateWorkerBodySchema,
  type UpdateWorkerBody,
  deleteWorkerQuerySchema,
  type DeleteWorkerQuery,
  workerResponseSchema,
  type WorkerResponse,
} from './worker';

export {
  createPersonaSchema,
  type CreatePersona,
  updatePersonaSchema,
  type UpdatePersona,
  personaResponseSchema,
  type PersonaResponse,
} from './persona';

// ---------------------------------------------------------------------------
// List query parameter schemas (pagination + entity-specific filters)
// ---------------------------------------------------------------------------

export {
  sortOrderSchema,
  type SortOrder,
  paginationQuerySchema,
  type PaginationQuery,
  paginationMetaSchema,
  type PaginationMeta,
  listProjectsQuerySchema,
  type ListProjectsQuery,
  listEpicsQuerySchema,
  type ListEpicsQuery,
  listUserStoriesQuerySchema,
  type ListUserStoriesQuery,
  listTasksQuerySchema,
  type ListTasksQuery,
  listWorkersQuerySchema,
  type ListWorkersQuery,
  listPersonasQuerySchema,
  type ListPersonasQuery,
} from './list-queries';

// ---------------------------------------------------------------------------
// List response schemas (paginated data + metadata)
// ---------------------------------------------------------------------------

export {
  projectListResponseSchema,
  type ProjectListResponse,
  epicListResponseSchema,
  type EpicListResponse,
  userStoryListResponseSchema,
  type UserStoryListResponse,
  taskListResponseSchema,
  type TaskListResponse,
  workerListResponseSchema,
  type WorkerListResponse,
  personaListResponseSchema,
  type PersonaListResponse,
} from './list-responses';

// ---------------------------------------------------------------------------
// Work orchestration schemas
// ---------------------------------------------------------------------------

export { workAssignmentResponseSchema, type WorkAssignmentResponse } from './work-assignment';

export {
  workCompletionStatusSchema,
  type WorkCompletionStatus,
  workCompletionRequestSchema,
  type WorkCompletionRequest,
} from './work-completion';

// ---------------------------------------------------------------------------
// API key management schemas
// ---------------------------------------------------------------------------

export {
  createApiKeyRequestSchema,
  type CreateApiKeyRequest,
  createApiKeyResponseSchema,
  type CreateApiKeyResponse,
  apiKeySummarySchema,
  type ApiKeySummary,
} from './api-key';
