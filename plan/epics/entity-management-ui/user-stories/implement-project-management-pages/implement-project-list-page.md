# Implement Project List Page

## Task Details

- **Title:** Implement Project List Page
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Project Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build the project list page at `/projects` that displays all of the user's projects in a filterable, paginated card grid. This is the primary entry point for project management and one of the most-used pages in the application.

### Page Layout

- **Header:** H1 "Projects" (left) + "+ New Project" primary button (right)
- **Filter Chips:** Horizontal row of status filter chips below the header: All (default), Draft, Ready, In Progress, Complete — each showing the count of projects in that status
- **Card Grid:** Responsive grid: 3 columns on desktop (>= 1024px), 2 columns on tablet (768-1023px), 1 column on mobile (< 768px). Minimum card width of 340px.
- **Pagination:** Below the grid: "Showing 1-20 of 147" text + Previous/Next buttons

### Project Card Specification

Each card displays:
- **Name:** H3 (16px, semibold), linked to `/projects/{projectId}` — clickable, indigo-600 on hover
- **Status Badge:** StatusBadge component showing current work status
- **Description:** Body Small (13px, zinc-500), 2-line excerpt with text ellipsis overflow
- **Progress Bar:** Thin (4px) horizontal bar showing completion percentage. Green segment for complete, blue for in-progress, zinc-200 for remaining.
- **Metadata Row (bottom):** Active workers count (Bot icon + count), Cost (DollarSign icon + formatted USD), Last Updated (Clock icon + relative timestamp e.g., "2h ago")

```tsx
// apps/web/src/pages/projects/index.tsx
// Project list page with status filter chips and responsive card grid.
// Uses TanStack Query for data fetching with the useProjects hook.
import { useState } from "react";
import { useRouter } from "next/router";
import { FolderKanban, Plus, Bot, DollarSign, Clock } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/use-projects";

type StatusFilter = "all" | "draft" | "ready" | "in_progress" | "complete";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
];

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const router = useRouter();

  const { data, isLoading } = useProjects({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize: 20,
  });

  return (
    <AppLayout variant="full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-h1">Projects</h1>
        <Button onClick={() => router.push("/projects/new")}>
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Filter Chips */}
      {/* Card Grid */}
      {/* Pagination */}
      {/* Empty State */}
    </AppLayout>
  );
}
```

## Acceptance Criteria

- [ ] Project list page renders at `/projects` route
- [ ] Page header shows "Projects" H1 and "+ New Project" primary button
- [ ] Status filter chips display: All, Draft, Ready, In Progress, Complete with counts
- [ ] Active filter chip shows indigo-500 bg + white text; inactive shows zinc-100 bg + zinc-600 text
- [ ] Selecting a filter chip filters the project list and resets to page 1
- [ ] Card grid is responsive: 3 columns desktop, 2 columns tablet, 1 column mobile
- [ ] Minimum card width is 340px
- [ ] Each card shows: name (H3, linked), status badge, description excerpt (2 lines), progress bar, metadata row
- [ ] Card name links to `/projects/{projectId}` with indigo-600 hover color
- [ ] Progress bar shows completion percentage with green (complete), blue (in-progress), zinc-200 (remaining) segments
- [ ] Metadata row shows active workers, cost (USD formatted), and relative timestamp
- [ ] Pagination shows "Showing X-Y of Z" text and Previous/Next buttons
- [ ] Loading state shows skeleton cards (6 skeleton cards matching card layout)
- [ ] Empty state shows EmptyState component with FolderKanban icon and "+ Create Project" CTA
- [ ] Page uses `AppLayout` with `variant="full"` for full-width grid
- [ ] Data is fetched via `useProjects` TanStack Query hook with filter and pagination params
- [ ] Page is wrapped in `ProtectedRoute` for authentication

## Technical Notes

- Filter chips should use the `Badge` component styled as toggle buttons, or create a dedicated `FilterChip` component.
- The progress bar is a simplified version of the KPICard breakdown bar — a thin horizontal bar with proportional colored segments.
- Use `formatDistanceToNow` from `date-fns` for relative timestamps (e.g., "2h ago", "3 days ago").
- Format cost as USD using `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`.
- The card grid can use CSS Grid with `grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))` for automatic responsive column sizing without breakpoints.
- Pagination should use the `keepPreviousData` option in TanStack Query to prevent content flashing during page transitions.
- The "+ New Project" button should open the Create Project modal (or navigate to `/projects/new` if using a separate page).

## References

- **Design Specification:** Section 5.1 (Project List Page), Section 5.1.1 (Card Grid), Section 5.1.2 (Filter Chips)
- **Functional Requirements:** FR-PROJ-001 (project listing), FR-PROJ-002 (status filtering), FR-PROJ-003 (pagination)
- **UI Components:** StatusBadge, EmptyState, SkeletonCard (from Epic 8)
- **TanStack Query Hooks:** useProjects (from Epic 8 API client layer)

## Estimated Complexity

High — Responsive card grid layout, status filter chips with counts, progress bars, metadata formatting, pagination state management, loading skeletons, and empty state handling make this a feature-rich page.
