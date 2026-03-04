# Implement Projects-at-a-Glance Grid

## Task Details

- **Title:** Implement Projects-at-a-Glance Grid
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Global Dashboard](./tasks.md)
- **Parent Epic:** [Dashboard & Monitoring UI](../../user-stories.md)
- **Dependencies:** None

## Description

Implement a responsive grid of compact project summary cards on the global dashboard page. Each card provides a quick visual snapshot of a project's health, allowing users to scan all projects at a glance and click through to project details.

### Project Card Component

```typescript
// apps/web/src/components/dashboard/project-summary-card.tsx
// Compact card component for the projects-at-a-glance grid.
// Displays key project metrics in a scannable format.

import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/progress';
import { Bot, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { ProjectSummary } from '@laila/shared';

/**
 * ProjectSummaryCard renders:
 *
 * - Project name (linked to /projects/:id) — truncated at 40 chars with title tooltip
 * - StatusBadge showing current project status (draft, in_progress, completed, etc.)
 * - Mini progress bar showing overall completion percentage
 *   (tasks completed / total tasks)
 * - Failure count — highlighted in red (text-red-500) if > 0
 * - Blocked count — highlighted in amber (text-amber-500) if > 0
 * - Active worker count with Bot icon
 *
 * Card has hover:shadow-md transition and rounded-lg border styling
 * consistent with the design system card pattern.
 */
```

### Grid Layout

```typescript
// apps/web/src/components/dashboard/projects-at-a-glance-grid.tsx
// Responsive grid container for project summary cards.
// Fetches project list summary from API using TanStack Query.

/**
 * Grid layout:
 * - Desktop (>= 1024px): 3 columns — grid-cols-3
 * - Tablet (>= 768px): 2 columns — grid-cols-2
 * - Mobile (< 768px): 1 column — grid-cols-1
 *
 * Gap: gap-4 (16px)
 * Section heading: "Projects" with count badge
 *
 * If more than 12 projects, show first 12 with "View all projects" link
 * to the full projects list page.
 */
```

### Data Fetching

```typescript
// Uses the projects list endpoint with summary fields.
// Fetches a lightweight projection: id, name, status, progress,
// failure_count, blocked_count, active_worker_count.

const useProjectsSummary = () => {
  return useQuery({
    queryKey: dashboardKeys.projectsSummary(),
    queryFn: () =>
      apiClient.get('/api/v1/projects', {
        params: { limit: 12, include_summary: true },
      }),
  });
};
```

## Acceptance Criteria

- [ ] Dashboard page displays a grid of project summary cards below the KPI row
- [ ] Each project card displays the project name as a link to `/projects/:id`
- [ ] Project names longer than 40 characters are truncated with an ellipsis and full name shown on hover via `title` attribute
- [ ] Each card displays a StatusBadge showing the current project status
- [ ] Each card displays a mini progress bar showing task completion percentage
- [ ] Each card displays failure count, highlighted in red (`text-red-500`) when > 0
- [ ] Each card displays blocked count, highlighted in amber (`text-amber-500`) when > 0
- [ ] Each card displays active worker count with a Bot icon from Lucide
- [ ] Grid is responsive: 3 columns on desktop, 2 columns on tablet, 1 column on mobile
- [ ] Grid displays a maximum of 12 project cards with a "View all projects" link when more exist
- [ ] Section has a heading "Projects" with a count badge showing total number of projects
- [ ] Cards have hover shadow transition (`hover:shadow-md`) for interactive feel
- [ ] Loading state displays Skeleton card placeholders matching the grid layout
- [ ] Empty state is not handled here (handled by the Dashboard Empty State task)
- [ ] No `any` types are used in the implementation

## Technical Notes

- Use Tailwind CSS v4 responsive grid utilities for the layout. The gap and column counts should use the design tokens where available.
- The progress bar should use the shadcn/ui `Progress` component with a height of `h-1.5` for the mini variant.
- Link navigation uses Next.js `Link` component for client-side transitions.
- Project summary data should be a lightweight projection from the API — avoid fetching full project details with nested entities for the dashboard view.

## References

- **Design System:** StatusBadge, Progress, Card components from Epic 8
- **Icons:** Lucide React — Bot, AlertTriangle, ShieldAlert
- **Navigation:** Next.js Link component for client-side routing
- **API:** `GET /api/v1/projects` with summary projection

## Estimated Complexity

Medium — Responsive grid layout with multiple data points per card, conditional styling, and proper loading states.
