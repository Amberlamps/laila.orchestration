# Implement Worker List Page

## Task Details

- **Title:** Implement Worker List Page
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Worker Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build the worker list page at `/workers` that displays all of the user's AI execution agent workers in a table format. Workers are simpler entities than projects (no complex hierarchy), so a table layout is used instead of a card grid.

### Page Layout

- **Header:** H1 "Workers" (left) + "+ Create Worker" primary button (right)
- **Table:** EntityTable with worker data
- **Empty State:** When no workers exist

### Table Columns

1. **Name** — Worker name, linked to `/workers/{workerId}`. Body typography (14px, semibold, indigo-600 on hover)
2. **Assigned Projects** — Count badge (e.g., "3 projects"). Hovering shows a Popover listing project names (each linked to project detail).
3. **Current Status** — Contextual status text:
   - Working: "Working on [story title] in [project name]" in blue-600 text
   - Idle: "Idle" in zinc-400 text
   - No projects: "No projects assigned" in zinc-400 text
4. **Created** — Relative timestamp (e.g., "3 days ago")
5. **Actions** — Three-dot menu with: View Details, Delete (destructive, blocked if active work)

```tsx
// apps/web/src/pages/workers/index.tsx
// Worker list page with table layout.
// Shows each worker's name, assigned projects, current activity, and creation date.
import { useState } from 'react';
import { useRouter } from 'next/router';
import { Bot, Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { EntityTable, type ColumnDef } from '@/components/ui/entity-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useWorkers } from '@/hooks/use-workers';

// Worker column definitions with status-aware rendering.
const workerColumns: ColumnDef<Worker>[] = [
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    cell: (worker) => (
      <Link
        href={`/workers/${worker.id}`}
        className="font-semibold text-zinc-900 hover:text-indigo-600"
      >
        {worker.name}
      </Link>
    ),
  },
  {
    key: 'projects',
    header: 'Projects',
    cell: (worker) => (
      // Count badge with Popover listing project names
      <Popover>
        <PopoverTrigger>
          <Badge variant="secondary">{worker.projectCount} projects</Badge>
        </PopoverTrigger>
        <PopoverContent>
          {worker.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              {p.name}
            </Link>
          ))}
        </PopoverContent>
      </Popover>
    ),
  },
  // ... currentStatus, created, actions columns
];
```

## Acceptance Criteria

- [ ] Worker list page renders at `/workers` route
- [ ] Page header shows "Workers" H1 and "+ Create Worker" primary button
- [ ] Table displays columns: Name, Assigned Projects, Current Status, Created, Actions
- [ ] Worker name links to `/workers/{workerId}` with hover color change
- [ ] Assigned Projects shows count badge with Popover listing project names
- [ ] Project names in Popover link to their detail pages
- [ ] Current Status shows contextual text: "Working on [story] in [project]" / "Idle" / "No projects"
- [ ] Working status uses blue-600 text color
- [ ] Idle and no-projects status use zinc-400 text color
- [ ] Created column shows relative timestamps
- [ ] Actions menu includes "View Details" and "Delete" options
- [ ] Delete action is blocked (disabled with tooltip) if worker has active work
- [ ] Empty state shows Bot icon with "No Workers" title and "+ Create Worker" CTA
- [ ] Loading state shows SkeletonTable
- [ ] Table supports sorting by name and creation date
- [ ] Row click navigates to worker detail page
- [ ] Data fetched via `useWorkers` TanStack Query hook
- [ ] Page wrapped in ProtectedRoute and AppLayout with `variant="full"`

## Technical Notes

- Workers are user-scoped entities — the API returns only workers belonging to the authenticated user.
- The "Current Status" column requires aggregated data from the worker's active assignments. The API should return this as part of the worker list response to avoid N+1 queries.
- The Popover for project count should use the shadcn `Popover` component. For workers with many projects, consider adding a scrollable container with max-height.
- Delete action should be disabled (not hidden) when the worker has active work, with a tooltip explaining why. The tooltip text: "Cannot delete worker with active work assignments."
- The "+ Create Worker" button should open the two-step Create Worker modal.

## References

- **Design Specification:** Section 9.1 (Worker List Page), Section 9.1.1 (Worker Table)
- **Functional Requirements:** FR-WORKER-001 (worker listing), FR-WORKER-002 (status display)
- **UI Components:** EntityTable, EmptyState, Badge, Popover (from Epic 8)

## Estimated Complexity

Medium — Standard table page using EntityTable, but the contextual status rendering and project count Popover add moderate complexity.
