# Implement Dashboard KPI Summary Row

## Task Details

- **Title:** Implement Dashboard KPI Summary Row
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Global Dashboard](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a horizontal row of cross-project KPI stat cards at the top of the global dashboard page. Each card displays a key metric aggregated across all projects for the authenticated user. The row uses the KPICard component from the design system (Epic 8) and fetches data from the dashboard summary API endpoint.

### KPI Cards

```typescript
// apps/web/src/components/dashboard/dashboard-kpi-summary-row.tsx
// Renders a responsive horizontal row of KPICard components.
// Fetches cross-project summary data using TanStack Query.
// Each card is interactive where applicable (clickable to filter).

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/ui/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api-client";
import {
  FolderKanban,
  Bot,
  AlertTriangle,
  ShieldAlert,
  DollarSign,
} from "lucide-react";
import type { DashboardSummary } from "@laila/shared";

/**
 * KPI stat cards to display:
 *
 * 1. Total Projects — count with breakdown by status
 *    (e.g., "12 projects" with "3 draft, 5 in progress, 4 completed" subtitle)
 *    Icon: FolderKanban
 *
 * 2. Active Workers — count of workers currently assigned across all projects
 *    Icon: Bot
 *
 * 3. Total Failures — count of failed stories, clickable to navigate
 *    to filtered project list. Highlighted in red if > 0.
 *    Icon: AlertTriangle
 *
 * 4. Total Blocked — count of blocked stories, clickable to navigate
 *    to filtered view. Highlighted in amber if > 0.
 *    Icon: ShieldAlert
 *
 * 5. Aggregate Cost — total cost in USD (formatted with $ and commas)
 *    and total token count underneath.
 *    Uses JetBrains Mono for numeric values.
 *    Icon: DollarSign
 */
```

### Layout

```typescript
// The KPI row uses a CSS Grid layout:
// - Desktop (>= 1024px): 5 columns, equal width
// - Tablet (>= 768px): 3 columns first row, 2 columns second row
// - Mobile (< 768px): single column stack
//
// Each KPICard accepts: title, value, subtitle, icon, onClick, variant (default | warning | danger)
```

### Data Fetching

```typescript
// TanStack Query hook for dashboard summary data.
// Uses the dashboard query key factory for cache management.

const useDashboardSummary = () => {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: () => apiClient.get("/api/v1/dashboard/summary"),
    staleTime: 30_000, // 30 seconds — will be overridden by polling in auto-refresh task
  });
};
```

## Acceptance Criteria

- [ ] Dashboard page renders a horizontal row of 5 KPI stat cards
- [ ] Total Projects card displays the count with status breakdown subtitle (draft, in progress, completed counts)
- [ ] Active Workers card displays the count of workers currently assigned across all projects
- [ ] Total Failures card displays the count of failed stories and is clickable to navigate to filtered view
- [ ] Total Failures card uses the danger variant (red highlight) when count > 0
- [ ] Total Blocked card displays the count of blocked stories and is clickable to navigate to filtered view
- [ ] Total Blocked card uses the warning variant (amber highlight) when count > 0
- [ ] Aggregate Cost card displays the total cost in USD formatted with `$` prefix and comma separators
- [ ] Aggregate Cost card displays the total token count as subtitle
- [ ] Aggregate Cost card uses JetBrains Mono font for numeric values
- [ ] KPI row is responsive: 5 columns on desktop, 3+2 on tablet, 1 column on mobile
- [ ] Loading state displays Skeleton placeholders for each card position
- [ ] Data is fetched via TanStack Query with proper query keys from the dashboard key factory
- [ ] Lucide icons are used for each card (FolderKanban, Bot, AlertTriangle, ShieldAlert, DollarSign)
- [ ] No `any` types are used in the implementation

## Technical Notes

- The KPICard component should already be available from Epic 8 (Implement Shared Domain Components). If not yet built, this task should use a placeholder that matches the expected API.
- The dashboard summary endpoint (`GET /api/v1/dashboard/summary`) returns aggregated data across all projects for the authenticated user. The API shape should match the `DashboardSummary` type from `@laila/shared`.
- Use `Intl.NumberFormat` for USD currency formatting and large number formatting.
- Clickable cards should use Next.js `router.push()` with appropriate query parameters to pre-filter the destination view.

## References

- **Design System:** KPICard component from Epic 8 (UI Foundation)
- **Icons:** Lucide React icon library
- **Fonts:** JetBrains Mono for numeric/monetary values (configured in Epic 8)
- **Query Management:** TanStack Query v5 with query key factory pattern

## Estimated Complexity

Medium — Requires integrating with the dashboard summary API, KPICard components, responsive grid layout, conditional variant styling, and click-to-filter navigation.
