/**
 * Centralized TanStack Query key factory for cache management.
 *
 * Every query in the application MUST use keys from this factory to ensure
 * cache invalidation works correctly across related entity mutations.
 *
 * ## Key Hierarchy
 *
 * Keys follow a hierarchical structure where each level narrows the scope.
 * TanStack Query's `invalidateQueries` uses prefix matching, so invalidating
 * `["projects"]` will match ALL keys that start with `["projects"]`, including
 * `["projects", "list", {...}]` and `["projects", "detail", "abc123"]`.
 *
 * ## Entity Relationships
 *
 * ```
 * Session (standalone)
 * Projects (top-level)
 *   └─ Epics (scoped under project)
 *       └─ Stories (scoped under epic; also queryable by project)
 *           └─ Tasks (scoped under story; also queryable by project/epic)
 * Workers (top-level)
 * Personas (top-level)
 * Dashboard (aggregate: stats, activity)
 * Audit (log entries)
 * ```
 *
 * ## Invalidation Strategy
 *
 * - **Broad invalidation:** Use the `all()` key to clear everything for an
 *   entity type. For scoped entities the `all(parentId)` key clears all queries
 *   scoped under that parent.
 * - **Narrow invalidation:** Use `list(params)` or `detail(id)` to target a
 *   specific cached entry.
 * - **Cross-level invalidation:** Scoped entities (epics, stories, tasks) live
 *   under their parent's key prefix. Invalidating `["projects", projectId]`
 *   also invalidates its child epics, stories, and tasks listed under that
 *   project.
 * - **Detail keys are NOT parent-scoped:** Detail queries are keyed by their
 *   own entity ID (e.g., `["epics", "detail", epicId]`) so they can be fetched
 *   directly without knowing the parent ID.
 *
 * @example
 * ```ts
 * import { queryKeys } from "@/lib/query-keys";
 *
 * // Use in a query
 * useQuery({ queryKey: queryKeys.session(), ... });
 * useQuery({ queryKey: queryKeys.projects.detail(projectId), ... });
 *
 * // Broad invalidation — clears all project queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
 *
 * // Narrow invalidation — clears only filtered list
 * queryClient.invalidateQueries({ queryKey: queryKeys.projects.list({ status: "active" }) });
 *
 * // Cross-entity invalidation on story completion
 * queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(storyId) });
 * queryClient.invalidateQueries({ queryKey: queryKeys.stories.lists(epicId) });
 * queryClient.invalidateQueries({ queryKey: queryKeys.stories.byProject(projectId) });
 * queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
 * ```
 */
export const queryKeys = {
  // ---------------------------------------------------------------------------
  // Session / auth state
  // ---------------------------------------------------------------------------

  /** Key for the current user session query. */
  session: () => ['session'] as const,

  // ---------------------------------------------------------------------------
  // Projects (top-level entity)
  // ---------------------------------------------------------------------------

  /**
   * Project query keys.
   *
   * Cache invalidation strategy:
   * - On project create/delete: invalidate `projects.lists()` to refresh all list views.
   * - On project update: invalidate `projects.detail(id)` AND `projects.lists()`.
   * - Invalidating `projects.all()` clears ALL project queries (lists + details)
   *   as well as child entity queries scoped under a project (epics, stories, tasks).
   */
  projects: {
    /** Matches ALL project queries (lists + details) — use for broad invalidation. */
    all: () => ['projects'] as const,
    /** Matches all project list queries (any filter combination). */
    lists: () => [...queryKeys.projects.all(), 'list'] as const,
    /** Matches a specific filtered project list query. */
    list: (params?: Record<string, unknown>) => [...queryKeys.projects.lists(), params] as const,
    /** Matches a specific project detail query. */
    detail: (projectId: string) => [...queryKeys.projects.all(), 'detail', projectId] as const,
    /** Matches the dependency graph query for a specific project. */
    graph: (projectId: string) => [...queryKeys.projects.all(), 'graph', projectId] as const,
  },

  // ---------------------------------------------------------------------------
  // Epics (scoped under a project)
  // ---------------------------------------------------------------------------

  /**
   * Epic query keys — scoped under their parent project.
   *
   * Cache invalidation strategy:
   * - On epic create/delete: invalidate `epics.lists(projectId)`.
   * - On epic update: invalidate `epics.detail(epicId)` AND `epics.lists(projectId)`.
   * - Invalidating `epics.all(projectId)` clears all epic queries for a project.
   * - Detail keys use the epic's own ID (not parent-scoped) for direct access.
   */
  epics: {
    /** Matches all epic queries under a specific project. */
    all: (projectId: string) => ['projects', projectId, 'epics'] as const,
    /** Matches all epic list queries for a project (any filter combination). */
    lists: (projectId: string) => [...queryKeys.epics.all(projectId), 'list'] as const,
    /** Matches a specific filtered epic list query for a project. */
    list: (projectId: string, params?: Record<string, unknown>) =>
      [...queryKeys.epics.lists(projectId), params] as const,
    /** Matches a specific epic detail query (not parent-scoped). */
    detail: (epicId: string) => ['epics', 'detail', epicId] as const,
    /** Matches a specific epic counts/aggregates query. */
    counts: (epicId: string) => ['epics', 'counts', epicId] as const,
  },

  // ---------------------------------------------------------------------------
  // Stories (scoped under an epic)
  // ---------------------------------------------------------------------------

  /**
   * Story query keys — scoped under their parent epic.
   *
   * Cache invalidation strategy:
   * - On story create/delete: invalidate `stories.lists(epicId)` and
   *   `stories.byProject(projectId)`.
   * - On story update/completion: invalidate `stories.detail(storyId)`,
   *   `stories.lists(epicId)`, `stories.byProject(projectId)`, and
   *   `dashboard.stats()` (progress may have changed).
   * - Detail keys use the story's own ID (not parent-scoped) for direct access.
   * - `byProject` enables project-level story listing without knowing the epic.
   */
  stories: {
    /** Matches all story queries under a specific epic. */
    all: (epicId: string) => ['epics', epicId, 'stories'] as const,
    /** Matches all story list queries for an epic (any filter combination). */
    lists: (epicId: string) => [...queryKeys.stories.all(epicId), 'list'] as const,
    /** Matches a specific filtered story list query for an epic. */
    list: (epicId: string, params?: Record<string, unknown>) =>
      [...queryKeys.stories.lists(epicId), params] as const,
    /** Matches a specific story detail query (not parent-scoped). */
    detail: (storyId: string) => ['stories', 'detail', storyId] as const,
    /** Matches all stories listed at the project level (cross-level query). */
    byProject: (projectId: string) => ['projects', projectId, 'stories'] as const,
    /** Matches the attempt history query for a specific story. */
    attemptHistory: (storyId: string) => ['stories', 'attemptHistory', storyId] as const,
  },

  // ---------------------------------------------------------------------------
  // Tasks (scoped under a story)
  // ---------------------------------------------------------------------------

  /**
   * Task query keys — scoped under their parent story.
   *
   * Cache invalidation strategy:
   * - On task create/delete: invalidate `tasks.lists(storyId)` and
   *   any project/epic-level task lists that may be visible.
   * - On task update/completion: invalidate `tasks.detail(taskId)`,
   *   `tasks.lists(storyId)`, cross-level lists, and `dashboard.stats()`.
   * - `byProject` and `byEpic` enable listing tasks at higher hierarchy
   *   levels without knowing the parent story.
   * - Detail keys use the task's own ID (not parent-scoped) for direct access.
   */
  tasks: {
    /** Matches all task queries under a specific story. */
    all: (storyId: string) => ['stories', storyId, 'tasks'] as const,
    /** Matches all task list queries for a story (any filter combination). */
    lists: (storyId: string) => [...queryKeys.tasks.all(storyId), 'list'] as const,
    /** Matches a specific filtered task list query for a story. */
    list: (storyId: string, params?: Record<string, unknown>) =>
      [...queryKeys.tasks.lists(storyId), params] as const,
    /** Matches a specific task detail query (not parent-scoped). */
    detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
    /** Matches all tasks listed at the project level (cross-level query). */
    byProject: (projectId: string) => ['projects', projectId, 'tasks'] as const,
    /** Matches all tasks listed at the epic level (cross-level query). */
    byEpic: (epicId: string) => ['epics', epicId, 'tasks'] as const,
  },

  // ---------------------------------------------------------------------------
  // Workers (top-level entity)
  // ---------------------------------------------------------------------------

  /**
   * Worker query keys.
   *
   * Cache invalidation strategy:
   * - On worker create/delete: invalidate `workers.lists()`.
   * - On worker update: invalidate `workers.detail(workerId)` AND `workers.lists()`.
   * - Invalidating `workers.all()` clears all worker queries.
   */
  workers: {
    /** Matches ALL worker queries (lists + details) — use for broad invalidation. */
    all: () => ['workers'] as const,
    /** Matches all worker list queries (any filter combination). */
    lists: () => [...queryKeys.workers.all(), 'list'] as const,
    /** Matches a specific filtered worker list query. */
    list: (params?: Record<string, unknown>) => [...queryKeys.workers.lists(), params] as const,
    /** Matches a specific worker detail query. */
    detail: (workerId: string) => [...queryKeys.workers.all(), 'detail', workerId] as const,
    /** Matches a specific worker's project access records query. */
    projects: (workerId: string) =>
      [...queryKeys.workers.all(), 'detail', workerId, 'projects'] as const,
    /** Matches a specific worker's work history query. */
    history: (workerId: string) =>
      [...queryKeys.workers.all(), 'detail', workerId, 'history'] as const,
  },

  // ---------------------------------------------------------------------------
  // Personas (top-level entity)
  // ---------------------------------------------------------------------------

  /**
   * Persona query keys.
   *
   * Cache invalidation strategy:
   * - On persona create/delete: invalidate `personas.lists()`.
   * - On persona update: invalidate `personas.detail(personaId)` AND `personas.lists()`.
   * - Invalidating `personas.all()` clears all persona queries.
   */
  personas: {
    /** Matches ALL persona queries (lists + details) — use for broad invalidation. */
    all: () => ['personas'] as const,
    /** Matches all persona list queries (any filter combination). */
    lists: () => [...queryKeys.personas.all(), 'list'] as const,
    /** Matches a specific filtered persona list query. */
    list: (params?: Record<string, unknown>) => [...queryKeys.personas.lists(), params] as const,
    /** Matches a specific persona detail query. */
    detail: (personaId: string) => [...queryKeys.personas.all(), 'detail', personaId] as const,
  },

  // ---------------------------------------------------------------------------
  // Dashboard (aggregate data)
  // ---------------------------------------------------------------------------

  /**
   * Dashboard query keys for aggregated views.
   *
   * Cache invalidation strategy:
   * - `dashboard.stats()` should be invalidated whenever entity counts or
   *   progress metrics change (e.g., story/task completion).
   * - `dashboard.activity()` should be invalidated when new activity events
   *   are generated (e.g., entity mutations, user actions).
   * - Invalidating `dashboard.all()` clears both stats and activity.
   */
  dashboard: {
    /** Matches ALL dashboard queries — use for broad invalidation. */
    all: () => ['dashboard'] as const,
    /** Matches the dashboard stats (counts, progress metrics) query. */
    stats: () => [...queryKeys.dashboard.all(), 'stats'] as const,
    /** Matches the dashboard activity feed query. */
    activity: () => [...queryKeys.dashboard.all(), 'activity'] as const,
    /** Matches the dashboard active workers summary query. */
    activeWorkers: () => [...queryKeys.dashboard.all(), 'activeWorkers'] as const,
  },

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  /**
   * Audit log query keys.
   *
   * Cache invalidation strategy:
   * - Audit log entries are typically append-only. Invalidate `audit.all()`
   *   after any mutation that generates an audit entry to ensure the log view
   *   reflects the latest actions.
   */
  audit: {
    /** Matches ALL audit queries. */
    all: () => ['audit'] as const,
    /** Matches a specific filtered audit log list query. */
    list: (params?: Record<string, unknown>) => [...queryKeys.audit.all(), 'list', params] as const,
  },
} as const;
