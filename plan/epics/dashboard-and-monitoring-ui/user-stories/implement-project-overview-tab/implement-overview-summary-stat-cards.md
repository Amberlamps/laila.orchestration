# Implement Overview Summary Stat Cards

## Task Details

- **Title:** Implement Overview Summary Stat Cards
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Project Overview Tab](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a row of 4 summary stat cards at the top of the project overview tab. Each card shows the completion ratio (X/Y complete) for a specific entity type along with a mini status breakdown bar. These cards give users an immediate sense of project progress.

### Stat Cards Component

```typescript
// apps/web/src/components/project/overview/overview-summary-stat-cards.tsx
// Renders 4 KPICard components showing entity completion status.
// Each card includes a mini stacked bar showing status distribution.

import { useQuery } from "@tanstack/react-query";
import { KPICard } from "@/components/ui/kpi-card";
import { projectKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api-client";
import { Layers, BookOpen, ListChecks, Bot } from "lucide-react";
import type { ProjectOverviewStats } from "@laila/shared";

/**
 * Four stat cards:
 *
 * 1. Epics — "X/Y complete"
 *    Icon: Layers
 *    Mini-bar breakdown: completed (green), in_progress (blue), not_started (gray)
 *
 * 2. Stories — "X/Y complete"
 *    Icon: BookOpen
 *    Mini-bar breakdown: completed, in_progress, blocked (amber), not_started
 *
 * 3. Tasks — "X/Y complete"
 *    Icon: ListChecks
 *    Mini-bar breakdown: completed, in_progress, blocked, failed (red), not_started
 *
 * 4. Active Workers — count
 *    Icon: Bot
 *    Subtitle: "currently assigned"
 *    No mini-bar for this card
 *
 * Each mini-bar is a thin (h-1.5) stacked horizontal bar
 * rendered below the main value using Tailwind percentage widths.
 */
```

### Mini Status Bar Component

```typescript
// apps/web/src/components/ui/status-breakdown-bar.tsx
// A thin stacked horizontal bar showing status distribution.
// Each segment is proportionally sized and color-coded.

/**
 * Props:
 * - segments: Array<{ status: string; count: number; color: string }>
 * - total: number
 * - height: "sm" | "md" (default "sm" = h-1.5)
 *
 * Renders a flex container with proportionally-sized colored segments.
 * Minimum segment width: 2px (to remain visible for small counts).
 * Rounded corners on the container (rounded-full).
 * Tooltip on hover showing "X status_name" for each segment.
 */
```

## Acceptance Criteria

- [ ] Overview tab displays a row of 4 stat cards: Epics, Stories, Tasks, Active Workers
- [ ] Epics card shows "X/Y complete" with Layers icon and status breakdown mini-bar
- [ ] Stories card shows "X/Y complete" with BookOpen icon and status breakdown mini-bar
- [ ] Tasks card shows "X/Y complete" with ListChecks icon and status breakdown mini-bar
- [ ] Active Workers card shows the count with Bot icon and "currently assigned" subtitle
- [ ] Mini status bars use proportional widths based on status counts
- [ ] Mini status bar segments are color-coded: green for completed, blue for in_progress, amber for blocked, red for failed, gray for not_started
- [ ] Mini status bar segments show tooltips on hover with count and status name
- [ ] Stat cards use the KPICard component from the design system
- [ ] Layout is responsive: 4 columns on desktop, 2x2 on tablet, single column on mobile
- [ ] Loading state displays Skeleton placeholders for each card
- [ ] Data is fetched via TanStack Query using project query key factory
- [ ] No `any` types are used in the implementation

## Technical Notes

- The `StatusBreakdownBar` component is reusable and should be placed in `components/ui/` for use across the application (e.g., in project cards on the global dashboard).
- Percentage widths for bar segments should be calculated as `(count / total) * 100` with a minimum of 2px to ensure visibility of small segments.
- Use the shared design token colors for status mapping — these should be defined in the design system from Epic 8.

## References

- **Design System:** KPICard, Tooltip components from Epic 8
- **Icons:** Lucide React — Layers, BookOpen, ListChecks, Bot
- **API:** `GET /api/v1/projects/:id/overview` endpoint

## Estimated Complexity

Medium — Multiple card components with a reusable status breakdown bar, responsive layout, and tooltip interactions.
