/**
 * @module repositories
 *
 * Repository implementations with tenant-scoped queries.
 *
 * Each repository provides a data access interface for a specific domain entity.
 * All queries enforce tenant isolation by requiring a `tenantId` parameter,
 * ensuring no cross-tenant data leakage.
 *
 * Repositories depend on the Drizzle ORM client from `../client.ts` and
 * table definitions from `../schema/`.
 */

export {
  // Factory
  createBaseRepository,
  type BaseRepository,

  // Error classes
  ConflictError,
  NotFoundError,
  ValidationError,

  // Types
  type BaseTable,
  type BaseTableColumns,
  type PaginatedResult,
  type FindManyOptions,
} from './base-repository';

export {
  // Factory
  createProjectRepository,
  type ProjectRepository,

  // Types
  type CreateProjectData,
  type UpdateProjectData,
  type FindProjectsOptions,
  type EpicStatusCount,
  type ProjectWithEpicCounts,
} from './project-repository';

export {
  // Factory
  createPersonaRepository,
  type PersonaRepository,

  // Types
  type Persona,
  type CreatePersonaData,
  type UpdatePersonaData,
  type PersonaWithTaskCounts,
} from './persona-repository';

export {
  // Factory
  createEpicRepository,
  type EpicRepository,

  // Types
  type EpicRecord,
  type FindByProjectOptions,
  type StoryCounts,
  type EpicWithStoryCounts,
} from './epic-repository';

export {
  // Factory
  createWorkerRepository,
  type WorkerRepository,

  // Types
  type Worker,
  type WorkerProjectAccess,
  type CreateWorkerData,
  type WorkerWithApiKey,
  type FindWorkersOptions,
  type PaginatedWorkers,
} from './worker-repository';

export {
  // Factory
  createStoryRepository,
  type StoryRepository,

  // Types
  type UserStory,
  type AttemptHistory,
  type CreateStoryData,
  type UpdateStoryData,
  type FindByEpicOptions,
} from './story-repository';

export {
  // Factory
  createTaskRepository,
  type TaskRepository,

  // Types
  type Task,
  type TaskDependencyEdge,
  type TaskGraph,
  type CreateTaskData,
  type UpdateTaskData,
} from './task-repository';
