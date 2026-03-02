# Implement Story Tasks Tab

## Task Details

- **Title:** Implement Story Tasks Tab
- **Status:** Not Started
- **Assigned Agent:** frontend-developer
- **Parent User Story:** [Implement User Story Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Story Detail Page

## Description

Build the Tasks sub-tab for the story detail page. This tab displays the task breakdown for the story, including execution order, dependency relationships, and a read-only banner when the story is in progress or complete.

### Tab Content

1. **Read-Only Banner (conditional):**
   - Shown when the story is in_progress or complete
   - Amber-50 bg, amber-200 border, amber-700 text
   - Message: "This story is currently {in progress / complete}. Tasks cannot be modified."
   - Lucide `Lock` icon

2. **"+ New Task" Button:**
   - Above the table, right-aligned
   - Disabled (with tooltip) when the story is in_progress or complete
   - Opens the Create Task modal

3. **Task Table:**
   - Uses EntityTable component
   - Columns:
     - **Order** — Recommended execution order (number badge, 24px circle, zinc-100 bg)
     - **Title** — Task title, linked to `/projects/{projectId}/tasks/{taskId}`
     - **Status** — StatusBadge
     - **Persona** — Persona title, linked to `/personas/{personaId}`
     - **Dependencies** — Count badge (e.g., "3 deps"), with Popover showing dependency details on hover/click

4. **Recommended Execution Order Visual:**
   - Optional enhancement: show a visual indicator of the execution order derived from the dependency graph
   - Numbered order column in the table
   - Tasks with no dependencies appear first (order 1), tasks dependent on those appear next (order 2), etc.

```tsx
// apps/web/src/components/stories/story-tasks-tab.tsx
// Tasks sub-tab for the story detail page.
// Shows the task breakdown with execution order, dependencies, and read-only guards.
import { Plus, Lock, ArrowRight } from "lucide-react";
import { EntityTable, type ColumnDef } from "@/components/ui/entity-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useStoryTasks } from "@/hooks/use-tasks";

interface StoryTasksTabProps {
  storyId: string;
  projectId: string;
  /** Whether the story is in a read-only state (in_progress or complete) */
  readOnly: boolean;
}

// Column definitions for the task table.
// Each column maps a task field to a visual representation.
const taskColumns: ColumnDef<Task>[] = [
  {
    key: "order",
    header: "#",
    width: "60px",
    cell: (task) => (
      // Execution order number in a circular badge
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-100 text-xs font-medium text-zinc-600">
        {task.executionOrder}
      </span>
    ),
  },
  {
    key: "title",
    header: "Task",
    sortable: true,
    cell: (task) => (
      <Link href={`/projects/${task.projectId}/tasks/${task.id}`} className="text-indigo-600 hover:underline">
        {task.title}
      </Link>
    ),
  },
  // ... status, persona, dependencies columns
];
```

## Acceptance Criteria

- [ ] Tasks tab renders as a sub-tab within the story detail page
- [ ] Read-only banner appears when story status is `in_progress` or `complete`
- [ ] Read-only banner has amber styling with Lock icon and explanatory message
- [ ] "+ New Task" button appears above the table, right-aligned
- [ ] "+ New Task" button is disabled with tooltip when story is read-only
- [ ] Task table uses EntityTable with columns: Order, Title, Status, Persona, Dependencies
- [ ] Order column shows recommended execution order as a numbered circle badge
- [ ] Task titles link to the task detail page
- [ ] Status column shows StatusBadge
- [ ] Persona column shows persona title linked to persona detail page, or "Not assigned" in zinc-400
- [ ] Dependencies column shows count badge; clicking/hovering opens Popover with dependency list
- [ ] Dependency Popover shows task title + StatusBadge for each dependency
- [ ] Table supports sorting by title and status
- [ ] Row click navigates to task detail page
- [ ] Empty state shows when story has no tasks: "No tasks defined" with "+ Add Task" CTA
- [ ] Loading state shows SkeletonTable
- [ ] Data is fetched via `useStoryTasks` TanStack Query hook

## Technical Notes

- The execution order is determined by topological sort of the task dependency graph within the story. The API should return this order as a computed field on each task.
- The dependency count Popover should show task title and status badge for each dependency. Use the shadcn `Popover` component for this.
- The read-only state is determined by the parent story's work status, not the individual task statuses.
- When the story is in read-only mode, the table should still be interactive (links work, sort works), but the "+ New Task" button and any edit/delete actions in the row menu should be disabled.
- Consider adding a visual connecting line or grouping to show dependency chains, though this may be overly complex for the table format (the Graph tab handles full visualization).

## References

- **Design Specification:** Section 7.2 (Story Tasks Tab), Section 7.2.1 (Task Table), Section 7.2.2 (Execution Order)
- **Functional Requirements:** FR-STORY-004 (task listing), FR-STORY-005 (read-only mode), FR-STORY-006 (dependency display)
- **UI Components:** EntityTable, StatusBadge, Badge, Popover (from Epic 8)

## Estimated Complexity

Medium — The table uses the EntityTable component for most of the heavy lifting, but the dependency Popover, execution order visual, and read-only state management add complexity.
