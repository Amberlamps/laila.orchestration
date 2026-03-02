# Implement Project Detail Page

## Task Details

- **Title:** Implement Project Detail Page
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Project Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Project List Page

## Description

Build the project detail page at `/projects/{projectId}` that serves as the hub for managing a specific project. The page includes a header section with project metadata and actions, a KPI bar with project statistics, and a tabbed interface for navigating between project sub-views.

### Page Structure

1. **Header Section:**
   - Project name in Display typography (30px, bold, zinc-900)
   - StatusBadge showing current work status
   - Rendered description via MarkdownRenderer (below name, zinc-600)
   - Action buttons (right-aligned): Edit (outline), Publish (primary, shown when Draft), Delete (destructive ghost icon button)

2. **KPI Bar:**
   - Row of 4 KPICard components:
     - Progress % — green accent, percentage value, breakdown bar
     - Failures — red accent, count of failed stories/tasks
     - Blocked — amber accent, count of blocked items
     - Cost — indigo accent, total cost in USD (JetBrains Mono)
   - Timeout reclamation banners: amber warning banners that appear when workers are approaching or have exceeded the inactivity timeout

3. **Tab Bar:**
   - Tabs: Overview | Epics | Stories | Tasks | Graph | Activity | Settings
   - Underline style, indigo-500 active indicator, zinc-500 inactive text
   - Uses shallow routing (`router.push` with `shallow: true`) to change tabs without full page reload
   - Tab content renders below the tab bar

### Tab Content (Overview Tab — default)

The Overview tab shows a summary dashboard for the project:
- Recent activity feed (last 5 entries)
- Status distribution chart (pie or bar chart showing work status breakdown)
- Key metrics summary

```tsx
// apps/web/src/pages/projects/[projectId]/index.tsx
// Project detail page with header, KPI bar, and tabbed navigation.
// Uses shallow routing for tab switching without full page reloads.
import { useRouter } from "next/router";
import { Pencil, Trash2, Send } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { KPICard } from "@/components/ui/kpi-card";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-projects";

const PROJECT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "epics", label: "Epics" },
  { value: "stories", label: "Stories" },
  { value: "tasks", label: "Tasks" },
  { value: "graph", label: "Graph" },
  { value: "activity", label: "Activity" },
  { value: "settings", label: "Settings" },
] as const;

export default function ProjectDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const activeTab = (router.query.tab as string) ?? "overview";

  const { data: project, isLoading } = useProject(projectId);

  // Handle tab change with shallow routing to avoid full page reload.
  // URL updates to /projects/{id}?tab=epics without re-running getServerSideProps.
  function handleTabChange(tab: string) {
    router.push(
      { pathname: router.pathname, query: { ...router.query, tab } },
      undefined,
      { shallow: true }
    );
  }

  // ...
}
```

## Acceptance Criteria

- [ ] Project detail page renders at `/projects/{projectId}` route
- [ ] Breadcrumb shows: Projects > {Project Name}
- [ ] Project name displays in Display typography (30px, bold)
- [ ] StatusBadge shows the project's current work status
- [ ] Description renders via MarkdownRenderer below the name
- [ ] Action buttons (Edit, Publish, Delete) are right-aligned in the header
- [ ] Publish button is only shown when project is in Draft status
- [ ] Delete button uses a destructive ghost icon button (Trash2 icon)
- [ ] KPI bar shows 4 cards: Progress %, Failures, Blocked, Cost
- [ ] KPI cards use appropriate accent colors (green, red, amber, indigo)
- [ ] Progress KPI card includes a breakdown bar showing status proportions
- [ ] Cost displays in JetBrains Mono font with USD formatting
- [ ] Timeout reclamation banners appear when workers approach inactivity timeout
- [ ] Tab bar shows 7 tabs: Overview, Epics, Stories, Tasks, Graph, Activity, Settings
- [ ] Active tab has indigo-500 underline indicator
- [ ] Tab switching uses shallow routing (URL updates without page reload)
- [ ] Default tab is "Overview" when no `?tab=` query parameter is present
- [ ] Loading state shows skeleton placeholders for header, KPI bar, and tab content
- [ ] 404 error page is shown when `projectId` does not exist
- [ ] Page is wrapped in ProtectedRoute and AppLayout

## Technical Notes

- Use Next.js shallow routing (`router.push` with `shallow: true`) for tab navigation. This updates the URL (enabling direct linking to specific tabs) without triggering a full page reload or data refetch.
- The tab content for each tab (Epics, Stories, Tasks, etc.) will be implemented in subsequent epics. For now, render placeholder content for tabs other than Overview and Settings.
- The KPI bar should use the KPICard component from Epic 8. Data comes from aggregated fields on the project API response.
- Timeout reclamation banners are conditional UI elements that appear when the project has workers approaching their inactivity timeout. These banners use amber background with an AlertTriangle icon.
- Consider implementing tab content as lazy-loaded components (using `dynamic(() => import(...))`) to reduce initial bundle size since most users will only view 1-2 tabs per visit.
- The action buttons should be status-gated: Edit is always available, Publish only in Draft, Delete is always available but triggers the confirmation flow.

## References

- **Design Specification:** Section 5.3 (Project Detail Page), Section 5.3.1 (Header), Section 5.3.2 (KPI Bar), Section 5.3.3 (Tab Navigation)
- **Functional Requirements:** FR-PROJ-006 (project detail view), FR-PROJ-007 (KPI metrics), FR-PROJ-008 (tab navigation)
- **UI Components:** StatusBadge, KPICard, MarkdownRenderer, Tabs, Breadcrumb (from Epic 8)
- **Next.js Docs:** Dynamic routes, shallow routing

## Estimated Complexity

High — Multiple sections (header, KPI bar, tabs), conditional UI based on project status, shallow routing for tabs, and integration with multiple shared components make this a complex page.
