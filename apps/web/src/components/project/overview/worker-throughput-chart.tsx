/**
 * WorkerThroughputChart — Recharts line chart showing stories completed per day.
 *
 * Renders:
 * - Card with header: "Story Throughput" with TrendingUp icon
 * - Recharts LineChart inside a ResponsiveContainer (height: 280px)
 * - X-axis: date labels formatted as "MMM D" (e.g., "Feb 28")
 *   - Rotated labels at 45 degrees if > 14 data points
 * - Y-axis: integer count, starting at 0, label "Stories Completed"
 * - Line: indigo-500 stroke, 2px width, dot on each data point, activeDot r=6
 * - CartesianGrid: dashed, zinc-200 stroke
 * - Custom tooltip showing date and count
 *
 * States:
 * - Loading: Skeleton placeholder matching chart dimensions
 * - Empty: "No throughput data yet" message
 * - Error: Error message with details
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { ChartTooltip } from './chart-tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single data point in the throughput time series. */
interface ThroughputDataPoint {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Number of stories completed on this date. */
  completed: number;
}

/** API response shape for the throughput endpoint. */
interface ThroughputResponse {
  data: ThroughputDataPoint[];
}

/** Props for the WorkerThroughputChart component. */
interface WorkerThroughputChartProps {
  /** The project ID to fetch throughput data for. */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold above which X-axis date labels are rotated 45 degrees. */
const LABEL_ROTATION_THRESHOLD = 14;

/** Chart height in pixels. */
const CHART_HEIGHT = 280;

/** Design system colors used by the chart (Tailwind defaults). */
const COLORS = {
  indigo500: '#6366f1',
  indigo600: '#4f46e5',
  zinc200: '#e4e4e7',
  zinc400: '#a1a1aa',
  zinc500: '#71717a',
} as const;

// ---------------------------------------------------------------------------
// Data fetching hook (local — not in query-hooks.ts)
// ---------------------------------------------------------------------------

/**
 * Query key for project throughput data.
 * Scoped under the project's key prefix for cache invalidation.
 */
const throughputQueryKey = (projectId: string) =>
  ['projects', projectId, 'metrics', 'throughput'] as const;

/**
 * Fetches daily throughput data for a project.
 * Returns an array of { date, completed } objects.
 */
function useProjectThroughput(projectId: string) {
  return useQuery({
    queryKey: throughputQueryKey(projectId),
    queryFn: async (): Promise<ThroughputDataPoint[]> => {
      const response = await fetch(`/api/v1/projects/${projectId}/metrics/throughput`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(
          body !== null &&
            typeof body === 'object' &&
            'error' in body &&
            body.error !== null &&
            typeof body.error === 'object' &&
            'message' in body.error &&
            typeof body.error.message === 'string'
            ? body.error.message
            : `Failed to fetch throughput data (${String(response.status)})`,
        );
      }
      const json = (await response.json()) as ThroughputResponse;
      return json.data;
    },
    enabled: !!projectId,
  });
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Formats a date string as abbreviated month + day (e.g., "Feb 28").
 * Uses Intl.DateTimeFormat for locale-aware output.
 */
function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Skeleton loading state matching the chart card dimensions. */
function ThroughputChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton width="20px" height="20px" rounded="rounded" />
          <Skeleton width="140px" height="20px" rounded="rounded-sm" />
        </div>
      </CardHeader>
      <CardContent>
        <div role="status" aria-live="polite" aria-label="Loading chart">
          <Skeleton width="100%" height={`${String(CHART_HEIGHT)}px`} rounded="rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

/** Empty state when no throughput data is available. */
function ThroughputEmptyState() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <TrendingUp className="mb-3 h-10 w-10 text-zinc-300" />
      <p className="text-sm font-medium text-zinc-500">No throughput data yet</p>
      <p className="mt-1 text-xs text-zinc-400">Completed stories will appear here over time.</p>
    </div>
  );
}

/** Error state when the throughput fetch fails. */
function ThroughputErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <p className="text-sm font-medium text-red-600">Failed to load throughput data</p>
      <p className="mt-1 text-xs text-zinc-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * WorkerThroughputChart renders a line chart of stories completed per day
 * inside a Card with a "Story Throughput" header and TrendingUp icon.
 */
function WorkerThroughputChart({ projectId }: WorkerThroughputChartProps) {
  const { data, isLoading, isError, error } = useProjectThroughput(projectId);

  if (isLoading) {
    return <ThroughputChartSkeleton />;
  }

  const hasData = data !== undefined && data.length > 0;
  const shouldRotateLabels = hasData && data.length > LABEL_ROTATION_THRESHOLD;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5 text-indigo-500" />
          Story Throughput
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <ThroughputErrorState
            message={error instanceof Error ? error.message : 'An unexpected error occurred'}
          />
        ) : !hasData ? (
          <ThroughputEmptyState />
        ) : (
          <div className="w-full" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{
                  top: 8,
                  right: 16,
                  bottom: shouldRotateLabels ? 48 : 8,
                  left: 8,
                }}
              >
                <CartesianGrid strokeDasharray="4 4" stroke={COLORS.zinc200} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{
                    fontSize: 12,
                    fill: COLORS.zinc500,
                  }}
                  angle={shouldRotateLabels ? -45 : 0}
                  textAnchor={shouldRotateLabels ? 'end' : 'middle'}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.zinc200 }}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, 'auto']}
                  tick={{
                    fontSize: 12,
                    fill: COLORS.zinc500,
                  }}
                  tickLine={false}
                  axisLine={{ stroke: COLORS.zinc200 }}
                  label={{
                    value: 'Stories Completed',
                    angle: -90,
                    position: 'insideLeft',
                    style: {
                      fontSize: 12,
                      fill: COLORS.zinc400,
                      textAnchor: 'middle',
                    },
                  }}
                />
                <Tooltip content={<ChartTooltip metricLabel="Stories Completed" />} />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Stories Completed"
                  stroke={COLORS.indigo500}
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    fill: COLORS.indigo500,
                    stroke: COLORS.indigo500,
                    strokeWidth: 1,
                  }}
                  activeDot={{
                    r: 6,
                    fill: COLORS.indigo500,
                    stroke: '#ffffff',
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { WorkerThroughputChart, ThroughputChartSkeleton };
export type { ThroughputDataPoint, WorkerThroughputChartProps };
