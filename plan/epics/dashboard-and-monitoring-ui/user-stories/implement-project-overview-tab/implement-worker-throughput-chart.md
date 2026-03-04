# Implement Worker Throughput Chart

## Task Details

- **Title:** Implement Worker Throughput Chart
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a line chart on the project overview tab showing stories completed over time (daily granularity). Uses Recharts for chart rendering with design system colors and responsive sizing.

### Throughput Chart Component

```typescript
// apps/web/src/components/project/overview/worker-throughput-chart.tsx
// Recharts line chart showing stories completed per day over the project lifetime.
// X-axis: dates, Y-axis: count of stories completed on that day.

import { useQuery } from '@tanstack/react-query';
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
import { projectKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { TrendingUp } from 'lucide-react';
import type { ThroughputDataPoint } from '@laila/shared';

/**
 * WorkerThroughputChart renders:
 *
 * - Card with header: "Story Throughput" with TrendingUp icon
 * - Recharts LineChart inside a ResponsiveContainer (height: 280px)
 * - X-axis: date labels formatted as "MMM D" (e.g., "Feb 28")
 *   - Uses tickFormatter for date formatting
 *   - Rotated labels at 45 degrees if > 14 data points
 * - Y-axis: integer count, starting at 0
 *   - Label: "Stories Completed"
 *   - allowDecimals: false
 * - Line: indigo-500 stroke, 2px width, dot on each data point
 *   - activeDot: larger (r=6) on hover
 * - CartesianGrid: dashed, zinc-200 stroke
 * - Tooltip: custom tooltip showing date and count
 *
 * Empty state: "No throughput data yet" with subtle message
 * when no stories have been completed.
 */
```

### Custom Tooltip

```typescript
// apps/web/src/components/project/overview/chart-tooltip.tsx
// Shared custom tooltip component for Recharts charts.
// Consistent styling with the design system.

/**
 * ChartTooltip renders:
 * - White background with shadow-lg, rounded-lg, border
 * - Date formatted as full date (e.g., "February 28, 2026")
 * - Metric label and value in bold
 * - Uses design system font and color tokens
 */
```

### Data Fetching

```typescript
// Fetch daily throughput data for the project.
// Returns array of { date: string, completed: number } objects.

const useProjectThroughput = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.throughput(projectId),
    queryFn: () => apiClient.get(`/api/v1/projects/${projectId}/metrics/throughput`),
    enabled: !!projectId,
  });
};
```

## Acceptance Criteria

- [ ] Overview tab displays a "Story Throughput" card with TrendingUp icon
- [ ] Card contains a Recharts LineChart inside a ResponsiveContainer with 280px height
- [ ] X-axis displays dates formatted as "MMM D" (e.g., "Feb 28")
- [ ] Y-axis displays integer counts starting at 0 with "Stories Completed" label
- [ ] Line uses indigo-500 color, 2px stroke width, with dots on data points
- [ ] Active dot on hover is larger (r=6) for clear hover indication
- [ ] CartesianGrid is dashed with zinc-200 stroke color
- [ ] Custom tooltip displays the full date and story count on hover
- [ ] Chart is responsive — RespsonsiveContainer adapts to parent width
- [ ] Date labels are rotated at 45 degrees when there are more than 14 data points
- [ ] Empty state displays "No throughput data yet" when no stories have been completed
- [ ] Loading state displays a Skeleton placeholder matching the chart dimensions
- [ ] No `any` types are used in the implementation

## Technical Notes

- Recharts `ResponsiveContainer` requires a parent with explicit width. Ensure the card content has proper width constraints.
- Date formatting should use `Intl.DateTimeFormat` for locale-aware output. The X-axis `tickFormatter` receives the raw date string and should return the short format.
- The API endpoint returns daily aggregated data. If the project spans many months, consider showing weekly aggregation or allowing the user to select a date range in a future iteration.
- The shared `ChartTooltip` component will be reused by the Task Completion Rate Chart and Cost Tracking Chart.

## References

- **Chart Library:** Recharts — LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
- **Design System:** Card components from shadcn/ui, design token colors
- **Icons:** Lucide React — TrendingUp
- **API:** `GET /api/v1/projects/:id/metrics/throughput`

## Estimated Complexity

Medium — Recharts integration with custom tooltip, responsive sizing, date formatting, and conditional label rotation.
