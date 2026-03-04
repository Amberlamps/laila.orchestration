/**
 * Task Completion Rate Chart
 *
 * Renders a cumulative line chart showing the total number of tasks completed
 * over time for a given project. A horizontal ReferenceLine at the total task
 * count gives visual context for how close the project is to full completion.
 *
 * States:
 * - Loading: Skeleton placeholder matching the chart card dimensions.
 * - Empty: "No tasks completed yet" message.
 * - Data: Recharts LineChart with cumulative completion line.
 */
import { format, parseISO } from 'date-fns';
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskCompletionRate } from '@/lib/query-hooks';

import { ChartTooltip } from './chart-tooltip';

import type { ChartTooltipEntry } from './chart-tooltip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Chart container height in pixels. */
const CHART_HEIGHT = 280;

/** Stroke color for the completion line (Tailwind emerald-500). */
const LINE_COLOR = '#10b981';

/** Stroke color for the reference line (Tailwind zinc-400). */
const REFERENCE_LINE_COLOR = '#a1a1aa';

/** Stroke color for the cartesian grid (Tailwind zinc-200). */
const GRID_COLOR = '#e4e4e7';

/** Active dot hover radius. */
const ACTIVE_DOT_RADIUS = 6;

/** Line stroke width. */
const LINE_STROKE_WIDTH = 2;

// ---------------------------------------------------------------------------
// X-Axis tick formatter
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string to "MMM d" (e.g., "Feb 28").
 * Falls back to the raw value if parsing fails.
 */
function formatXAxisTick(value: string): string {
  try {
    return format(parseISO(value), 'MMM d');
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// Custom Tooltip Wrapper
// ---------------------------------------------------------------------------

interface RechartsTooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface RechartsTooltipContentProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<RechartsTooltipPayloadEntry>;
}

/**
 * Bridges Recharts' tooltip payload into the shared ChartTooltip component,
 * remapping the dataKey name to a human-readable label.
 */
function CompletionTooltipContent(props: RechartsTooltipContentProps) {
  const mappedPayload: ChartTooltipEntry[] | undefined = props.payload?.map((entry) => ({
    name: 'Tasks Completed',
    value: entry.value,
    color: LINE_COLOR,
  }));

  return <ChartTooltip active={props.active} label={props.label} payload={mappedPayload} />;
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function TaskCompletionRateChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton width="20px" height="20px" rounded="rounded" />
          <Skeleton width="180px" height="20px" rounded="rounded-sm" />
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

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function TaskCompletionRateChartEmpty() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Task Completion Rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="flex items-center justify-center text-sm text-zinc-400"
          style={{ height: `${String(CHART_HEIGHT)}px` }}
        >
          No tasks completed yet
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface TaskCompletionRateChartProps {
  /** The project ID to fetch completion rate data for. */
  projectId: string;
}

/**
 * TaskCompletionRateChart displays a cumulative line chart of tasks completed
 * over time inside a Card. A dashed ReferenceLine at the total task count
 * provides visual context for overall progress.
 */
export function TaskCompletionRateChart({ projectId }: TaskCompletionRateChartProps) {
  const { data, isLoading } = useTaskCompletionRate(projectId);

  if (isLoading) {
    return <TaskCompletionRateChartSkeleton />;
  }

  const chartData = data?.data ?? [];
  const totalTasks = data?.total_tasks ?? 0;

  // Show empty state when there are no data points or the cumulative count
  // never rises above zero.
  const hasCompletions =
    chartData.length > 0 && chartData.some((point) => point.cumulative_completed > 0);

  if (!hasCompletions) {
    return <TaskCompletionRateChartEmpty />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          Task Completion Rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxisTick}
              tick={{ fontSize: 12, fill: '#71717a' }}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: '#71717a' }}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
              label={{
                value: 'Tasks Completed',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 12, fill: '#71717a', textAnchor: 'middle' },
              }}
              domain={[0, totalTasks > 0 ? totalTasks : 'auto']}
            />
            <Tooltip
              content={(props: RechartsTooltipContentProps) => (
                <CompletionTooltipContent {...props} />
              )}
            />
            {totalTasks > 0 && (
              <ReferenceLine
                y={totalTasks}
                stroke={REFERENCE_LINE_COLOR}
                strokeDasharray="3 3"
                label={{
                  value: `Total: ${String(totalTasks)}`,
                  position: 'right',
                  fill: REFERENCE_LINE_COLOR,
                  fontSize: 12,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="cumulative_completed"
              stroke={LINE_COLOR}
              strokeWidth={LINE_STROKE_WIDTH}
              dot
              activeDot={{ r: ACTIVE_DOT_RADIUS }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
