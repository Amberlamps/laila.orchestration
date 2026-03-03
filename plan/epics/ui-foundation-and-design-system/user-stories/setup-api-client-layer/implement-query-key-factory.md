# Implement Query Key Factory

## Task Details

- **Title:** Implement Query Key Factory
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Set Up API Client Layer](./tasks.md)
- **Parent Epic:** [UI Foundation & Design System](../../user-stories.md)
- **Dependencies:** Configure openapi-fetch Client

## Description

Create a centralized query key factory (`query-keys.ts`) that defines all TanStack Query cache keys used throughout the application. Consistent query keys are essential for reliable cache invalidation — when a project is updated, all related queries (project detail, project list, child epics, stories) must be invalidated using predictable key patterns.

### Query Key Structure

The factory uses a hierarchical key structure where each level narrows the scope:

```typescript
// apps/web/src/lib/query-keys.ts
// Centralized query key factory for TanStack Query cache management.
// Every query in the application MUST use keys from this factory to ensure
// cache invalidation works correctly across related entity mutations.

export const queryKeys = {
  // Session / auth state
  session: () => ['session'] as const,

  // Projects
  projects: {
    // Matches ALL project queries (lists + details) — use for broad invalidation.
    all: () => ['projects'] as const,
    // Matches all project list queries (any filter combination).
    lists: () => [...queryKeys.projects.all(), 'list'] as const,
    // Matches a specific filtered list query.
    list: (params?: Record<string, unknown>) => [...queryKeys.projects.lists(), params] as const,
    // Matches a specific project detail query.
    detail: (projectId: string) => [...queryKeys.projects.all(), 'detail', projectId] as const,
  },

  // Epics — scoped under a project
  epics: {
    all: (projectId: string) => ['projects', projectId, 'epics'] as const,
    lists: (projectId: string) => [...queryKeys.epics.all(projectId), 'list'] as const,
    list: (projectId: string, params?: Record<string, unknown>) =>
      [...queryKeys.epics.lists(projectId), params] as const,
    detail: (epicId: string) => ['epics', 'detail', epicId] as const,
  },

  // Stories — scoped under an epic
  stories: {
    all: (epicId: string) => ['epics', epicId, 'stories'] as const,
    lists: (epicId: string) => [...queryKeys.stories.all(epicId), 'list'] as const,
    list: (epicId: string, params?: Record<string, unknown>) =>
      [...queryKeys.stories.lists(epicId), params] as const,
    detail: (storyId: string) => ['stories', 'detail', storyId] as const,
    // Stories can also be listed at the project level
    byProject: (projectId: string) => ['projects', projectId, 'stories'] as const,
  },

  // Tasks — scoped under a story
  tasks: {
    all: (storyId: string) => ['stories', storyId, 'tasks'] as const,
    lists: (storyId: string) => [...queryKeys.tasks.all(storyId), 'list'] as const,
    list: (storyId: string, params?: Record<string, unknown>) =>
      [...queryKeys.tasks.lists(storyId), params] as const,
    detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
    // Tasks can also be listed at the project or epic level
    byProject: (projectId: string) => ['projects', projectId, 'tasks'] as const,
    byEpic: (epicId: string) => ['epics', epicId, 'tasks'] as const,
  },

  // Workers
  workers: {
    all: () => ['workers'] as const,
    lists: () => [...queryKeys.workers.all(), 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.workers.lists(), params] as const,
    detail: (workerId: string) => [...queryKeys.workers.all(), 'detail', workerId] as const,
  },

  // Personas
  personas: {
    all: () => ['personas'] as const,
    lists: () => [...queryKeys.personas.all(), 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.personas.lists(), params] as const,
    detail: (personaId: string) => [...queryKeys.personas.all(), 'detail', personaId] as const,
  },

  // Dashboard aggregated data
  dashboard: {
    all: () => ['dashboard'] as const,
    stats: () => [...queryKeys.dashboard.all(), 'stats'] as const,
    activity: () => [...queryKeys.dashboard.all(), 'activity'] as const,
  },

  // Audit log
  audit: {
    all: () => ['audit'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.audit.all(), 'list', params] as const,
  },
} as const;
```

### Cache Invalidation Patterns

```typescript
// Example: When a project is updated, invalidate:
// 1. The specific project detail cache
// 2. All project list queries (any filter)
queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });

// Example: When a story is completed, invalidate:
// 1. The story detail
// 2. All stories under the parent epic
// 3. The project-level story list
// 4. Dashboard stats (progress changed)
queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(storyId) });
queryClient.invalidateQueries({ queryKey: queryKeys.stories.lists(epicId) });
queryClient.invalidateQueries({ queryKey: queryKeys.stories.byProject(projectId) });
queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
```

## Acceptance Criteria

- [ ] Query key factory is defined at `apps/web/src/lib/query-keys.ts`
- [ ] Keys are defined for all entity types: session, projects, epics, stories, tasks, workers, personas
- [ ] Keys are defined for aggregate views: dashboard stats, dashboard activity, audit log
- [ ] Each entity type has hierarchical keys: `all`, `lists`, `list(params)`, `detail(id)`
- [ ] Hierarchical entities (epics, stories, tasks) have parent-scoped keys for cross-level queries
- [ ] All keys use `as const` for strict TypeScript tuple types
- [ ] Key structure supports broad invalidation (e.g., invalidate all project-related queries)
- [ ] Key structure supports narrow invalidation (e.g., invalidate only a specific filtered list)
- [ ] Filter parameters are included in list keys to enable per-filter caching
- [ ] Key factory is used consistently by all query hooks (no ad-hoc key strings elsewhere)
- [ ] Documentation comments explain the cache invalidation strategy for each entity type
- [ ] Key structure avoids unintended invalidation (e.g., invalidating project lists does not invalidate epic lists)
- [ ] TypeScript types are correctly inferred for all key functions

## Technical Notes

- The query key factory pattern is recommended by the TanStack Query team. It centralizes key management and ensures consistency across the codebase.
- The hierarchical key structure leverages TanStack Query's prefix matching for `invalidateQueries`. For example, `invalidateQueries({ queryKey: ["projects"] })` matches all keys that start with `["projects"]`, including `["projects", "list"]` and `["projects", "detail", "abc123"]`.
- Child entity keys (epics, stories, tasks) are intentionally scoped under their parent entity key prefix. This enables cascading invalidation — invalidating all project data also invalidates its child epics, stories, and tasks.
- However, entity detail keys (e.g., `["epics", "detail", epicId]`) are NOT scoped under the parent project key. This is intentional — detail queries are keyed by the entity's own ID, not the parent's ID, because detail pages are accessed directly.
- Use `as const` on all key arrays to preserve the exact tuple type. This enables TypeScript to verify that `invalidateQueries` is called with a valid key prefix.

## References

- **Design Specification:** Section 5.4 (Cache Management), Section 5.4.1 (Query Key Strategy)
- **Functional Requirements:** FR-API-007 (cache invalidation), FR-API-008 (consistent key management)
- **TanStack Query v5 Docs:** Query keys, cache invalidation, prefix matching
- **TkDodo's Blog:** "Effective React Query Keys" — query key factory pattern

## Estimated Complexity

Medium — The factory pattern itself is straightforward, but designing the key hierarchy to support both broad and narrow invalidation patterns across a complex entity graph (Project > Epic > Story > Task) requires careful thought about parent-child relationships and cross-entity invalidation needs.
