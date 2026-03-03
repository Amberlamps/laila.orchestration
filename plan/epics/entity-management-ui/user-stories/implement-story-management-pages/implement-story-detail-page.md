# Implement Story Detail Page

## Task Details

- **Title:** Implement Story Detail Page
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement User Story Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build the user story detail page at `/projects/{projectId}/stories/{storyId}` that displays a single story with its full metadata, action buttons, and tabbed content. The story detail page is one of the most information-dense pages in the application, showing status, priority, worker assignment, error states, and related metadata.

### Page Structure

1. **Breadcrumb:** Projects > {Project} > Epics > {Epic} > Stories > {Story Title}

2. **Header Section:**
   - Title in H1 typography (24px, semibold)
   - Badge row: Priority badge (High/Medium/Low with color), Lifecycle badge, Work status badge
   - Assigned Worker: Worker name (linked to worker detail) or "Unassigned" in zinc-400
   - Action buttons (right-aligned, status-gated):
     - Edit (outline) — always available when in Draft
     - Publish (primary) — visible when Draft
     - Unassign (outline) — visible when assigned to a worker
     - Reset (secondary) — visible when Failed
     - Delete (destructive ghost icon) — always available when not in-progress

3. **Tab Bar:**
   - Tabs: Overview | Tasks | Attempt History
   - Uses shallow routing for tab switching

4. **Overview Tab Content:**
   - **Rendered Description:** MarkdownRenderer, 720px max prose width
   - **Metadata Grid:** Two-column grid showing:
     - Priority (badge)
     - Status (StatusBadge)
     - Assigned Worker (name linked, or "Unassigned")
     - Created At (formatted timestamp)
     - Updated At (formatted timestamp)
     - Duration (calculated from assignment to completion/current, e.g., "2h 45m")
     - Token Cost (JetBrains Mono, formatted number)
     - USD Cost (JetBrains Mono, formatted currency)
   - **Error Message Display:** When status is Failed, show error message in a red-50 bg, red-200 border, red-700 text container with AlertCircle icon
   - **Implicit Dependencies:** List of stories this story depends on and stories that depend on this one

```tsx
// apps/web/src/pages/projects/[projectId]/stories/[storyId].tsx
// Story detail page with header, metadata grid, and tabbed content.
// Shows error messages prominently when story has Failed status.
import { useRouter } from 'next/router';
import { Pencil, Trash2, Send, UserMinus, RotateCcw, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { StatusBadge } from '@/components/ui/status-badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStory } from '@/hooks/use-stories';

// Priority badge color mapping.
// Each priority level has a distinct color for quick visual identification.
const PRIORITY_COLORS = {
  high: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  low: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
};
```

## Acceptance Criteria

- [ ] Story detail page renders at `/projects/{projectId}/stories/{storyId}`
- [ ] Breadcrumb shows full hierarchy: Projects > {Project} > Epics > {Epic} > Stories > {Story}
- [ ] Title displays in H1 typography
- [ ] Priority badge shows correct color (High: red, Medium: amber, Low: green)
- [ ] Lifecycle and work status badges appear in the badge row
- [ ] Assigned worker name links to `/workers/{workerId}`, or shows "Unassigned" in zinc-400
- [ ] Action buttons are status-gated: Edit (Draft), Publish (Draft), Unassign (assigned), Reset (Failed), Delete (not in-progress)
- [ ] Tab bar shows Overview, Tasks, and Attempt History tabs with shallow routing
- [ ] Overview tab shows rendered Markdown description with 720px max width
- [ ] Metadata grid displays: Priority, Status, Worker, Created, Updated, Duration, Token Cost, USD Cost
- [ ] Token and USD costs display in JetBrains Mono font
- [ ] When status is Failed, error message displays in red-50 container with AlertCircle icon
- [ ] Error message container is only shown when story status is "failed"
- [ ] Implicit dependencies section shows "Depends on" and "Blocks" story lists
- [ ] Loading state shows skeleton placeholders
- [ ] 404 page shown when storyId does not exist
- [ ] Page is wrapped in ProtectedRoute and AppLayout with `variant="constrained"`

## Technical Notes

- The story detail page is one of the most complex entity detail pages because it has the most metadata fields, status-gated action buttons, and conditional error display.
- Action button visibility rules:
  - Edit: visible when `lifecycleStatus === "draft"`
  - Publish: visible when `lifecycleStatus === "draft"`
  - Unassign: visible when `assignedWorkerId !== null`
  - Reset: visible when `workStatus === "failed"`
  - Delete: visible when `workStatus !== "in_progress"`
- The error message from a failed story execution should be displayed verbatim from the API response. It may contain technical details that help the user understand what went wrong.
- Duration is calculated as the time difference between `assignedAt` and `completedAt` (or `now()` if still in progress). Use a duration formatting function (e.g., "2h 45m", "3d 12h").
- The metadata grid can use CSS Grid with 2 columns for a clean layout. Each item has a label (Caption style, zinc-500) and value.

## References

- **Design Specification:** Section 7.1 (Story Detail Page), Section 7.1.1 (Header), Section 7.1.2 (Metadata Grid), Section 7.1.3 (Error Display)
- **Functional Requirements:** FR-STORY-001 (story detail view), FR-STORY-002 (status-gated actions), FR-STORY-003 (error display)
- **UI Components:** Breadcrumb, StatusBadge, MarkdownRenderer, Tabs (from Epic 8)

## Estimated Complexity

High — Multiple status-gated action buttons, conditional error display, rich metadata grid with cost formatting, and dependency display make this a complex page with many interactive states.
