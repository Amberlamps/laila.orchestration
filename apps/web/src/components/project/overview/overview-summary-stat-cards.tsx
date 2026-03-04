/**
 * Overview Summary Stat Cards
 *
 * Renders 4 KPICard components at the top of the project overview tab
 * showing entity completion status:
 *
 * 1. Epics    -- "X/Y complete" + status breakdown mini-bar (Layers icon)
 * 2. Stories  -- "X/Y complete" + status breakdown mini-bar (BookOpen icon)
 * 3. Tasks    -- "X/Y complete" + status breakdown mini-bar (ListChecks icon)
 * 4. Workers  -- count + "currently assigned" subtitle (Bot icon, no mini-bar)
 *
 * Data is fetched via TanStack Query from the project overview endpoint.
 * Loading state shows SkeletonKPICard placeholders.
 */
import { useQuery } from '@tanstack/react-query';
import { Bot, BookOpen, Layers, ListChecks } from 'lucide-react';

import { KPICard } from '@/components/ui/kpi-card';
import { SkeletonKPICard } from '@/components/ui/skeleton';
import { StatusBreakdownBar } from '@/components/ui/status-breakdown-bar';
import { queryKeys } from '@/lib/query-keys';

import type { StatusSegment } from '@/components/ui/status-breakdown-bar';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types (local -- shared type does not exist yet)
// ---------------------------------------------------------------------------

/** Status count entry returned by the overview endpoint. */
interface StatusCount {
  status: string;
  count: number;
}

/** Shape of the entity summary within the overview stats response. */
interface EntitySummary {
  total: number;
  completed: number;
  statusCounts: StatusCount[];
}

/** Shape of the project overview stats API response. */
interface ProjectOverviewStats {
  epics: EntitySummary;
  stories: EntitySummary;
  tasks: EntitySummary;
  activeWorkers: number;
}

/** API response wrapper. */
interface OverviewStatsResponse {
  data: ProjectOverviewStats;
}

// ---------------------------------------------------------------------------
// Status color map
// ---------------------------------------------------------------------------

/**
 * Maps status keys to Tailwind bg color classes.
 * Aligns with the project's status color tokens (status-colors.ts).
 */
const STATUS_BG_COLORS: Record<string, string> = {
  completed: 'bg-emerald-500',
  done: 'bg-emerald-500',
  in_progress: 'bg-blue-500',
  blocked: 'bg-amber-500',
  failed: 'bg-red-500',
  not_started: 'bg-zinc-300',
  pending: 'bg-zinc-300',
  draft: 'bg-zinc-200',
  ready: 'bg-indigo-500',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts an array of StatusCount objects into StatusSegment objects
 * ready for the StatusBreakdownBar component.
 */
function toBreakdownSegments(statusCounts: StatusCount[]): StatusSegment[] {
  return statusCounts.map((sc) => ({
    status: sc.status,
    count: sc.count,
    color: STATUS_BG_COLORS[sc.status] ?? 'bg-zinc-300',
  }));
}

// ---------------------------------------------------------------------------
// Data fetching hook (local)
// ---------------------------------------------------------------------------

/**
 * Fetches project overview stats from the API.
 *
 * Uses a query key scoped under the project detail key so that
 * invalidating the project detail also clears this data.
 */
function useProjectOverviewStats(projectId: string) {
  return useQuery<ProjectOverviewStats>({
    queryKey: [...queryKeys.projects.detail(projectId), 'overview-stats'],
    queryFn: async (): Promise<ProjectOverviewStats> => {
      const response = await fetch(`/api/v1/projects/${projectId}/overview`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch project overview stats: ${String(response.status)}`);
      }

      const body = (await response.json()) as OverviewStatsResponse;
      return body.data;
    },
    enabled: projectId.length > 0,
    staleTime: 30_000, // 30 seconds
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Wraps a KPICard with an icon and an optional status breakdown bar
 * beneath the card content. Both pieces visually integrate as a single
 * card unit.
 */
function StatCardWithBreakdown({
  value,
  label,
  accentColor,
  icon,
  segments,
  total,
}: {
  value: string;
  label: string;
  accentColor: string;
  icon: ReactNode;
  segments: StatusSegment[];
  total: number;
}) {
  return (
    <div className="flex flex-col">
      <KPICard value={value} label={label} accentColor={accentColor} className="flex-1" />
      <div className="-mt-1 flex items-center gap-2 rounded-b-md border border-t-0 border-zinc-200 bg-white px-4 pt-2 pb-3">
        <span className="shrink-0 text-zinc-400">{icon}</span>
        <StatusBreakdownBar segments={segments} total={total} height="sm" className="flex-1" />
      </div>
    </div>
  );
}

/** Loading skeleton placeholder row matching the 4-card layout. */
function StatCardsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-live="polite"
      aria-label="Loading overview statistics"
    >
      <SkeletonKPICard showBreakdown />
      <SkeletonKPICard showBreakdown />
      <SkeletonKPICard showBreakdown />
      <SkeletonKPICard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface OverviewSummaryStatCardsProps {
  /** The project ID to fetch overview stats for */
  projectId: string;
}

/**
 * Renders 4 summary stat cards for the project overview tab.
 *
 * Layout is responsive:
 * - Desktop (lg+): 4 columns in a single row
 * - Tablet (sm): 2x2 grid
 * - Mobile: single column stack
 */
export function OverviewSummaryStatCards({ projectId }: OverviewSummaryStatCardsProps) {
  const { data: stats, isLoading, isError } = useProjectOverviewStats(projectId);

  if (isLoading) {
    return <StatCardsSkeleton />;
  }

  if (isError || !stats) {
    return <StatCardsSkeleton />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Epics */}
      <StatCardWithBreakdown
        value={`${String(stats.epics.completed)}/${String(stats.epics.total)} complete`}
        label="Epics"
        accentColor="border-indigo-500"
        icon={<Layers className="h-4 w-4" aria-hidden="true" />}
        segments={toBreakdownSegments(stats.epics.statusCounts)}
        total={stats.epics.total}
      />

      {/* Stories */}
      <StatCardWithBreakdown
        value={`${String(stats.stories.completed)}/${String(stats.stories.total)} complete`}
        label="Stories"
        accentColor="border-blue-500"
        icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
        segments={toBreakdownSegments(stats.stories.statusCounts)}
        total={stats.stories.total}
      />

      {/* Tasks */}
      <StatCardWithBreakdown
        value={`${String(stats.tasks.completed)}/${String(stats.tasks.total)} complete`}
        label="Tasks"
        accentColor="border-emerald-500"
        icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
        segments={toBreakdownSegments(stats.tasks.statusCounts)}
        total={stats.tasks.total}
      />

      {/* Active Workers */}
      <div className="flex flex-col">
        <KPICard
          value={stats.activeWorkers}
          label="Active Workers"
          accentColor="border-amber-500"
          className="flex-1"
        />
        <div className="-mt-1 flex items-center gap-2 rounded-b-md border border-t-0 border-zinc-200 bg-white px-4 pt-2 pb-3">
          <span className="shrink-0 text-zinc-400">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-xs text-zinc-500">currently assigned</span>
        </div>
      </div>
    </div>
  );
}
