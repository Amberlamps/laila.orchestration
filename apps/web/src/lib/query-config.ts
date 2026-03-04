/**
 * Centralized polling configuration for dashboard views.
 *
 * Defines consistent intervals and behavior across all dashboard and project
 * detail queries. Spread `dashboardQueryOptions` into any `useQuery` call that
 * should participate in the 15-second polling cycle.
 *
 * @example
 * ```ts
 * import { dashboardQueryOptions } from "@/lib/query-config";
 *
 * const useDashboardSummary = () =>
 *   useQuery({
 *     queryKey: dashboardKeys.summary(),
 *     queryFn: fetchDashboardSummary,
 *     ...dashboardQueryOptions,
 *   });
 * ```
 */

/**
 * Poll interval applied to all dashboard and project overview queries.
 *
 * 15 seconds keeps displayed data reasonably fresh without overwhelming the
 * API. Because this value is centralized, adjusting the cadence for all
 * dashboard views is a single-line change.
 */
export const DASHBOARD_POLL_INTERVAL = 15_000;

/**
 * Shared TanStack Query options for dashboard polling.
 *
 * - `refetchInterval` — re-fetches every 15 seconds while the tab is visible.
 * - `refetchIntervalInBackground` — pauses polling when the tab is hidden so
 *   background tabs do not generate unnecessary network traffic.
 * - `refetchOnWindowFocus` — triggers an immediate refetch when the user
 *   returns to the tab, ensuring data is up-to-date without waiting for the
 *   next polling tick.
 */
export const dashboardQueryOptions = {
  refetchInterval: DASHBOARD_POLL_INTERVAL,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;
