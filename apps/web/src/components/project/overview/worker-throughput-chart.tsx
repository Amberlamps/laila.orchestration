'use client';

/**
 * WorkerThroughputChart — Recharts line chart showing stories completed per day
 * over the project lifetime.
 *
 * Renders:
 * - Card with header: "Story Throughput" with TrendingUp icon
 * - Recharts LineChart inside a ResponsiveContainer (height: 280px)
 * - X-axis: date labels formatted as "MMM D" (e.g., "Feb 28")
 *   - Rotated labels at 45 degrees if > 14 data points
 * - Y-axis: integer count, starting at 0, "Stories Completed" label
 * - Line: indigo-500 stroke, 2px width, dot on each data point
 *   - activeDot: larger (r=6) on hover
 * - CartesianGrid: dashed, zinc-200 stroke
 * - Tooltip: custom ChartTooltip showing date and count
 *
 * Empty state: "No throughput data yet" with subtle message.
 * Loading state: Skeleton placeholder matching chart dimensions.
 */

import { TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectThroughput } from '@/lib/query-hooks';

import { ChartTooltip } from './chart-tooltip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of the chart container in pixels. */
const CHART_HEIGHT = 280;

/** Number of data points above which x-axis labels are rotated. */
const ROTATION_THRESHOLD = 14;

/** Rotation angle in degrees for crowded x-axis labels. */
const LABEL_ROTATION_ANGLE = -45;

/** Indigo-500 from Tailwind's default palette. */
const LINE_COLOR = '#6366f1';

/** Zinc-200 from Tailwind's default palette. */
const GRID_COLOR = '#e4e4e7';

// ---------------------------------------------------------------------------
// Date formatters (using Intl.DateTimeFormat for locale-aware output)
// ---------------------------------------------------------------------------

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

/** Formats an ISO date string to short form (e.g., "Feb 28"). */
function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return shortDateFormatter.format(date);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading skeleton matching the chart card dimensions. */
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
      <p className="mt-1 text-xs text-zinc-400">
        Story completions will appear here once workers begin finishing stories.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip adapter
// ---------------------------------------------------------------------------

/**
 * Adapts the Recharts tooltip payload to our shared ChartTooltip interface.
 * Recharts v3 passes `TooltipContentProps` to the content render function.
 */
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

function ThroughputTooltipContent(props: RechartsTooltipContentProps) {
  return <ChartTooltip active={props.active} label={props.label} payload={props.payload} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkerThroughputChartProps {
  /** The project ID to fetch throughput data for. */
  projectId: string;
}

function WorkerThroughputChart({ projectId }: WorkerThroughputChartProps) {
  const { data, isLoading } = useProjectThroughput(projectId);

  if (isLoading) {
    return <ThroughputChartSkeleton />;
  }

  const hasData = data != null && data.length > 0;
  const shouldRotateLabels = hasData && data.length > ROTATION_THRESHOLD;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5 text-indigo-500" />
          Story Throughput
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, bottom: shouldRotateLabels ? 48 : 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{
                  fontSize: 12,
                  fill: '#71717a', // zinc-500
                }}
                angle={shouldRotateLabels ? LABEL_ROTATION_ANGLE : 0}
                textAnchor={shouldRotateLabels ? 'end' : 'middle'}
                height={shouldRotateLabels ? 60 : 30}
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, 'auto']}
                tick={{
                  fontSize: 12,
                  fill: '#71717a', // zinc-500
                }}
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
                label={{
                  value: 'Stories Completed',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 12, fill: '#71717a', textAnchor: 'middle' },
                }}
                width={80}
              />
              <Tooltip
                content={(props: RechartsTooltipContentProps) => (
                  <ThroughputTooltipContent {...props} />
                )}
              />
              <Line
                type="monotone"
                dataKey="completed"
                name="Stories Completed"
                stroke={LINE_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: LINE_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: LINE_COLOR, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ThroughputEmptyState />
        )}
      </CardContent>
    </Card>
  );
}

export { WorkerThroughputChart };
export type { WorkerThroughputChartProps };
