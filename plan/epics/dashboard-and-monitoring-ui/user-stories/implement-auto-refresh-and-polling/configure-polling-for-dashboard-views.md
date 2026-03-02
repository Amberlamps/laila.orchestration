# Configure Polling for Dashboard Views

## Task Details

- **Title:** Configure Polling for Dashboard Views
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Auto-Refresh & Polling](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Configure TanStack Query v5 polling intervals for all dashboard and project detail queries. All data-fetching hooks used on the global dashboard and project overview tab should use a consistent 15-second polling interval to keep displayed data fresh without overwhelming the API.

### Polling Configuration

```typescript
// apps/web/src/lib/query-config.ts
// Centralized polling configuration for dashboard views.
// Defines consistent intervals and behavior across all dashboard queries.

/**
 * DASHBOARD_POLL_INTERVAL = 15_000 (15 seconds)
 *
 * Applied to all dashboard and project detail queries via
 * TanStack Query's refetchInterval option.
 *
 * Configuration applied to each query:
 * - refetchInterval: 15_000
 * - refetchIntervalInBackground: false
 *   (pauses polling when tab is in background — further refined
 *    by Page Visibility integration)
 * - refetchOnWindowFocus: true
 *   (triggers immediate refresh when user returns to the tab)
 */

export const DASHBOARD_POLL_INTERVAL = 15_000;

export const dashboardQueryOptions = {
  refetchInterval: DASHBOARD_POLL_INTERVAL,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;
```

### Hook Updates

```typescript
// All dashboard query hooks should incorporate polling options.
// Example pattern for updating existing hooks:

import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "@/lib/query-config";

// Global dashboard hooks:
// - useDashboardSummary()        → add dashboardQueryOptions
// - useProjectsSummary()         → add dashboardQueryOptions
// - useRecentActivity()          → add dashboardQueryOptions
// - useActiveWorkers()           → add dashboardQueryOptions

// Project overview hooks:
// - useProjectOverviewStats()    → add dashboardQueryOptions
// - useProjectActiveWorkers()    → add dashboardQueryOptions
// - useProjectThroughput()       → add dashboardQueryOptions
// - useTaskCompletionRate()      → add dashboardQueryOptions
// - useProjectCostTracking()     → add dashboardQueryOptions
// - useProjectActivity()         → add dashboardQueryOptions

/**
 * Example usage:
 *
 * const useDashboardSummary = () => {
 *   return useQuery({
 *     queryKey: dashboardKeys.summary(),
 *     queryFn: () => apiClient.get("/api/v1/dashboard/summary"),
 *     ...dashboardQueryOptions,
 *   });
 * };
 */
```

### Query Key Factory

```typescript
// apps/web/src/lib/query-keys.ts
// Extend the query key factory with dashboard-specific keys.
// These keys enable targeted cache invalidation and polling control.

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => [...dashboardKeys.all, "summary"] as const,
  projectsSummary: () => [...dashboardKeys.all, "projects-summary"] as const,
  recentActivity: () => [...dashboardKeys.all, "recent-activity"] as const,
  activeWorkers: () => [...dashboardKeys.all, "active-workers"] as const,
};

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
  overview: (id: string) => [...projectKeys.detail(id), "overview"] as const,
  activeWorkers: (id: string) =>
    [...projectKeys.detail(id), "active-workers"] as const,
  throughput: (id: string) =>
    [...projectKeys.detail(id), "throughput"] as const,
  completionRate: (id: string) =>
    [...projectKeys.detail(id), "completion-rate"] as const,
  costTracking: (id: string) =>
    [...projectKeys.detail(id), "cost-tracking"] as const,
  activity: (id: string) =>
    [...projectKeys.detail(id), "activity"] as const,
};
```

## Acceptance Criteria

- [ ] A centralized `DASHBOARD_POLL_INTERVAL` constant is defined as 15000 (15 seconds) in `@/lib/query-config.ts`
- [ ] A `dashboardQueryOptions` object is exported with `refetchInterval`, `refetchIntervalInBackground: false`, and `refetchOnWindowFocus: true`
- [ ] All global dashboard query hooks use the `dashboardQueryOptions` spread
- [ ] All project overview query hooks use the `dashboardQueryOptions` spread
- [ ] Dashboard query key factory is defined in `@/lib/query-keys.ts` with proper key hierarchy
- [ ] Project query key factory is defined with nested keys for overview, workers, metrics, etc.
- [ ] Polling does not run when the tab is in the background (`refetchIntervalInBackground: false`)
- [ ] Queries refresh immediately when the user returns to the tab (`refetchOnWindowFocus: true`)
- [ ] Polling interval is consistent across all dashboard views (not per-component)
- [ ] No `any` types are used in the implementation

## Technical Notes

- TanStack Query v5 uses `refetchInterval` as a number (milliseconds) or a function that returns a number or `false`. The constant 15000 is appropriate for dashboard views — frequent enough to feel "live" but not so frequent as to overload the API.
- `refetchIntervalInBackground: false` is the default in TanStack Query v5, but it is explicitly set here for clarity and to prevent accidental overrides.
- Query keys use the factory pattern with `as const` assertions for type safety. This enables targeted cache invalidation (e.g., invalidating all dashboard keys or just the summary).
- The polling interval may need to be adjusted based on API performance and server load. The centralized configuration makes this a single-line change.

## References

- **TanStack Query v5:** `refetchInterval`, `refetchIntervalInBackground`, `refetchOnWindowFocus` options
- **Query Key Factory:** Pattern from TanStack Query documentation for organized cache management
- **API Client:** openapi-fetch client configured in Epic 8

## Estimated Complexity

Low — Configuration-only task that spreads options into existing query hooks. No new UI components.
