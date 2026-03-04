# Implement Cost Tracking Card

## Task Details

- **Title:** Implement Cost Tracking Card
- **Status:** Complete
- **Assigned Agent:** ui-designer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a cost tracking card on the project overview tab that displays the cumulative total cost in USD, total token count, and a Recharts stacked area chart showing cost breakdown over time by worker or story.

### Cost Tracking Card Component

```typescript
// apps/web/src/components/project/overview/cost-tracking-card.tsx
// Card displaying project cost metrics and a stacked area chart.
// Shows cumulative spend, token usage, and cost breakdown.

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { projectKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { DollarSign } from 'lucide-react';
import type { CostTrackingData } from '@laila/shared';

/**
 * CostTrackingCard renders:
 *
 * 1. Header section:
 *    - Card title: "Cost Tracking" with DollarSign icon
 *    - Large cumulative total cost in USD:
 *      - Font: JetBrains Mono, text-3xl, font-bold
 *      - Format: "$1,234.56" using Intl.NumberFormat
 *    - Token count subtitle:
 *      - Font: JetBrains Mono, text-sm, text-zinc-500
 *      - Format: "1,234,567 tokens" with comma separators
 *
 * 2. Stacked area chart (Recharts):
 *    - ResponsiveContainer height: 240px
 *    - X-axis: dates formatted as "MMM D"
 *    - Y-axis: cost in USD, formatted with "$" prefix
 *    - Stacked areas: one per worker (or per story, toggleable)
 *      - Each area uses a distinct color from a predefined palette:
 *        indigo-500, emerald-500, amber-500, rose-500, cyan-500,
 *        violet-500, orange-500, teal-500
 *      - fillOpacity: 0.3 for translucent fill
 *      - strokeWidth: 1.5
 *    - Legend: horizontal, bottom position, showing worker/story names
 *    - CartesianGrid: dashed, zinc-200
 *    - Custom tooltip showing date, worker/story name, and cost
 *
 * Empty state: "No cost data available" when project has no cost records.
 */
```

### Currency Formatting

```typescript
// apps/web/src/lib/format-currency.ts
// Utility for consistent USD currency formatting.

/**
 * formatUSD(amount: number): string
 * Uses Intl.NumberFormat with:
 * - style: "currency"
 * - currency: "USD"
 * - minimumFractionDigits: 2
 * - maximumFractionDigits: 2
 *
 * Example: formatUSD(1234.5) => "$1,234.50"
 */

/**
 * formatTokenCount(count: number): string
 * Uses Intl.NumberFormat for comma-separated integer formatting.
 *
 * Example: formatTokenCount(1234567) => "1,234,567 tokens"
 */
```

### Data Fetching

```typescript
// Fetch cost tracking data for the project.
// Returns total_cost_usd, total_tokens, and daily cost breakdown by worker.

const useProjectCostTracking = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.costTracking(projectId),
    queryFn: () => apiClient.get(`/api/v1/projects/${projectId}/metrics/cost`),
    enabled: !!projectId,
  });
};
```

## Acceptance Criteria

- [ ] Overview tab displays a "Cost Tracking" card with DollarSign icon
- [ ] Cumulative total cost is displayed in large JetBrains Mono font (text-3xl, font-bold)
- [ ] Cost is formatted as USD with `$` prefix and comma separators (e.g., "$1,234.56")
- [ ] Total token count is displayed as subtitle in JetBrains Mono text-sm text-zinc-500
- [ ] Stacked area chart renders inside a ResponsiveContainer with 240px height
- [ ] X-axis displays dates formatted as "MMM D"
- [ ] Y-axis displays cost values with `$` prefix
- [ ] Each worker/story is represented as a distinct stacked area with unique color
- [ ] Area fills use 0.3 opacity for translucent layering
- [ ] Legend at the bottom shows worker/story names with corresponding colors
- [ ] CartesianGrid is dashed with zinc-200 stroke
- [ ] Custom tooltip displays date, worker/story name, and cost on hover
- [ ] Empty state displays "No cost data available" when no cost records exist
- [ ] Loading state displays Skeleton placeholders for the cost display and chart
- [ ] No `any` types are used in the implementation

## Technical Notes

- JetBrains Mono font should be configured in the project from Epic 8 (UI Foundation). Apply it via the `font-mono` class or a custom class mapped to JetBrains Mono.
- The color palette for stacked areas should support at least 8 distinct colors for projects with many workers. If there are more than 8 workers, group smaller contributors into an "Other" category.
- The `formatUSD` and `formatTokenCount` utilities should be placed in `@/lib/format-currency.ts` for reuse across the application.
- Recharts' `AreaChart` with `stackOffset="none"` is the appropriate configuration for stacked areas showing cumulative cost breakdown.

## References

- **Chart Library:** Recharts — AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
- **Fonts:** JetBrains Mono for monetary and numeric values
- **Design System:** Card components from shadcn/ui
- **Icons:** Lucide React — DollarSign
- **API:** `GET /api/v1/projects/:id/metrics/cost`

## Estimated Complexity

High — Stacked area chart with dynamic series (one per worker), color palette management, USD formatting, and the combination of headline metrics with visualization.
