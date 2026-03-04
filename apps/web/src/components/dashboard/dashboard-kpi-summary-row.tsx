/**
 * Dashboard KPI Summary Row
 *
 * Renders a responsive horizontal row of 5 KPI stat cards at the top of the
 * global dashboard. Each card displays a key metric aggregated across all
 * projects for the authenticated user.
 *
 * Cards:
 * 1. Total Projects  -- count with status breakdown subtitle
 * 2. Active Workers  -- count of currently assigned workers
 * 3. Total Failures  -- danger variant (red) when count > 0, clickable
 * 4. Total Blocked   -- warning variant (amber) when count > 0, clickable
 * 5. Aggregate Cost  -- USD formatted with total tokens subtitle, JetBrains Mono
 *
 * Layout:
 * - Desktop (>= 1024px): 5 equal columns
 * - Tablet  (>= 768px):  3 columns (wraps to 3 + 2)
 * - Mobile  (< 768px):   1 column stack
 */
import { AlertTriangle, Bot, DollarSign, FolderKanban, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/router';

import { SkeletonKPICard } from '@/components/ui/skeleton';
import { useDashboardStats } from '@/lib/query-hooks';
import { cn } from '@/lib/utils';

import type { DashboardStats } from '@/lib/query-hooks';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** USD currency formatter with $ prefix and comma separators. */
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Standard number formatter for large counts (e.g., 1,234,567). */
const numberFormatter = new Intl.NumberFormat('en-US');

// ---------------------------------------------------------------------------
// Card variant helpers
// ---------------------------------------------------------------------------

type CardVariant = 'default' | 'warning' | 'danger';

/**
 * Returns Tailwind classes for card border accent, value text color, and
 * icon color based on the card's variant.
 */
function getVariantStyles(variant: CardVariant): {
  border: string;
  valueColor: string;
  iconColor: string;
} {
  switch (variant) {
    case 'danger':
      return {
        border: 'border-l-red-500',
        valueColor: 'text-red-600',
        iconColor: 'text-red-500',
      };
    case 'warning':
      return {
        border: 'border-l-amber-500',
        valueColor: 'text-amber-600',
        iconColor: 'text-amber-500',
      };
    default:
      return {
        border: 'border-l-indigo-500',
        valueColor: 'text-zinc-900',
        iconColor: 'text-indigo-500',
      };
  }
}

// ---------------------------------------------------------------------------
// KPI card configuration
// ---------------------------------------------------------------------------

interface KPICardConfig {
  key: string;
  title: string;
  icon: LucideIcon;
  getValue: (stats: DashboardStats) => string;
  getSubtitle: (stats: DashboardStats) => string;
  getVariant: (stats: DashboardStats) => CardVariant;
  /** When defined, clicking the card navigates to this URL. */
  getHref: ((stats: DashboardStats) => string) | null;
  /** Whether to use JetBrains Mono (font-mono) for the value. */
  monoValue?: boolean;
}

/**
 * Builds a human-readable subtitle from the project status breakdown.
 * E.g., "3 draft, 5 in progress, 4 completed"
 */
function buildStatusSubtitle(stats: DashboardStats): string {
  const parts: string[] = [];
  if (stats.projectsByStatus.draft > 0) {
    parts.push(`${String(stats.projectsByStatus.draft)} draft`);
  }
  if (stats.projectsByStatus.active > 0) {
    parts.push(`${String(stats.projectsByStatus.active)} in progress`);
  }
  if (stats.projectsByStatus.completed > 0) {
    parts.push(`${String(stats.projectsByStatus.completed)} completed`);
  }
  if (stats.projectsByStatus.ready > 0) {
    parts.push(`${String(stats.projectsByStatus.ready)} ready`);
  }
  return parts.length > 0 ? parts.join(', ') : 'No projects';
}

const KPI_CARDS: KPICardConfig[] = [
  {
    key: 'total-projects',
    title: 'Total Projects',
    icon: FolderKanban,
    getValue: (stats) => String(stats.totalProjects),
    getSubtitle: buildStatusSubtitle,
    getVariant: () => 'default',
    getHref: null,
  },
  {
    key: 'active-workers',
    title: 'Active Workers',
    icon: Bot,
    getValue: (stats) => String(stats.activeWorkers),
    getSubtitle: () => 'Currently assigned',
    getVariant: () => 'default',
    getHref: null,
  },
  {
    key: 'total-failures',
    title: 'Total Failures',
    icon: AlertTriangle,
    getValue: (stats) => String(stats.totalFailures),
    getSubtitle: () => 'Failed stories',
    getVariant: (stats) => (stats.totalFailures > 0 ? 'danger' : 'default'),
    getHref: () => '/projects?status=active&storyStatus=failed',
  },
  {
    key: 'total-blocked',
    title: 'Total Blocked',
    icon: ShieldAlert,
    getValue: (stats) => String(stats.totalBlocked),
    getSubtitle: () => 'Blocked stories',
    getVariant: (stats) => (stats.totalBlocked > 0 ? 'warning' : 'default'),
    getHref: () => '/projects?status=active&storyStatus=blocked',
  },
  {
    key: 'aggregate-cost',
    title: 'Aggregate Cost',
    icon: DollarSign,
    getValue: (stats) => currencyFormatter.format(stats.aggregateCost),
    getSubtitle: (stats) => `${numberFormatter.format(stats.totalTokens)} tokens`,
    getVariant: () => 'default',
    getHref: null,
    monoValue: true,
  },
];

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Number of KPI skeleton cards matches the actual card count (5). */
const KPI_SKELETON_COUNT = 5;

function KPISummaryRowSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5"
      role="status"
      aria-label="Loading dashboard statistics"
    >
      {Array.from({ length: KPI_SKELETON_COUNT }).map((_, i) => (
        <SkeletonKPICard key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual stat card (internal component)
// ---------------------------------------------------------------------------

interface StatCardProps {
  config: KPICardConfig;
  stats: DashboardStats;
}

function StatCard({ config, stats }: StatCardProps) {
  const router = useRouter();
  const variant = config.getVariant(stats);
  const styles = getVariantStyles(variant);
  const value = config.getValue(stats);
  const subtitle = config.getSubtitle(stats);
  const href = config.getHref ? config.getHref(stats) : null;
  const Icon = config.icon;
  const isClickable = href !== null;

  const handleClick = () => {
    if (href) {
      void router.push(href);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (href && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      void router.push(href);
    }
  };

  return (
    <div
      data-testid={`kpi-card-${config.key}`}
      className={cn(
        'rounded-md border border-l-[3px] border-zinc-200 bg-white shadow-sm',
        styles.border,
        isClickable && 'cursor-pointer transition-shadow hover:shadow-md',
      )}
      {...(isClickable
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: handleClick,
            onKeyDown: handleKeyDown,
            'aria-label': `${config.title}: ${value}. Click to view details.`,
          }
        : {})}
    >
      <div className="p-4">
        {/* Header row: icon + title */}
        <div className="mb-1 flex items-center gap-2">
          <Icon className={cn('size-4 shrink-0', styles.iconColor)} aria-hidden="true" />
          <span className="text-caption text-zinc-500">{config.title}</span>
        </div>

        {/* Primary value */}
        <div
          className={cn('text-display mt-1', styles.valueColor, config.monoValue && 'font-mono')}
        >
          {value}
        </div>

        {/* Subtitle */}
        <div className="text-caption mt-1 text-zinc-400">{subtitle}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

/**
 * Horizontal row of 5 KPI stat cards for the global dashboard.
 *
 * Fetches cross-project summary data via TanStack Query (`useDashboardStats`)
 * and renders each card with the appropriate Lucide icon, color variant, and
 * click-to-filter navigation.
 *
 * Responsive grid:
 * - Desktop (>= 1024px): 5 equal columns
 * - Tablet  (>= 768px):  3 columns (wraps to 3 + 2)
 * - Mobile  (< 768px):   1 column stack
 */
export function DashboardKpiSummaryRow() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading || !stats) {
    return <KPISummaryRowSkeleton />;
  }

  return (
    <div
      data-testid="dashboard-kpi-summary-row"
      className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5"
    >
      {KPI_CARDS.map((config) => (
        <StatCard key={config.key} config={config} stats={stats} />
      ))}
    </div>
  );
}
