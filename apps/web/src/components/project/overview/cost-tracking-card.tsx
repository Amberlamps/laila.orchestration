'use client';

/**
 * Cost Tracking Card for the project overview tab.
 *
 * Displays cumulative total cost in USD, total token count, and a Recharts
 * stacked area chart showing cost breakdown over time by worker or story.
 */
import { format, parseISO } from 'date-fns';
import { DollarSign } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTokenCount, formatUSD } from '@/lib/format-currency';
import { useProjectCostTracking } from '@/lib/query-hooks';

import type { CostTrackingDailyEntry } from '@/lib/query-hooks';

// ---------------------------------------------------------------------------
// Color palette for stacked area series
// ---------------------------------------------------------------------------

const AREA_COLORS = [
  '#6366f1', // indigo-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
] as const;

const MAX_SERIES = 8;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CostTrackingCardProps {
  /** The project ID to fetch cost data for. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

/** Shape of a single tooltip payload entry for the cost chart. */
interface CostTooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
}

/**
 * Renders a styled tooltip for the cost tracking area chart.
 *
 * The `payload` parameter comes from Recharts at runtime and may be empty
 * or absent before the user hovers a data point.
 */
function renderCostTooltipContent(
  active: boolean,
  label: string | number | undefined,
  payload: ReadonlyArray<CostTooltipPayloadEntry>,
) {
  if (!active || payload.length === 0) {
    return null;
  }

  const dateLabel = typeof label === 'string' ? formatDateLabel(label) : label;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-zinc-700">{dateLabel}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-600">{entry.name}:</span>
          <span className="font-mono font-medium text-zinc-900">{formatUSD(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date formatting helper
// ---------------------------------------------------------------------------

/** Formats an ISO date string to "MMM d" (e.g. "Jan 5"). */
function formatDateLabel(dateString: string): string {
  try {
    return format(parseISO(dateString), 'MMM d');
  } catch {
    return dateString;
  }
}

// ---------------------------------------------------------------------------
// Y-Axis tick formatter
// ---------------------------------------------------------------------------

function formatYAxisTick(value: number): string {
  return `$${String(value)}`;
}

// ---------------------------------------------------------------------------
// Helpers for grouping overflow series into "Other"
// ---------------------------------------------------------------------------

/**
 * When there are more series than the palette supports, the smallest
 * contributors are grouped into an "Other" aggregate series.
 */
function consolidateSeries(
  series: string[],
  daily: CostTrackingDailyEntry[],
): { consolidatedSeries: string[]; consolidatedDaily: CostTrackingDailyEntry[] } {
  if (series.length <= MAX_SERIES) {
    return { consolidatedSeries: series, consolidatedDaily: daily };
  }

  // Sum totals per series across all days
  const totals = new Map<string, number>();
  for (const name of series) {
    totals.set(name, 0);
  }
  for (const day of daily) {
    for (const name of series) {
      const val = day[name];
      if (typeof val === 'number') {
        totals.set(name, (totals.get(name) ?? 0) + val);
      }
    }
  }

  // Sort descending by total, keep top (MAX_SERIES - 1), rest become "Other"
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const topSeries = sorted.slice(0, MAX_SERIES - 1).map(([name]) => name);
  const otherSeries = sorted.slice(MAX_SERIES - 1).map(([name]) => name);

  const consolidatedSeries = [...topSeries, 'Other'];
  const consolidatedDaily = daily.map((day) => {
    const newDay: CostTrackingDailyEntry = { date: day.date };
    for (const name of topSeries) {
      newDay[name] = day[name] ?? 0;
    }
    let otherSum = 0;
    for (const name of otherSeries) {
      const val = day[name];
      if (typeof val === 'number') {
        otherSum += val;
      }
    }
    newDay['Other'] = otherSum;
    return newDay;
  });

  return { consolidatedSeries, consolidatedDaily };
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function CostTrackingCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton width="20px" height="20px" rounded="rounded" />
          <Skeleton width="120px" height="16px" rounded="rounded-sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div
          role="status"
          aria-live="polite"
          aria-label="Loading cost tracking data"
          className="space-y-3"
        >
          {/* Large cost value */}
          <Skeleton width="160px" height="36px" rounded="rounded-sm" />
          {/* Token count */}
          <Skeleton width="140px" height="14px" rounded="rounded-sm" />
          {/* Chart placeholder */}
          <div className="mt-4">
            <Skeleton width="100%" height="240px" rounded="rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function CostTrackingEmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          Cost Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-[240px] items-center justify-center">
          <p className="text-sm text-zinc-500">No cost data available</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CostTrackingCard({ projectId }: CostTrackingCardProps) {
  const { data, isLoading } = useProjectCostTracking(projectId);

  if (isLoading) {
    return <CostTrackingCardSkeleton />;
  }

  if (!data || data.daily.length === 0) {
    return <CostTrackingEmptyState />;
  }

  const { consolidatedSeries, consolidatedDaily } = consolidateSeries(data.series, data.daily);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          Cost Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Headline metrics */}
        <div className="mb-4">
          <p className="font-mono text-3xl font-bold text-zinc-900">
            {formatUSD(data.totalCostUsd)}
          </p>
          <p className="mt-1 font-mono text-sm text-zinc-500">
            {formatTokenCount(data.totalTokens)}
          </p>
        </div>

        {/* Stacked Area Chart */}
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={consolidatedDaily}
            stackOffset="none"
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="#e4e4e7" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fontSize: 12, fill: '#71717a' }}
              axisLine={{ stroke: '#e4e4e7' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatYAxisTick}
              tick={{ fontSize: 12, fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              content={({ active, label, payload }) => {
                const entries: ReadonlyArray<CostTooltipPayloadEntry> =
                  (payload as CostTooltipPayloadEntry[] | undefined) ?? [];
                return renderCostTooltipContent(active, label, entries);
              }}
            />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            {consolidatedSeries.map((seriesName, index) => {
              const color = AREA_COLORS[index % AREA_COLORS.length] ?? '#6366f1';
              return (
                <Area
                  key={seriesName}
                  type="monotone"
                  dataKey={seriesName}
                  stackId="cost"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.3}
                  strokeWidth={1.5}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
