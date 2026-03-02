# Create TanStack Query Hooks Factory

## Task Details

- **Title:** Create TanStack Query Hooks Factory
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Set Up API Client Layer](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Configure openapi-fetch Client

## Description

Create a factory pattern for generating TanStack Query hooks that wrap the openapi-fetch client. This provides consistent data fetching, caching, and mutation patterns across all entity types (projects, epics, stories, tasks, workers, personas).

### Hook Factory Pattern

```typescript
// apps/web/src/lib/query-hooks.ts
// Factory functions for creating TanStack Query hooks from openapi-fetch calls.
// Each entity type gets a consistent set of hooks: useList, useDetail, useCreate,
// useUpdate, useDelete with appropriate cache invalidation.

import {
  useQuery, useMutation, useQueryClient,
  type UseQueryOptions, type UseMutationOptions,
} from "@tanstack/react-query";
import { apiClient } from "./api-client";
import { queryKeys } from "./query-keys";

// --- Project Hooks ---

// Fetches the paginated project list with optional status filter.
// Cache key includes filter params for separate caching per filter state.
export function useProjects(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: queryKeys.projects.list(params),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/projects", {
        params: { query: params },
      });
      if (error) throw error;
      return data;
    },
  });
}

// Fetches a single project by ID.
// Enables detail page rendering and form pre-population for editing.
export function useProject(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/api/projects/{projectId}", {
        params: { path: { projectId } },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

// Creates a new project. On success, invalidates the project list cache
// so the new project appears immediately in the list view.
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      name: string;
      description?: string;
      workerInactivityTimeoutMinutes?: number;
    }) => {
      const { data, error } = await apiClient.POST("/api/projects", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all project list queries so the new project appears.
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
}

// Updates a project. On success, invalidates both the specific project
// detail cache and all project list queries.
export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      name?: string;
      description?: string;
      workerInactivityTimeoutMinutes?: number;
    }) => {
      const { data, error } = await apiClient.PATCH("/api/projects/{projectId}", {
        params: { path: { projectId } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
}

// Deletes a project. On success, invalidates all project queries
// and removes the specific project from the cache.
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data, error } = await apiClient.DELETE("/api/projects/{projectId}", {
        params: { path: { projectId } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, projectId) => {
      queryClient.removeQueries({ queryKey: queryKeys.projects.detail(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
    },
  });
}
```

### Optimistic Mutation Helpers

```typescript
// apps/web/src/lib/optimistic-helpers.ts
// Helper utilities for optimistic updates with automatic rollback on error.
// Optimistic updates provide instant UI feedback while the API call is in flight.

import { type QueryClient } from "@tanstack/react-query";

// Generic optimistic update function that snapshots the current cache,
// applies the optimistic update, and provides a rollback function.
export function createOptimisticUpdate<TData>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (oldData: TData | undefined) => TData,
) {
  // Snapshot the current cache for rollback
  const previousData = queryClient.getQueryData<TData>(queryKey);

  // Apply the optimistic update
  queryClient.setQueryData<TData>(queryKey, updater);

  // Return rollback function for use in onError
  return {
    previousData,
    rollback: () => {
      queryClient.setQueryData<TData>(queryKey, previousData);
    },
  };
}
```

## Acceptance Criteria

- [ ] Query hooks are created for all entity types: projects, epics, stories, tasks, workers, personas
- [ ] Each entity type has hooks for: `useList`, `useDetail`, `useCreate`, `useUpdate`, `useDelete`
- [ ] All query hooks use the `queryKeys` factory for consistent cache keys
- [ ] List hooks support filter parameters that are included in the cache key
- [ ] Detail hooks use `enabled: !!id` to prevent fetching with undefined IDs
- [ ] Create mutations invalidate the corresponding list cache on success
- [ ] Update mutations invalidate both the detail and list caches on success
- [ ] Delete mutations remove the detail cache and invalidate the list cache on success
- [ ] All hooks use the `apiClient` from openapi-fetch for type-safe API calls
- [ ] Error responses from the API are thrown as errors for TanStack Query error handling
- [ ] Optimistic update helper function is available for instant UI feedback
- [ ] Optimistic updates include rollback on mutation error
- [ ] Hooks follow consistent naming conventions (`use{Entity}s`, `use{Entity}`, `useCreate{Entity}`, etc.)
- [ ] All hooks have proper TypeScript types inferred from the OpenAPI spec
- [ ] Hooks export is organized by entity type for easy discovery

## Technical Notes

- The hook factory follows the pattern of wrapping `openapi-fetch` calls inside TanStack Query hooks. This separates concerns: `openapi-fetch` handles HTTP communication and type safety, while TanStack Query handles caching, refetching, and state management.
- Cache invalidation is the key concept: when a mutation succeeds, related query caches must be invalidated to ensure the UI shows fresh data. The `queryKeys` factory (from the next task) ensures invalidation targets the correct cache entries.
- Optimistic updates should be used selectively — they are most valuable for mutations with simple, predictable outcomes (e.g., changing a name) and less suitable for mutations with complex server-side side effects (e.g., publishing a project which validates children).
- Consider creating a higher-order factory function that generates all five hooks for a given entity type to reduce boilerplate, but keep individual hooks for entity-specific customization.
- Use `queryClient.invalidateQueries` (not `removeQueries`) for list caches to trigger a background refetch. Use `queryClient.removeQueries` for deleted entity detail caches to immediately remove stale data.

## References

- **Design Specification:** Section 5.3 (Data Fetching Patterns), Section 5.3.1 (Query Hooks)
- **Functional Requirements:** FR-API-004 (data fetching hooks), FR-API-005 (cache management), FR-API-006 (optimistic updates)
- **TanStack Query v5 Docs:** useQuery, useMutation, QueryClient, cache invalidation
- **openapi-fetch Docs:** Type-safe method calls

## Estimated Complexity

High — Creating consistent hooks for 6 entity types with proper cache invalidation, optimistic update support, and full TypeScript type inference requires significant boilerplate and careful design of the cache invalidation strategy.
