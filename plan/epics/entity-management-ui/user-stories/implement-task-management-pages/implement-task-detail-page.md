# Implement Task Detail Page

## Task Details

- **Title:** Implement Task Detail Page
- **Status:** Complete
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement Task Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build the task detail page at `/projects/{projectId}/tasks/{taskId}` that displays the complete task specification. Tasks are the leaf entities in the hierarchy and contain the most detailed information — they serve as the work specification that AI workers execute against.

### Page Structure

The page uses a single-column layout with multiple bordered card sections, rather than tabs, because all information is relevant simultaneously.

1. **Breadcrumb:** Projects > {Project} > Epics > {Epic} > Stories > {Story} > Tasks > {Task Title}

2. **Header:**
   - Title in H1 typography (24px, semibold)
   - Work status badge
   - Assigned persona name (linked to `/personas/{personaId}`) or "No persona" in zinc-400
   - Read-only lock indicator when task is in_progress or complete

3. **Content Sections (bordered cards):**

   a. **Description Card:**
   - Header: "Description" in H3
   - Content: Rendered Markdown via MarkdownRenderer

   b. **Acceptance Criteria Card:**
   - Header: "Acceptance Criteria" in H3
   - Background: neutral-50 (zinc-50) to distinguish from regular description
   - Content: Rendered Markdown (typically a checklist)

   c. **Technical Notes Card (optional):**
   - Header: "Technical Notes" in H3
   - Content: Rendered Markdown
   - Hidden if empty

   d. **References Card (optional):**
   - Header: "References" in H3
   - Content: Rendered Markdown (links to specs, docs, etc.)
   - Hidden if empty

   e. **Dependencies Card:**
   - Two sub-sections:
     - **"Depends on" list:** Tasks this task depends on, with arrow-right icon, task title (linked), and StatusBadge
     - **"Blocks" list:** Tasks that depend on this task, with arrow-right icon, task title (linked), and StatusBadge
   - Hidden if no dependencies in either direction

   f. **Persona Card (collapsible):**
   - Header: "Assigned Persona" with expand/collapse toggle
   - Content: Persona title (H3, linked), rendered persona description via MarkdownRenderer
   - Default: collapsed (shows just title), expandable to show full description

   g. **Metadata Card:**
   - Two-column grid:
     - ID: Monospace (JetBrains Mono), full CUID
     - Parent Story: Title linked to story detail page
     - Parent Epic: Title linked to epic detail page
     - Created At: Formatted timestamp
     - Updated At: Formatted timestamp

```tsx
// apps/web/src/pages/projects/[projectId]/tasks/[taskId].tsx
// Task detail page showing the complete task specification.
// Uses bordered card sections for each content type.
import { useRouter } from 'next/router';
import { ArrowRight, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { useTask } from '@/hooks/use-tasks';

export default function TaskDetailPage() {
  const router = useRouter();
  const { projectId, taskId } = router.query as {
    projectId: string;
    taskId: string;
  };

  const { data: task, isLoading } = useTask(taskId);

  // ...
}
```

## Acceptance Criteria

- [ ] Task detail page renders at `/projects/{projectId}/tasks/{taskId}`
- [ ] Breadcrumb shows full hierarchy: Projects > {Project} > Epics > {Epic} > Stories > {Story} > Tasks > {Task}
- [ ] Title displays in H1 typography with work status badge
- [ ] Assigned persona name links to persona detail page, or shows "No persona" in zinc-400
- [ ] Read-only lock icon appears when task is in_progress or complete
- [ ] Description section renders Markdown content in a bordered card
- [ ] Acceptance Criteria section has zinc-50 background to distinguish from description
- [ ] Technical Notes card is hidden when field is empty
- [ ] References card is hidden when field is empty
- [ ] Dependencies section shows "Depends on" and "Blocks" lists with task titles linked and StatusBadges
- [ ] Dependencies section is hidden when no dependencies exist in either direction
- [ ] Dependency list items have ArrowRight icon before the task title
- [ ] Persona card is collapsible: shows title by default, expands to show full description
- [ ] Metadata grid shows ID (monospace), parent story/epic (linked), timestamps
- [ ] Entity ID uses JetBrains Mono font
- [ ] Parent story and epic titles link to their respective detail pages
- [ ] Loading state shows skeleton placeholders for each card section
- [ ] 404 page shown when taskId does not exist
- [ ] Page wrapped in ProtectedRoute and AppLayout with `variant="constrained"`

## Technical Notes

- The task detail page uses multiple Card components rather than tabs because tasks have a flat information structure where all sections are relevant simultaneously. Users need to see description, acceptance criteria, and dependencies together.
- The Acceptance Criteria card uses a zinc-50 background to visually distinguish it from the regular description. This matches the design spec for emphasizing the criteria that workers must satisfy.
- Optional sections (Technical Notes, References) should be completely hidden (not shown as empty cards) when their content is null or empty string.
- The collapsible persona card can use the shadcn `Collapsible` component (Radix Collapsible primitive). Default state is collapsed, showing only the persona title.
- The dependency lists show bidirectional relationships: "Depends on" shows upstream dependencies, "Blocks" shows downstream dependents. Both link to the respective task detail pages.
- The breadcrumb will be deep (up to 7 levels). Ensure the breadcrumb truncation feature (from Epic 8) works correctly at this depth.

## References

- **Design Specification:** Section 8.1 (Task Detail Page), Section 8.1.1 (Content Sections), Section 8.1.2 (Dependencies Display)
- **Functional Requirements:** FR-TASK-001 (task detail view), FR-TASK-002 (dependency display), FR-TASK-003 (persona display)
- **UI Components:** Breadcrumb, Card, StatusBadge, MarkdownRenderer, Collapsible (from Epic 8)

## Estimated Complexity

High — Multiple card sections with conditional visibility, collapsible persona card, bidirectional dependency lists, deep breadcrumb hierarchy, and monospace metadata formatting create a complex page layout.
