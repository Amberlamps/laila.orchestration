/**
 * TanStack Query hooks for all entity types in the orchestration dashboard.
 *
 * Each entity type exposes a consistent set of hooks:
 * - `use{Entity}s`       — Paginated list with optional filters
 * - `use{Entity}`        — Single entity detail by ID
 * - `useCreate{Entity}`  — Create mutation with list cache invalidation
 * - `useUpdate{Entity}`  — Update mutation with detail + list invalidation
 * - `useDelete{Entity}`  — Delete mutation with cache removal + list invalidation
 *
 * All hooks use:
 * - `apiClient` from openapi-fetch for compile-time type safety
 * - `queryKeys` factory for consistent, invalidation-friendly cache keys
 *
 * @see {@link ./query-keys.ts} for the cache key hierarchy
 * @see {@link ./api-client.ts} for the underlying HTTP client
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from './api-client';
import { queryKeys } from './query-keys';

import type { components } from '@laila/api-spec';

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

/**
 * Wraps an openapi-fetch error response in a proper Error instance.
 * The structured error body is preserved on the `cause` property for
 * downstream consumers that need the error code or field-level details.
 */
class ApiError extends Error {
  constructor(body: unknown) {
    const message =
      body !== null &&
      typeof body === 'object' &&
      'error' in body &&
      body.error !== null &&
      typeof body.error === 'object' &&
      'message' in body.error &&
      typeof body.error.message === 'string'
        ? body.error.message
        : 'API request failed';
    super(message, { cause: body });
    this.name = 'ApiError';
  }
}

/** Throws an ApiError wrapping the openapi-fetch error response body. */
const throwApiError = (error: unknown): never => {
  throw new ApiError(error);
};

// ===========================================================================
// Projects
// ===========================================================================

/** Fetches a paginated list of projects with optional filters. */
export const useProjects = (params?: Record<string, unknown>) =>
  useQuery({
    queryKey: queryKeys.projects.list(params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/projects', {
        params: params ? { query: params } : {},
      });
      if (error) throwApiError(error);
      return data;
    },
  });

/** Fetches a single project by ID. Disabled when projectId is falsy. */
export const useProject = (projectId: string) =>
  useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/projects/{projectId}', {
        params: { path: { projectId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!projectId,
  });

/** Creates a new project and invalidates all project list caches. */
export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['CreateProject']) => {
      const { data, error } = await apiClient.POST('/projects', { body });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
};

/** Updates a project and invalidates its detail and all list caches. */
export const useUpdateProject = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateProject']) => {
      const { data, error } = await apiClient.PATCH('/projects/{projectId}', {
        params: { path: { projectId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
};

// ---------------------------------------------------------------------------
// Project Validation & Publishing
// ---------------------------------------------------------------------------

/** Deletes a project, removes its detail cache, and invalidates list caches. */
export const useDeleteProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await apiClient.DELETE('/projects/{projectId}', {
        params: { path: { projectId } },
      });
      if (error) throwApiError(error);
    },
    onSuccess: (_data, projectId) => {
      queryClient.removeQueries({ queryKey: queryKeys.projects.detail(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
};

/** Validates a project for publishing without changing state. */
export const useValidateProject = () => {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data, error } = await apiClient.POST('/projects/{projectId}/validate', {
        params: { path: { projectId } },
      });
      if (error) throwApiError(error);
      return data as {
        valid: boolean;
        issues?: Array<{ entityType: string; entityName: string; issue: string }>;
      };
    },
  });
};

/** Publishes a project (transitions from Draft to Ready). */
export const usePublishProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data, error } = await apiClient.POST('/projects/{projectId}/publish', {
        params: { path: { projectId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: (_data, projectId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
};

// ===========================================================================
// Epics (scoped under a project)
// ===========================================================================

/** Fetches a paginated list of epics for a project with optional filters. */
export const useEpics = (projectId: string, params?: Record<string, unknown>) =>
  useQuery({
    queryKey: queryKeys.epics.list(projectId, params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/projects/{projectId}/epics', {
        params: {
          path: { projectId },
          ...(params ? { query: params } : {}),
        },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!projectId,
  });

/** Fetches a single epic by ID. Disabled when epicId is falsy. */
export const useEpic = (epicId: string) =>
  useQuery({
    queryKey: queryKeys.epics.detail(epicId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/epics/{epicId}', {
        params: { path: { epicId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!epicId,
  });

/** Creates a new epic under a project and invalidates epic list caches. */
export const useCreateEpic = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['CreateEpic']) => {
      const { data, error } = await apiClient.POST('/projects/{projectId}/epics', {
        params: { path: { projectId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics.lists(projectId) });
    },
  });
};

/** Updates an epic and invalidates its detail and the parent project's list caches. */
export const useUpdateEpic = (epicId: string, projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateEpic']) => {
      const { data, error } = await apiClient.PATCH('/epics/{epicId}', {
        params: { path: { epicId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics.detail(epicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics.lists(projectId) });
    },
  });
};

/** Deletes an epic, removes its detail cache, and invalidates list caches. */
export const useDeleteEpic = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (epicId: string) => {
      const { error } = await apiClient.DELETE('/epics/{epicId}', {
        params: { path: { epicId } },
      });
      if (error) throwApiError(error);
    },
    onSuccess: (_data, epicId) => {
      queryClient.removeQueries({ queryKey: queryKeys.epics.detail(epicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics.lists(projectId) });
    },
  });
};

// ===========================================================================
// Stories (scoped under an epic)
// ===========================================================================

/** Fetches a paginated list of stories for an epic with optional filters. */
export const useStories = (epicId: string, params?: Record<string, unknown>) =>
  useQuery({
    queryKey: queryKeys.stories.list(epicId, params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/epics/{epicId}/stories', {
        params: {
          path: { epicId },
          ...(params ? { query: params } : {}),
        },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!epicId,
  });

/** Fetches a single story by ID. Disabled when storyId is falsy. */
export const useStory = (storyId: string) =>
  useQuery({
    queryKey: queryKeys.stories.detail(storyId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/stories/{storyId}', {
        params: { path: { storyId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!storyId,
  });

/** Creates a new story under an epic and invalidates story list caches. */
export const useCreateStory = (epicId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['CreateUserStory']) => {
      const { data, error } = await apiClient.POST('/epics/{epicId}/stories', {
        params: { path: { epicId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.lists(epicId) });
    },
  });
};

/** Updates a story and invalidates its detail and the parent epic's list caches. */
export const useUpdateStory = (storyId: string, epicId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateUserStory']) => {
      const { data, error } = await apiClient.PATCH('/stories/{storyId}', {
        params: { path: { storyId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(storyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.lists(epicId) });
    },
  });
};

/** Deletes a story, removes its detail cache, and invalidates list caches. */
export const useDeleteStory = (epicId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyId: string) => {
      const { error } = await apiClient.DELETE('/stories/{storyId}', {
        params: { path: { storyId } },
      });
      if (error) throwApiError(error);
    },
    onSuccess: (_data, storyId) => {
      queryClient.removeQueries({ queryKey: queryKeys.stories.detail(storyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.lists(epicId) });
    },
  });
};

// ===========================================================================
// Tasks (scoped under a story)
// ===========================================================================

/** Fetches a paginated list of tasks for a story with optional filters. */
export const useTasks = (storyId: string, params?: Record<string, unknown>) =>
  useQuery({
    queryKey: queryKeys.tasks.list(storyId, params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/stories/{storyId}/tasks', {
        params: {
          path: { storyId },
          ...(params ? { query: params } : {}),
        },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!storyId,
  });

/** Fetches a single task by ID. Disabled when taskId is falsy. */
export const useTask = (taskId: string) =>
  useQuery({
    queryKey: queryKeys.tasks.detail(taskId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/tasks/{taskId}', {
        params: { path: { taskId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!taskId,
  });

/** Creates a new task under a story and invalidates task list caches. */
export const useCreateTask = (storyId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['CreateTask']) => {
      const { data, error } = await apiClient.POST('/stories/{storyId}/tasks', {
        params: { path: { storyId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists(storyId) });
    },
  });
};

/** Updates a task and invalidates its detail and the parent story's list caches. */
export const useUpdateTask = (taskId: string, storyId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateTask']) => {
      const { data, error } = await apiClient.PATCH('/tasks/{taskId}', {
        params: { path: { taskId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists(storyId) });
    },
  });
};

/** Deletes a task, removes its detail cache, and invalidates list caches. */
export const useDeleteTask = (storyId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await apiClient.DELETE('/tasks/{taskId}', {
        params: { path: { taskId } },
      });
      if (error) throwApiError(error);
    },
    onSuccess: (_data, taskId) => {
      queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists(storyId) });
    },
  });
};

// ===========================================================================
// Workers (top-level entity)
// ===========================================================================

/** Fetches a paginated list of workers with optional filters. */
export const useWorkers = (params?: Record<string, unknown>) =>
  useQuery({
    queryKey: queryKeys.workers.list(params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/workers', {
        params: params ? { query: params } : {},
      });
      if (error) throwApiError(error);
      return data;
    },
  });

/** Fetches a single worker by ID. Disabled when workerId is falsy. */
export const useWorker = (workerId: string) =>
  useQuery({
    queryKey: queryKeys.workers.detail(workerId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/workers/{workerId}', {
        params: { path: { workerId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!workerId,
  });

/** Creates a new worker and invalidates all worker list caches. */
export const useCreateWorker = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['CreateWorker']) => {
      const { data, error } = await apiClient.POST('/workers', { body });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.lists() });
    },
  });
};

/** Updates a worker and invalidates its detail and all list caches. */
export const useUpdateWorker = (workerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['UpdateWorker']) => {
      const { data, error } = await apiClient.PATCH('/workers/{workerId}', {
        params: { path: { workerId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.detail(workerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.lists() });
    },
  });
};

/** Deletes a worker, removes its detail cache, and invalidates list caches. */
export const useDeleteWorker = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await apiClient.DELETE('/workers/{workerId}', {
        params: { path: { workerId } },
      });
      if (error) throwApiError(error);
    },
    onSuccess: (_data, workerId) => {
      queryClient.removeQueries({ queryKey: queryKeys.workers.detail(workerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.lists() });
    },
  });
};

// ===========================================================================
// Personas (top-level entity)
// ===========================================================================

/** Fetches a paginated list of personas with optional filters. */
export const usePersonas = (params?: Record<string, unknown>) =>
  useQuery({
    queryKey: queryKeys.personas.list(params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/personas', {
        params: params ? { query: params } : {},
      });
      if (error) throwApiError(error);
      return data;
    },
  });

/** Fetches a single persona by ID. Disabled when personaId is falsy. */
export const usePersona = (personaId: string) =>
  useQuery({
    queryKey: queryKeys.personas.detail(personaId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/personas/{personaId}', {
        params: { path: { personaId } },
      });
      if (error) throwApiError(error);
      return data;
    },
    enabled: !!personaId,
  });

/** Creates a new persona and invalidates all persona list caches. */
export const useCreatePersona = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['CreatePersona']) => {
      const { data, error } = await apiClient.POST('/personas', { body });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.personas.lists() });
    },
  });
};

/** Updates a persona and invalidates its detail and all list caches. */
export const useUpdatePersona = (personaId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: components['schemas']['UpdatePersona']) => {
      const { data, error } = await apiClient.PATCH('/personas/{personaId}', {
        params: { path: { personaId } },
        body,
      });
      if (error) throwApiError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.personas.detail(personaId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personas.lists() });
    },
  });
};

/** Deletes a persona, removes its detail cache, and invalidates list caches. */
export const useDeletePersona = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (personaId: string) => {
      const { error } = await apiClient.DELETE('/personas/{personaId}', {
        params: { path: { personaId } },
      });
      if (error) throwApiError(error);
    },
    onSuccess: (_data, personaId) => {
      queryClient.removeQueries({ queryKey: queryKeys.personas.detail(personaId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.personas.lists() });
    },
  });
};
