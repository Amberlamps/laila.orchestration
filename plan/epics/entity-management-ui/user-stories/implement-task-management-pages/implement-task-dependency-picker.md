# Implement Task Dependency Picker

## Task Details

- **Title:** Implement Task Dependency Picker
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Task Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Create Edit Task Modal

## Description

Build a reusable `TaskDependencyPicker` component that allows users to select which tasks the current task depends on. The picker displays all tasks in the project grouped by epic and story, supports search/filtering, and validates for circular dependencies in real-time.

### Visual Specification

- **Container:** Bordered area with zinc-200 border, 8px radius
- **Search Input:** Text input at the top of the picker for filtering tasks by title
- **Task List:** Scrollable list (max-height 300px) of selectable tasks
- **Grouping:** Tasks are grouped under Epic > Story headings (collapsible)
- **Each Task Item:** Checkbox + task title + StatusBadge inline
- **Selected Tasks:** Shown as removable chips/tags above the search input
- **Cycle Detection:** When a selection would create a circular dependency, show inline error message with the cycle path

### Component API

```tsx
// apps/web/src/components/tasks/task-dependency-picker.tsx
// Searchable multi-select picker for task dependencies.
// Groups tasks by epic/story and validates for circular dependencies.
import { useState, useMemo } from 'react';
import { Search, X, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { useProjectTasks } from '@/hooks/use-tasks';

interface TaskOption {
  id: string;
  title: string;
  status: string;
  storyTitle: string;
  epicTitle: string;
}

interface TaskDependencyPickerProps {
  /** ID of the task being edited (excluded from the list to prevent self-reference) */
  currentTaskId?: string;
  /** Project ID to fetch all project tasks */
  projectId: string;
  /** Currently selected dependency task IDs */
  value: string[];
  /** Called when selection changes */
  onChange: (taskIds: string[]) => void;
  /** Error message from parent form validation */
  error?: string;
}

// Group tasks by epic > story for hierarchical display.
// Each group is collapsible for easier navigation in large projects.
interface TaskGroup {
  epicTitle: string;
  stories: {
    storyTitle: string;
    tasks: TaskOption[];
  }[];
}
```

### Cycle Detection

When the user selects a task as a dependency, call the API to validate that the selection does not create a circular dependency:

```typescript
// Call the cycle detection API endpoint when a new dependency is selected.
// If a cycle is detected, show the cycle path and prevent the selection.
async function validateNoCycle(
  taskId: string,
  proposedDependencyIds: string[],
): Promise<{ valid: boolean; cyclePath?: string[] }> {
  const response = await apiClient.POST('/api/tasks/{taskId}/validate-dependencies', {
    params: { path: { taskId } },
    body: { dependencyIds: proposedDependencyIds },
  });
  return response.data;
}
```

## Acceptance Criteria

- [ ] Picker displays all tasks in the project except the current task being edited
- [ ] Tasks are grouped by Epic > Story hierarchy with collapsible group headers
- [ ] Group headers show Epic title and Story title in Caption typography
- [ ] Each task shows a checkbox, task title, and StatusBadge inline
- [ ] Search input filters tasks by title (case-insensitive partial match)
- [ ] Search input has a Search icon and clears on X button click
- [ ] Selected tasks appear as removable chips/tags above the search input
- [ ] Clicking a chip's X removes that dependency from the selection
- [ ] Task list is scrollable with max-height of 300px
- [ ] When a selection would create a cycle, show inline error with AlertTriangle icon
- [ ] Cycle error message shows the cycle path (e.g., "Task A -> Task B -> Task C -> Task A")
- [ ] Cycle detection calls the API validation endpoint
- [ ] The cyclic selection is prevented (checkbox unchecks automatically with error message)
- [ ] Component integrates with React Hook Form via `value` and `onChange` props
- [ ] Empty state shows "No tasks available" when the project has no other tasks
- [ ] Component handles loading state while tasks are being fetched
- [ ] Performance is acceptable for projects with 100+ tasks (virtualized list if needed)
- [ ] Component is keyboard accessible (Tab through groups, Space to toggle checkbox)

## Technical Notes

- Use `useMemo` to group and filter tasks based on the search query. Recompute only when the task list or search query changes.
- The cycle detection API call should be debounced (300ms) to avoid excessive API calls during rapid selection changes. Use `useDebouncedCallback` from a utility library or implement a custom debounce.
- For large projects (100+ tasks), consider virtualizing the task list using `@tanstack/react-virtual` to maintain smooth scrolling performance.
- The grouping structure should be: flat list of tasks -> grouped by epicId -> within each epic, grouped by storyId. Use `Object.groupBy` or a manual reduce to build the hierarchy.
- The current task being edited must be excluded from the selectable list to prevent self-referential dependencies.
- Consider caching the full project task list separately from the paginated task queries, since the picker needs all tasks at once.
- Chips for selected tasks should be a horizontal wrapping flex container above the search input, similar to a tag input pattern.

## References

- **Design Specification:** Section 8.3 (Dependency Picker), Section 8.3.1 (Cycle Detection UI)
- **Functional Requirements:** FR-TASK-007 (dependency selection), FR-TASK-008 (cycle detection), FR-TASK-009 (grouped task display)
- **UI Components:** Input, Checkbox, StatusBadge, Badge (from Epic 8)
- **API Endpoints:** Task dependency validation

## Estimated Complexity

High — Searchable, grouped, multi-select with real-time cycle detection via API calls, debounced validation, chip display for selections, and collapsible hierarchy make this the most complex form component in the application.
