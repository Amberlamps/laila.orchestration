# Implement Create Edit Task Modal

## Task Details

- **Title:** Implement Create Edit Task Modal
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Task Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Task Detail Page

## Description

Build a combined create/edit modal for tasks. This is the most complex form in the application, with multiple Markdown editors and the dependency picker component. The form handles title, description, acceptance criteria, technical notes, references, persona assignment, and task dependencies.

### Modal Layout

- **Title:** "Create Task" or "Edit Task"
- **Max Width:** 800px (wider to accommodate multiple Markdown editors)
- **Backdrop:** Blur-sm with semi-transparent overlay
- **Scrollable:** Modal body scrolls if content exceeds viewport height

### Form Fields

1. **Title** (required)
   - Input type: text
   - Placeholder: "e.g., Implement user login form with email/password fields"
   - Max length: 200 characters

2. **Description** (optional)
   - Input type: MarkdownEditor
   - Placeholder: "Describe what needs to be done..."

3. **Acceptance Criteria** (required before publish, optional during creation)
   - Input type: MarkdownEditor
   - Placeholder: "Define the criteria that must be met for this task to be considered complete..."
   - Help text: "Required before the parent story can be published"

4. **Technical Notes** (optional)
   - Input type: MarkdownEditor
   - Placeholder: "Any technical implementation guidance, code patterns, or architecture notes..."

5. **References** (optional)
   - Input type: MarkdownEditor
   - Placeholder: "Links to design specs, documentation, related PRs, or external resources..."

6. **Persona** (required)
   - Input type: Select dropdown
   - Options: All user's personas (title + first line of description)
   - Placeholder: "Select a persona..."

7. **Dependencies** (optional)
   - Input type: TaskDependencyPicker component (multi-select)
   - Shows all tasks in the project grouped by epic/story
   - Validates no circular dependencies on selection

```tsx
// apps/web/src/components/tasks/create-edit-task-modal.tsx
// Combined create/edit modal for tasks — the most complex form in the application.
// Includes multiple Markdown editors, persona selection, and dependency picker.
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTask, useUpdateTask } from "@/hooks/use-tasks";
import { usePersonas } from "@/hooks/use-personas";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { TaskDependencyPicker } from "./task-dependency-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Zod schema for task creation/editing.
// AcceptanceCriteria is optional during creation but required for publish.
const taskFormSchema = z.object({
  title: z.string().min(1, "Task title is required").max(200),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  technicalNotes: z.string().optional(),
  references: z.string().optional(),
  personaId: z.string().min(1, "Persona is required"),
  dependencyIds: z.array(z.string()).default([]),
});

type TaskFormData = z.infer<typeof taskFormSchema>;

interface CreateEditTaskModalProps {
  open: boolean;
  onClose: () => void;
  storyId: string;
  projectId: string;
  task?: {
    id: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    technicalNotes?: string;
    references?: string;
    personaId?: string;
    dependencyIds: string[];
  };
}
```

## Acceptance Criteria

- [ ] Modal opens in create mode from "+ New Task" button (on story tasks tab)
- [ ] Modal opens in edit mode from "Edit" button on task detail page
- [ ] Modal has 800px max-width and scrollable body
- [ ] Title field is required with 1-200 character validation
- [ ] Description field uses MarkdownEditor
- [ ] Acceptance Criteria field uses MarkdownEditor with help text about publish requirements
- [ ] Technical Notes field uses MarkdownEditor (optional, collapsible section)
- [ ] References field uses MarkdownEditor (optional, collapsible section)
- [ ] Persona select shows all user's personas with title and description preview
- [ ] Persona selection is required
- [ ] Dependencies section uses TaskDependencyPicker component
- [ ] In edit mode, form fields are pre-filled with existing task data
- [ ] In edit mode, existing dependencies are pre-selected in the picker
- [ ] Form validation uses React Hook Form + Zod
- [ ] Submit button calls `useCreateTask` (create) or `useUpdateTask` (edit)
- [ ] Submit button shows loading state during submission
- [ ] On success: modal closes, success toast, caches invalidated
- [ ] On error: inline error alert at top of form
- [ ] Optional fields (Technical Notes, References) are in collapsible sections to reduce initial form height
- [ ] Modal is keyboard navigable with proper tab order

## Technical Notes

- This is the largest form in the application. To manage the height, consider using collapsible sections for optional fields (Technical Notes, References). Show them collapsed by default with a "Show advanced fields" toggle.
- Multiple MarkdownEditor instances on the same page can cause performance issues if each initializes separately. Ensure each editor has a unique `name` prop and does not share state.
- The Persona select fetches all personas via `usePersonas()`. Show each option with the persona title and a truncated first line of the description for context.
- The TaskDependencyPicker is a separate component (next task) that handles the complex multi-select with search and cycle detection.
- Use `Controller` from React Hook Form for all custom components (MarkdownEditor, Select, TaskDependencyPicker).
- The scrollable modal body should use `max-height: calc(100vh - 200px)` with `overflow-y: auto` to ensure the modal does not extend beyond the viewport.

## References

- **Design Specification:** Section 8.2 (Create/Edit Task Modal), Section 8.2.1 (Form Layout)
- **Functional Requirements:** FR-TASK-004 (task creation), FR-TASK-005 (task editing), FR-TASK-006 (dependency selection)
- **React Hook Form Docs:** Controller, multiple controlled components, complex forms
- **Zod Docs:** Array validation, optional fields
- **UI Components:** Dialog, MarkdownEditor, Select, Button (from Epic 8)

## Estimated Complexity

High — Seven form fields including four Markdown editors, persona select, and dependency picker make this the most complex form in the application. Managing form state, validation, and performance with multiple rich editors requires careful implementation.
