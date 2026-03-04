/**
 * Overview Summary Stat Cards
 *
 * Renders a responsive row of 4 KPI stat cards at the top of the project
 * overview tab using the design-system KPICard component. Each card shows
 * the completion ratio (X/Y complete) for a specific entity type along
 * with a mini status breakdown bar.
 *
 * Cards:
 * 1. Epics    -- "X/Y" complete with indigo accent and status breakdown
 * 2. Stories  -- "X/Y" complete with blue accent and status breakdown
 * 3. Tasks    -- "X/Y" complete with green accent and status breakdown
 * 4. Active Workers -- count with amber accent
 *
 * Layout:
 * - Desktop (>= 1024px): 4 equal columns
 * - Tablet  (>= 768px):  2x2 grid
 * - Mobile  (< 768px):   1 column stack
 */
import { KPICard } from '@/components/ui/kpi-card';
import { SkeletonKPICard } from '@/components/ui/skeleton';
import { useProjectOverview } from '@/lib/query-hooks';

import type { StatusSegment } from '@/components/ui/kpi-card';
import type { ProjectOverviewData, StatusCount } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Status color mapping
// ---------------------------------------------------------------------------

/** Maps a status key to its Tailwind bg color class for the breakdown bar. */
const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  done: 'bg-green-500',
  in_progress: 'bg-blue-500',
  review: 'bg-blue-500',
  blocked: 'bg-amber-500',
  failed: 'bg-red-500',
  not_started: 'bg-zinc-300',
  pending: 'bg-zinc-300',
  ready: 'bg-zinc-300',
  skipped: 'bg-zinc-400',
};

const DEFAULT_STATUS_COLOR = 'bg-zinc-300';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converts StatusCount[] to StatusSegment[] for KPICard's breakdown prop. */
function toStatusSegments(byStatus: StatusCount[]): StatusSegment[] {
  return byStatus.map((entry) => ({
    status: entry.status,
    value: entry.count,
    color: STATUS_COLORS[entry.status] ?? DEFAULT_STATUS_COLOR,
  }));
}

// ---------------------------------------------------------------------------
// Card configuration
// ---------------------------------------------------------------------------

interface StatCardConfig {
  key: string;
  accentColor: string;
  getValue: (stats: ProjectOverviewData) => string;
  getLabel: (stats: ProjectOverviewData) => string;
  getBreakdown: (stats: ProjectOverviewData) => StatusSegment[] | undefined;
}

const STAT_CARDS: StatCardConfig[] = [
  {
    key: 'epics',
    accentColor: 'border-indigo-500',
    getValue: (stats) => `${String(stats.epics.completed)}/${String(stats.epics.total)}`,
    getLabel: () => 'Epics complete',
    getBreakdown: (stats) => toStatusSegments(stats.epics.byStatus),
  },
  {
    key: 'stories',
    accentColor: 'border-blue-500',
    getValue: (stats) => `${String(stats.stories.completed)}/${String(stats.stories.total)}`,
    getLabel: () => 'Stories complete',
    getBreakdown: (stats) => toStatusSegments(stats.stories.byStatus),
  },
  {
    key: 'tasks',
    accentColor: 'border-green-500',
    getValue: (stats) => `${String(stats.tasks.completed)}/${String(stats.tasks.total)}`,
    getLabel: () => 'Tasks complete',
    getBreakdown: (stats) => toStatusSegments(stats.tasks.byStatus),
  },
  {
    key: 'active-workers',
    accentColor: 'border-amber-500',
    getValue: (stats) => String(stats.activeWorkers),
    getLabel: () => 'Active Workers',
    getBreakdown: () => undefined,
  },
];

// ---------------------------------------------------------------------------
// Skeleton loading state
// ---------------------------------------------------------------------------

const SKELETON_CARD_COUNT = 4;

function OverviewStatCardsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading project overview statistics"
    >
      {Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => (
        <SkeletonKPICard key={i} showBreakdown={i < 3} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export interface OverviewSummaryStatCardsProps {
  /** The project ID to fetch overview stats for */
  projectId: string;
}

/**
 * Responsive row of 4 KPI stat cards showing entity completion status
 * for a specific project, built on the design-system KPICard component.
 */
export function OverviewSummaryStatCards({ projectId }: OverviewSummaryStatCardsProps) {
  const { data: stats, isLoading } = useProjectOverview(projectId);

  if (isLoading || !stats) {
    return <OverviewStatCardsSkeleton />;
  }

  return (
    <div
      data-testid="overview-summary-stat-cards"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {STAT_CARDS.map((config) => {
        const breakdown = config.getBreakdown(stats);
        return (
          <KPICard
            key={config.key}
            value={config.getValue(stats)}
            label={config.getLabel(stats)}
            accentColor={config.accentColor}
            {...(breakdown ? { breakdown } : {})}
          />
        );
      })}
    </div>
  );
}
