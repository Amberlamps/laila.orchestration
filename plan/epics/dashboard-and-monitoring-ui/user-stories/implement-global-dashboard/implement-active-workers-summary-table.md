# Implement Active Workers Summary Table

## Task Details

- **Title:** Implement Active Workers Summary Table
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Global Dashboard](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a table on the global dashboard that displays all workers currently assigned to in-progress stories across all projects. Each row shows the worker name, the project they are working in, the story they are assigned to, and the elapsed time since assignment. Uses the EntityTable component from the design system.

### Active Workers Table Component

```typescript
// apps/web/src/components/dashboard/active-workers-summary-table.tsx
// Table displaying workers currently assigned across all projects.
// Uses the EntityTable component from the design system for consistent styling.

import { useQuery } from "@tanstack/react-query";
import { EntityTable } from "@/components/ui/entity-table";
import { dashboardKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api-client";
import { formatElapsedTime } from "@/lib/format-elapsed-time";
import Link from "next/link";
import { Bot, Clock } from "lucide-react";
import type { ActiveWorkerSummary } from "@laila/shared";

/**
 * ActiveWorkersSummaryTable renders:
 *
 * - Section heading: "Active Workers" with Bot icon and count badge
 * - Table columns:
 *   1. Worker: worker name linked to /workers/:id, with Bot icon prefix
 *   2. Project: project name linked to /projects/:id
 *   3. Story: story title linked to /projects/:projectId/stories/:storyId
 *   4. Time Elapsed: duration since worker was assigned to the story
 *      (formatted as "Xh Ym" or "Xm Ys"), with Clock icon
 *
 * - Empty state: "No workers currently active" centered message
 * - Table uses compact row height for dashboard context
 */
```

### Elapsed Time Formatting

```typescript
// apps/web/src/lib/format-elapsed-time.ts
// Utility for formatting a duration from assignment timestamp to now.

/**
 * formatElapsedTime(assignedAt: string): string
 * - < 60 minutes: "Xm Ys" (e.g., "12m 34s")
 * - < 24 hours: "Xh Ym" (e.g., "3h 45m")
 * - >= 24 hours: "Xd Yh" (e.g., "2d 5h")
 *
 * Elapsed time should visually indicate potential timeout risk:
 * - Normal: default text color
 * - Warning (> 75% of project timeout): text-amber-500
 * - Critical (> 90% of project timeout): text-red-500
 */
```

### Data Fetching

```typescript
// Fetch active workers across all projects.
// Returns workers with current assignment details.

const useActiveWorkers = () => {
  return useQuery({
    queryKey: dashboardKeys.activeWorkers(),
    queryFn: () => apiClient.get("/api/v1/workers/active"),
  });
};
```

## Acceptance Criteria

- [ ] Dashboard page displays an "Active Workers" section with Bot icon and count badge
- [ ] Table renders one row per currently assigned worker with 4 columns: Worker, Project, Story, Time Elapsed
- [ ] Worker name is displayed as a link to `/workers/:id` with a Bot icon prefix
- [ ] Project name is displayed as a link to `/projects/:id`
- [ ] Story title is displayed as a link to `/projects/:projectId/stories/:storyId`
- [ ] Time elapsed is formatted as "Xm Ys", "Xh Ym", or "Xd Yh" depending on duration
- [ ] Time elapsed text color indicates timeout risk: amber at > 75% of timeout, red at > 90%
- [ ] Empty state displays "No workers currently active" centered message when no workers are assigned
- [ ] Table uses the EntityTable component from the design system with compact row styling
- [ ] Loading state displays Skeleton rows matching the table layout
- [ ] Data is fetched via TanStack Query using the dashboard query key factory
- [ ] No `any` types are used in the implementation

## Technical Notes

- The EntityTable component from Epic 8 should support a compact variant for dashboard context. If it does not yet support this, add a `size="compact"` prop.
- The elapsed time display should update on each polling cycle (configured in the auto-refresh task). It does not need to tick in real-time between polls.
- Timeout thresholds are per-project (from `timeout_duration_minutes` on the project entity). The API response should include the timeout threshold so the frontend can calculate warning/critical states.
- Worker assignments are determined by the `assigned_worker_id` on in-progress stories.

## References

- **Design System:** EntityTable component from Epic 8
- **Icons:** Lucide React — Bot, Clock
- **API:** `GET /api/v1/workers/active` endpoint
- **Domain Logic:** Worker assignment model from Epic 5 (Domain Logic Engine)

## Estimated Complexity

Low-Medium — Standard data table with links and conditional time formatting. The timeout-risk color coding adds minor complexity.
