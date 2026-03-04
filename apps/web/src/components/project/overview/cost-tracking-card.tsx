'use client';

/**
 * CostTrackingCard — displays cumulative project cost, token usage, and a
 * stacked area chart breaking down cost over time by worker or story.
 *
 * Layout:
 * 1. Card header with "Cost Tracking" title and DollarSign icon.
 * 2. Large cumulative total cost in JetBrains Mono (font-mono text-3xl font-bold).
 * 3. Token count subtitle (font-mono text-sm text-zinc-500).
 * 4. Stacked area chart (Recharts) with:
 *    - ResponsiveContainer at 240px height
 *    - X-axis: dates as "MMM D"
 *    - Y-axis: cost with "$" prefix
 *    - One Area per worker/story, stacked with 0.3 fill opacity
 *    - Horizontal legend at bottom
 *    - Dashed CartesianGrid in zinc-200
 *    - Custom tooltip
 * 5. Empty state: "No cost data available"
 * 6. Loading state: Skeleton placeholders
 */

import { useQuery } from '@tanstack/react-query';
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
import { queryKeys } from '@/lib/query-keys';

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single data point in the daily cost time series. */
interface CostDataPoint {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Per-worker (or per-story) cost values keyed by worker/story name. */
  [workerOrStory: string]: number | string;
}

/** Shape of the cost tracking API response. */
interface CostTrackingData {
  /** Cumulative total project cost in USD. */
  total_cost_usd: number;
  /** Cumulative total token count. */
  total_tokens: number;
  /** Ordered list of worker/story names present in the breakdown. */
  series: string[];
  /** Daily cost breakdown. Each entry has a `date` key plus one numeric key per series entry. */
  data: CostDataPoint[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Colour palette for stacked areas. Supports up to 8 distinct series;
 * additional workers/stories are grouped into an "Other" bucket.
 */
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
const CHART_HEIGHT = 240;

/** Returns a colour from the palette for the given index, cycling if needed. */
function getAreaColor(index: number): string {
  return AREA_COLORS[index % AREA_COLORS.length] ?? '#6366f1';
}

// ---------------------------------------------------------------------------
// Data hook (local — not exported to query-hooks.ts per task instructions)
// ---------------------------------------------------------------------------

function useProjectCostTracking(projectId: string) {
  return useQuery({
    queryKey: [...queryKeys.projects.detail(projectId), 'costTracking'] as const,
    queryFn: async (): Promise<CostTrackingData> => {
      const response = await fetch(`/api/v1/projects/${projectId}/metrics/cost`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch cost tracking data: ${String(response.status)}`);
      }

      const body = (await response.json()) as { data: CostTrackingData };
      return body.data;
    },
    enabled: projectId.length > 0,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * If the response contains more series than MAX_SERIES, collapse the smallest
 * contributors into an "Other" bucket and return the consolidated data.
 */
function consolidateSeries(raw: CostTrackingData): CostTrackingData {
  if (raw.series.length <= MAX_SERIES) {
    return raw;
  }

  // Sum each series across all data points to find the largest.
  const totals = new Map<string, number>();
  for (const name of raw.series) {
    let sum = 0;
    for (const point of raw.data) {
      const val = point[name];
      if (typeof val === 'number') {
        sum += val;
      }
    }
    totals.set(name, sum);
  }

  // Sort descending by total and pick the top MAX_SERIES - 1.
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const kept = sorted.slice(0, MAX_SERIES - 1).map(([name]) => name);
  const keptSet = new Set(kept);
  const otherNames = raw.series.filter((n) => !keptSet.has(n));

  const newSeries = [...kept, 'Other'];
  const newData: CostDataPoint[] = raw.data.map((point) => {
    const entry: CostDataPoint = { date: point.date };
    for (const name of kept) {
      entry[name] = point[name] ?? 0;
    }
    let otherSum = 0;
    for (const name of otherNames) {
      const val = point[name];
      if (typeof val === 'number') {
        otherSum += val;
      }
    }
    entry['Other'] = otherSum;
    return entry;
  });

  return {
    total_cost_usd: raw.total_cost_usd,
    total_tokens: raw.total_tokens,
    series: newSeries,
    data: newData,
  };
}

/** Formats an ISO date string as "MMM D" (e.g., "Jan 5", "Dec 31"). */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ] as const;
  const monthIndex = date.getUTCMonth();
  const month = months[monthIndex] ?? 'Jan';
  return `${month} ${String(date.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

interface CustomTooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: ReadonlyArray<CustomTooltipPayloadEntry>;
}

function CostTooltipContent({ active, label, payload }: CustomTooltipProps): ReactNode {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-zinc-700">
        {label != null ? formatDateLabel(label) : ''}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs text-zinc-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.name}</span>
            <span className="ml-auto font-mono font-medium text-zinc-900">
              {formatUSD(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function CostTrackingCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton width="20px" height="20px" rounded="rounded" />
          <Skeleton width="120px" height="18px" rounded="rounded-sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div role="status" aria-live="polite" aria-label="Loading cost data">
          {/* Large cost number placeholder */}
          <Skeleton width="180px" height="36px" rounded="rounded-sm" />
          {/* Token count placeholder */}
          <div className="mt-2">
            <Skeleton width="140px" height="16px" rounded="rounded-sm" />
          </div>
          {/* Chart area placeholder */}
          <div className="mt-6">
            <Skeleton width="100%" height="240px" rounded="rounded-sm" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function CostTrackingEmptyState() {
  return (
    <div className="flex h-[240px] items-center justify-center">
      <p className="text-sm text-zinc-500">No cost data available</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CostTrackingCardProps {
  /** The project ID to fetch cost data for. */
  projectId: string;
}

export function CostTrackingCard({ projectId }: CostTrackingCardProps) {
  const { data: rawData, isLoading } = useProjectCostTracking(projectId);

  if (isLoading) {
    return <CostTrackingCardSkeleton />;
  }

  const data = rawData ? consolidateSeries(rawData) : undefined;
  const isEmpty = !data || data.data.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-zinc-500" />
          Cost Tracking
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Headline metrics */}
        <div className="mb-6">
          <p className="font-mono text-3xl font-bold text-zinc-900">
            {data ? formatUSD(data.total_cost_usd) : '$0.00'}
          </p>
          <p className="mt-1 font-mono text-sm text-zinc-500">
            {data ? formatTokenCount(data.total_tokens) : '0 tokens'}
          </p>
        </div>

        {/* Chart or empty state */}
        {isEmpty ? (
          <CostTrackingEmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart
              data={data.data}
              stackOffset="none"
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="#e4e4e7" /* zinc-200 */
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fontSize: 12, fill: '#71717a' /* zinc-500 */ }}
                axisLine={{ stroke: '#e4e4e7' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => `$${String(value)}`}
                tick={{ fontSize: 12, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CostTooltipContent />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: '12px', color: '#71717a' }}
              />
              {data.series.map((name, index) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stackId="cost"
                  stroke={getAreaColor(index)}
                  fill={getAreaColor(index)}
                  fillOpacity={0.3}
                  strokeWidth={1.5}
                  name={name}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
