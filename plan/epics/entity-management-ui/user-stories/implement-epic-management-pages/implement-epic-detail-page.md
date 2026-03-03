# Implement Epic Detail Page

## Task Details

- **Title:** Implement Epic Detail Page
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Epic Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build the epic detail page at `/projects/{projectId}/epics/{epicId}` that displays a single epic with its metadata, progress statistics, dependencies, and child user stories table.

### Page Structure

1. **Breadcrumb:** Projects > {Project Name} > Epics > {Epic Title}

2. **Header Section:**
   - Title in H1 typography (24px, semibold)
   - Lifecycle badge + Work status badge (side by side)
   - Action buttons (right-aligned): Edit (outline), Publish (primary, Draft only), Delete (destructive ghost)

3. **Description Section:**
   - Rendered Markdown via MarkdownRenderer component
   - Max width 720px prose

4. **Progress Stat Cards:**
   - Row of 4 compact stat cards showing story breakdown:
     - Complete (green accent): count + percentage
     - In Progress (blue accent): count
     - Blocked (amber accent): count
     - Not Started (gray accent): count

5. **Implicit Dependencies Section:**
   - Shows epic-level dependencies derived from cross-epic task dependencies
   - List of dependent/blocking epics with names linked to their detail pages
   - Section hidden if no dependencies exist

6. **User Stories Table:**
   - Uses EntityTable component
   - Columns: Title (linked), Priority (badge), Work Status (StatusBadge), Assigned Worker (name or "Unassigned")
   - "+ Add Story" button above the table
   - Sortable by priority and status
   - Row click navigates to story detail page

```tsx
// apps/web/src/pages/projects/[projectId]/epics/[epicId].tsx
// Epic detail page showing metadata, progress, dependencies, and stories.
import { useRouter } from 'next/router';
import { Pencil, Trash2, Send, Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { StatusBadge } from '@/components/ui/status-badge';
import { KPICard } from '@/components/ui/kpi-card';
import { EntityTable } from '@/components/ui/entity-table';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Button } from '@/components/ui/button';
import { useEpic, useEpicStories } from '@/hooks/use-epics';

export default function EpicDetailPage() {
  const router = useRouter();
  const { projectId, epicId } = router.query as {
    projectId: string;
    epicId: string;
  };

  const { data: epic, isLoading } = useEpic(epicId);
  const { data: stories } = useEpicStories(epicId);

  // ...
}
```

## Acceptance Criteria

- [ ] Epic detail page renders at `/projects/{projectId}/epics/{epicId}`
- [ ] Breadcrumb shows: Projects > {Project Name} > Epics > {Epic Title}
- [ ] Title displays in H1 typography (24px, semibold)
- [ ] Lifecycle badge and work status badge appear side by side next to the title
- [ ] Action buttons (Edit, Publish, Delete) are right-aligned
- [ ] Publish button visible only when epic is in Draft status
- [ ] Description renders via MarkdownRenderer with 720px max prose width
- [ ] Progress stat cards show counts for Complete, In Progress, Blocked, Not Started stories
- [ ] Stat cards use appropriate accent colors (green, blue, amber, gray)
- [ ] Implicit dependencies section shows cross-epic dependencies if they exist
- [ ] Dependencies section is hidden when no dependencies exist
- [ ] User stories table uses EntityTable with columns: Title, Priority, Work Status, Assigned Worker
- [ ] Story titles link to `/projects/{projectId}/stories/{storyId}`
- [ ] "+ Add Story" button appears above the table
- [ ] Table supports sorting by priority and status
- [ ] Row click navigates to the story detail page
- [ ] Loading state shows appropriate skeleton placeholders
- [ ] 404 page shown when epicId does not exist
- [ ] Page is wrapped in ProtectedRoute and AppLayout with `variant="constrained"`

## Technical Notes

- The epic detail page uses a simpler layout than the project detail page (no tabs), because epics have fewer sub-sections.
- Progress stat cards can use a compact variant of KPICard, or create simple inline stat displays rather than full cards.
- Implicit dependencies are derived from cross-epic task dependencies. The API response should include these aggregated dependencies.
- The user stories table should use the EntityTable component from Epic 8 with custom column definitions.
- Priority badges should use the priority color mapping (High: red, Medium: amber, Low: green).
- Consider adding a "No stories yet" empty state within the stories table section when the epic has no stories.

## References

- **Design Specification:** Section 6.1 (Epic Detail Page), Section 6.1.1 (Progress Stats), Section 6.1.2 (Stories Table)
- **Functional Requirements:** FR-EPIC-001 (epic detail view), FR-EPIC-002 (story listing), FR-EPIC-003 (dependency display)
- **UI Components:** Breadcrumb, StatusBadge, KPICard, EntityTable, MarkdownRenderer (from Epic 8)

## Estimated Complexity

Medium — The page structure is simpler than the project detail page (no tabs), but the progress stats, dependency section, and stories table still require integration with multiple shared components.
