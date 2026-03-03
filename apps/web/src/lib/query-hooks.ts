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

// ---------------------------------------------------------------------------
// Epic Validation & Publishing
// ---------------------------------------------------------------------------

/** Validates an epic for publishing without changing state. */
export const useValidateEpic = () => {
  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      epicId: string;
    }): Promise<{
      valid: boolean;
      issues?: Array<{ entityType: string; entityName: string; issue: string }>;
    }> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(
        `${baseUrl}/v1/projects/${params.projectId}/epics/${params.epicId}/validate`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
      return (await response.json()) as {
        valid: boolean;
        issues?: Array<{ entityType: string; entityName: string; issue: string }>;
      };
    },
  });
};

/** Publishes an epic (transitions from Draft to Ready). */
export const usePublishEpic = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectId: string; epicId: string }): Promise<void> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(
        `${baseUrl}/v1/projects/${params.projectId}/epics/${params.epicId}/publish`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(params.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.epics.lists(params.projectId),
      });
    },
  });
};

/** Fetches aggregate counts for an epic (stories, tasks, in-progress status). */
export const useEpicCounts = (projectId: string, epicId: string) =>
  useQuery({
    queryKey: queryKeys.epics.counts(epicId),
    queryFn: async (): Promise<{
      hasInProgressWork: boolean;
      totalStories: number;
      totalTasks: number;
    }> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(`${baseUrl}/v1/projects/${projectId}/epics/${epicId}/counts`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
      return (await response.json()) as {
        hasInProgressWork: boolean;
        totalStories: number;
        totalTasks: number;
      };
    },
    enabled: !!projectId && !!epicId,
  });

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
export const useDeleteStory = (epicId: string, projectId: string) => {
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.epics.detail(epicId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.byProject(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
    },
  });
};

// ---------------------------------------------------------------------------
// Story Validation & Publishing
// ---------------------------------------------------------------------------

interface ValidateStoryResult {
  valid: boolean;
  issues?: Array<{
    taskId: string;
    taskTitle: string;
    issues: string[];
  }>;
}

/** Validates a story's structure before publishing without changing state. */
export const useValidateStory = () => {
  return useMutation({
    mutationFn: async ({
      projectId,
      epicId,
      storyId,
    }: {
      projectId: string;
      epicId: string;
      storyId: string;
    }): Promise<ValidateStoryResult> => {
      const response = await fetch(
        `/api/v1/projects/${projectId}/epics/${epicId}/stories/${storyId}/validate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new ApiError(body);
      }
      return response.json() as Promise<ValidateStoryResult>;
    },
  });
};

/** Publishes a story (transitions from Draft to Ready status). */
export const usePublishStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      epicId,
      storyId,
    }: {
      projectId: string;
      epicId: string;
      storyId: string;
    }) => {
      const response = await fetch(
        `/api/v1/projects/${projectId}/epics/${epicId}/stories/${storyId}/publish`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new ApiError(body);
      }
      return response.json() as Promise<unknown>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.detail(variables.storyId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.lists(variables.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(variables.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.byProject(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.stats(),
      });
    },
  });
};

// ---------------------------------------------------------------------------
// Story Reset
// ---------------------------------------------------------------------------

/** Resets a failed story back to a system-determined status (e.g., not_started or ready). */
export const useResetStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      epicId,
      storyId,
    }: {
      projectId: string;
      epicId: string;
      storyId: string;
    }) => {
      const response = await fetch(
        `/api/v1/projects/${projectId}/epics/${epicId}/stories/${storyId}/reset`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new ApiError(body);
      }
      return response.json() as Promise<unknown>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.detail(variables.storyId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.lists(variables.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(variables.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.byProject(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.stats(),
      });
    },
  });
};

// ---------------------------------------------------------------------------
// Story Unassign
// ---------------------------------------------------------------------------

/** Removes the current worker assignment from a story. */
export const useUnassignStory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      epicId,
      storyId,
    }: {
      projectId: string;
      epicId: string;
      storyId: string;
    }) => {
      const response = await fetch(
        `/api/v1/projects/${projectId}/epics/${epicId}/stories/${storyId}/unassign`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmation: true }),
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new ApiError(body);
      }
      return response.json() as Promise<unknown>;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.detail(variables.storyId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.lists(variables.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(variables.epicId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.stories.byProject(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(variables.projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.stats(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workers.lists(),
      });
    },
  });
};

// ---------------------------------------------------------------------------
// Story Attempt History
// ---------------------------------------------------------------------------

/** Response shape for a single attempt history entry. */
export interface AttemptEntry {
  id: string;
  workerId: string | null;
  workerName: string;
  assignedAt: string;
  unassignedAt: string | null;
  reason: 'timeout' | 'manual' | 'failure' | 'complete' | null;
  durationSeconds: number | null;
}

/** Fetches attempt history for a story. Disabled when storyId is falsy. */
export const useStoryAttemptHistory = (storyId: string) =>
  useQuery({
    queryKey: queryKeys.stories.attemptHistory(storyId),
    queryFn: async (): Promise<AttemptEntry[]> => {
      const response = await fetch(`/api/v1/stories/${storyId}/attempt-history`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new ApiError(body);
      }
      const json = (await response.json()) as { data: AttemptEntry[] };
      return json.data;
    },
    enabled: !!storyId,
  });

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

// ---------------------------------------------------------------------------
// Worker Sub-resources (projects, history)
// ---------------------------------------------------------------------------

/** Shape of a worker project access record returned by the API. */
export interface WorkerProjectAccess {
  workerId: string;
  projectId: string;
  grantedAt: string;
  currentAssignment: {
    storyId: string;
    storyTitle: string;
  } | null;
}

/**
 * Fetches a worker's project access records.
 *
 * NOTE: This endpoint is not in the OpenAPI spec yet, so we use a manual fetch
 * through the same base URL that apiClient uses. Disabled when workerId is falsy.
 */
export const useWorkerProjects = (workerId: string) =>
  useQuery({
    queryKey: queryKeys.workers.projects(workerId),
    queryFn: async (): Promise<{ data: WorkerProjectAccess[] }> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(`${baseUrl}/v1/workers/${workerId}/projects`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
      return (await response.json()) as { data: WorkerProjectAccess[] };
    },
    enabled: !!workerId,
  });

/**
 * Grants a worker access to a specific project.
 *
 * Uses optimistic updates: immediately adds the project to the local cache,
 * then rolls back on failure. Invalidates worker detail, worker projects, and
 * worker lists on success.
 *
 * NOTE: This endpoint is not in the OpenAPI spec yet, so we use a manual fetch.
 */
export const useAddWorkerProject = (workerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string): Promise<{ data: WorkerProjectAccess }> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(`${baseUrl}/v1/workers/${workerId}/projects/${projectId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
      return (await response.json()) as { data: WorkerProjectAccess };
    },
    onMutate: async (projectId: string) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.workers.projects(workerId) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<{ data: WorkerProjectAccess[] }>(
        queryKeys.workers.projects(workerId),
      );

      // Optimistically update the cache
      queryClient.setQueryData<{ data: WorkerProjectAccess[] }>(
        queryKeys.workers.projects(workerId),
        (old) => {
          const optimisticRecord: WorkerProjectAccess = {
            workerId,
            projectId,
            grantedAt: new Date().toISOString(),
          };
          if (!old) return { data: [optimisticRecord] };
          return { data: [...old.data, optimisticRecord] };
        },
      );

      return { previousData };
    },
    onError: (_err, _projectId, context) => {
      // Roll back to the previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.workers.projects(workerId), context.previousData);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.projects(workerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.detail(workerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.lists() });
    },
  });
};

/**
 * Error response shape returned by the DELETE endpoint when there's a 409
 * conflict (worker has in-progress work in the project).
 */
export interface WorkerProjectConflictError {
  error: {
    code: string;
    message: string;
    details?: {
      inProgressStories?: Array<{
        id: string;
        title: string;
        workStatus: string;
      }>;
    };
  };
}

/**
 * Revokes a worker's access to a specific project.
 *
 * The DELETE endpoint returns 409 with `inProgressStories` info if the worker
 * has active work in that project and force is not set. Pass `{ force: true }`
 * to unassign stories and force the revocation.
 *
 * NOTE: This endpoint is not in the OpenAPI spec yet, so we use a manual fetch.
 */
export const useRemoveWorkerProject = (workerId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectId: string; force?: boolean }): Promise<void> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const forceParam = params.force ? '?force=true' : '';
      const response = await fetch(
        `${baseUrl}/v1/workers/${workerId}/projects/${params.projectId}${forceParam}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.projects(workerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.detail(workerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workers.lists() });
    },
  });
};

/** Shape of a work history record for a worker. */
export interface WorkHistoryRecord {
  id: string;
  storyId: string;
  storyTitle: string;
  projectId: string;
  projectName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  cost: string | null;
}

/**
 * Fetches a worker's work history from the attempt_history table.
 *
 * Returns all assignment attempts for the worker, joined with story titles
 * and project names. Ordered by startedAt descending (most recent first).
 */
export const useWorkerHistory = (workerId: string) =>
  useQuery({
    queryKey: queryKeys.workers.history(workerId),
    queryFn: async (): Promise<{ data: WorkHistoryRecord[] }> => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
      const response = await fetch(`${baseUrl}/v1/workers/${workerId}/history`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new ApiError(body);
      }
      return (await response.json()) as { data: WorkHistoryRecord[] };
    },
    enabled: !!workerId,
  });

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
