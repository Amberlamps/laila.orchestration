# Implement Task Completion Rate Chart

## Task Details

- **Title:** Implement Task Completion Rate Chart
- **Status:** Not Started
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a cumulative line chart on the project overview tab showing the total number of tasks completed over time. This chart provides visibility into the project's velocity and whether work is accelerating or plateauing.

### Completion Rate Chart Component

```typescript
// apps/web/src/components/project/overview/task-completion-rate-chart.tsx
// Recharts line chart showing cumulative tasks completed over time.
// X-axis: dates, Y-axis: cumulative count of completed tasks.

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChartTooltip } from "@/components/project/overview/chart-tooltip";
import { projectKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api-client";
import { CheckCircle2 } from "lucide-react";
import type { CompletionRateDataPoint } from "@laila/shared";

/**
 * TaskCompletionRateChart renders:
 *
 * - Card with header: "Task Completion Rate" with CheckCircle2 icon
 * - Recharts LineChart inside a ResponsiveContainer (height: 280px)
 * - X-axis: date labels formatted as "MMM D"
 * - Y-axis: cumulative task count, starting at 0
 *   - Max set to total task count (shows a ReferenceLine for "total")
 *   - Label: "Tasks Completed"
 *   - allowDecimals: false
 * - Line: emerald-500 stroke, 2px width, smooth curve (type="monotone")
 *   - Dot on each data point, activeDot on hover (r=6)
 * - ReferenceLine: horizontal dashed line at total task count
 *   - Label "Total: N" positioned at right
 *   - stroke: zinc-400, strokeDasharray: "3 3"
 * - CartesianGrid: dashed, zinc-200 stroke
 * - Custom tooltip using shared ChartTooltip component
 *
 * Empty state: "No tasks completed yet" with subtle message.
 */
```

### Data Fetching

```typescript
// Fetch cumulative completion data for the project.
// Returns array of { date: string, cumulative_completed: number } objects
// and a total_tasks count.

const useTaskCompletionRate = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.completionRate(projectId),
    queryFn: () =>
      apiClient.get(`/api/v1/projects/${projectId}/metrics/completion-rate`),
    enabled: !!projectId,
  });
};
```

## Acceptance Criteria

- [ ] Overview tab displays a "Task Completion Rate" card with CheckCircle2 icon
- [ ] Card contains a Recharts LineChart inside a ResponsiveContainer with 280px height
- [ ] X-axis displays dates formatted as "MMM D"
- [ ] Y-axis displays cumulative task counts starting at 0 with "Tasks Completed" label
- [ ] Line uses emerald-500 color, 2px stroke, monotone curve type
- [ ] Active dot on hover is larger (r=6) for clear hover indication
- [ ] A horizontal ReferenceLine is drawn at the total task count with "Total: N" label
- [ ] ReferenceLine uses zinc-400 color with dashed stroke pattern
- [ ] CartesianGrid is dashed with zinc-200 stroke color
- [ ] Custom tooltip displays the full date and cumulative count on hover
- [ ] Chart uses the shared ChartTooltip component for consistent tooltip styling
- [ ] Empty state displays "No tasks completed yet" when cumulative count is 0
- [ ] Loading state displays a Skeleton placeholder matching the chart dimensions
- [ ] No `any` types are used in the implementation

## Technical Notes

- The cumulative nature of this chart means the line should always be non-decreasing. The API returns pre-computed cumulative values.
- The ReferenceLine at the total task count provides visual context for how far along the project is toward full completion.
- This chart uses `type="monotone"` for smooth curves, unlike the throughput chart which may use default linear interpolation. This is a design choice for visual distinction.
- The shared `ChartTooltip` component from the throughput chart should be reused here.

## References

- **Chart Library:** Recharts — LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
- **Shared Component:** ChartTooltip from worker throughput chart task
- **Design System:** Card components from shadcn/ui, design token colors
- **Icons:** Lucide React — CheckCircle2
- **API:** `GET /api/v1/projects/:id/metrics/completion-rate`

## Estimated Complexity

Medium — Similar to the throughput chart but with additional ReferenceLine for total tasks and cumulative data handling.
