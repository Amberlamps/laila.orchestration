'use client';

/**
 * TaskCompletionRateChart — cumulative line chart showing the total number of
 * tasks completed over time within a project.
 *
 * Visual spec:
 *   - Card header: "Task Completion Rate" with CheckCircle2 icon
 *   - Recharts LineChart inside ResponsiveContainer (280px height)
 *   - X-axis: dates formatted as "MMM D" (e.g., "Jan 5")
 *   - Y-axis: cumulative task count starting at 0, label "Tasks Completed",
 *     allowDecimals: false
 *   - Line: emerald-500 (#10b981), 2px stroke, monotone curve type
 *   - Dot on each data point, activeDot on hover (r=6)
 *   - Horizontal ReferenceLine at total task count with "Total: N" label
 *     (zinc-400 stroke, dashed)
 *   - CartesianGrid: dashed, zinc-200 stroke
 *   - Custom tooltip using shared ChartTooltip component
 *
 * States:
 *   - Loading: Skeleton placeholder matching chart dimensions
 *   - Empty: "No tasks completed yet" message
 *   - Data: Recharts line chart
 *
 * Data is fetched via a local query hook (endpoint not in OpenAPI spec).
 */

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartTooltip } from '@/components/project/overview/chart-tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';

// ---------------------------------------------------------------------------
// Design tokens (raw hex values for Recharts, which does not use Tailwind)
// ---------------------------------------------------------------------------

/** Emerald-500 — primary line color for the completion rate curve. */
const EMERALD_500 = '#10b981';

/** Zinc-200 — cartesian grid stroke color. */
const ZINC_200 = '#e4e4e7';

/** Zinc-400 — reference line stroke and tick color. */
const ZINC_400 = '#a1a1aa';

/** Zinc-500 — axis label color. */
const ZINC_500 = '#71717a';

/** Chart container height in pixels. */
const CHART_HEIGHT = 280;

/** Active dot radius on hover. */
const ACTIVE_DOT_RADIUS = 6;

/** Default dot radius. */
const DOT_RADIUS = 3;

/** Line stroke width. */
const STROKE_WIDTH = 2;

// ---------------------------------------------------------------------------
// Types (local — shared type does not exist yet)
// ---------------------------------------------------------------------------

/** A single data point in the cumulative completion rate series. */
interface CompletionRateDataPoint {
  /** ISO date string (e.g., "2026-01-15"). */
  date: string;
  /** Cumulative number of tasks completed up to and including this date. */
  cumulative_completed: number;
}

/** Shape of the completion rate API response. */
interface CompletionRateResponse {
  data: {
    /** Time series of cumulative completions. */
    dataPoints: CompletionRateDataPoint[];
    /** Total number of tasks in the project (completed + incomplete). */
    totalTasks: number;
  };
}

// ---------------------------------------------------------------------------
// Data fetching hook (local — endpoint not in OpenAPI spec)
// ---------------------------------------------------------------------------

/**
 * Fetches the cumulative task completion rate data for a project.
 *
 * Uses raw `fetch` because this endpoint is not yet in the OpenAPI spec.
 * The query key is scoped under the project detail key so invalidating
 * the project detail also clears this data.
 */
function useTaskCompletionRate(projectId: string) {
  return useQuery({
    queryKey: [...queryKeys.projects.detail(projectId), 'completion-rate'] as const,
    queryFn: async (): Promise<CompletionRateResponse['data']> => {
      const response = await fetch(`/api/v1/projects/${projectId}/metrics/completion-rate`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch completion rate: ${String(response.status)}`);
      }

      const body = (await response.json()) as CompletionRateResponse;
      return body.data;
    },
    enabled: projectId.length > 0,
    staleTime: 30_000, // 30 seconds
  });
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Short month abbreviations for X-axis labels. */
const MONTH_ABBR = [
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

/**
 * Formats an ISO date string as "MMM D" (e.g., "Jan 5").
 * Used for X-axis tick labels.
 */
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const month = MONTH_ABBR[date.getMonth()] ?? 'Jan';
  const day = date.getDate();
  return `${month} ${String(day)}`;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

/** Skeleton placeholder matching the chart card dimensions. */
function CompletionRateChartSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
        <Skeleton width="16px" height="16px" rounded="rounded" />
        <Skeleton width="160px" height="16px" rounded="rounded-sm" />
      </CardHeader>
      <CardContent>
        <div role="status" aria-live="polite" aria-label="Loading task completion rate chart">
          <Skeleton width="100%" height={`${String(CHART_HEIGHT)}px`} rounded="rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/** Empty state when no tasks have been completed yet. */
function CompletionRateEmptyState() {
  return (
    <div
      className="flex items-center justify-center text-sm text-zinc-500"
      style={{ height: `${String(CHART_HEIGHT)}px` }}
    >
      No tasks completed yet
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TaskCompletionRateChartProps {
  /** The project ID to fetch completion rate data for. */
  projectId: string;
}

/**
 * TaskCompletionRateChart renders a cumulative line chart showing the total
 * number of tasks completed over time within a project.
 *
 * The line is non-decreasing (cumulative) and a horizontal dashed reference
 * line indicates the total number of tasks in the project, providing visual
 * context for how far along the project is toward full completion.
 */
export function TaskCompletionRateChart({ projectId }: TaskCompletionRateChartProps) {
  const { data, isLoading } = useTaskCompletionRate(projectId);

  if (isLoading) {
    return <CompletionRateChartSkeleton />;
  }

  const dataPoints = data?.dataPoints ?? [];
  const totalTasks = data?.totalTasks ?? 0;
  const lastPoint = dataPoints[dataPoints.length - 1];
  const latestCompleted = lastPoint?.cumulative_completed ?? 0;
  const hasData = dataPoints.length > 0 && latestCompleted > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
        <CheckCircle2 className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <CardTitle className="text-sm font-semibold">Task Completion Rate</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart data={dataPoints} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ZINC_200} vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fontSize: 12, fill: ZINC_500 }}
                tickLine={false}
                axisLine={{ stroke: ZINC_200 }}
              />

              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: ZINC_500 }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Tasks Completed',
                  angle: -90,
                  position: 'insideLeft',
                  offset: -5,
                  style: { fontSize: 12, fill: ZINC_500, textAnchor: 'middle' },
                }}
                domain={[0, Math.max(totalTasks, 1)]}
              />

              <Tooltip content={<ChartTooltip metricLabel="Tasks Completed" />} />

              {totalTasks > 0 && (
                <ReferenceLine
                  y={totalTasks}
                  stroke={ZINC_400}
                  strokeDasharray="3 3"
                  label={{
                    value: `Total: ${String(totalTasks)}`,
                    position: 'right',
                    fill: ZINC_400,
                    fontSize: 12,
                  }}
                />
              )}

              <Line
                type="monotone"
                dataKey="cumulative_completed"
                name="Tasks Completed"
                stroke={EMERALD_500}
                strokeWidth={STROKE_WIDTH}
                dot={{ r: DOT_RADIUS, fill: EMERALD_500 }}
                activeDot={{ r: ACTIVE_DOT_RADIUS, fill: EMERALD_500 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <CompletionRateEmptyState />
        )}
      </CardContent>
    </Card>
  );
}
