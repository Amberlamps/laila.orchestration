# Implement Create Edit Story Modal

## Task Details

- **Title:** Implement Create Edit Story Modal
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement User Story Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** None

## Description

Build a combined create/edit modal for user stories. The modal includes title, Markdown description, priority selection, and parent epic selection. Stories are created in Draft status and must be assigned to an epic.

### Modal Layout

- **Title:** "Create Story" or "Edit Story"
- **Max Width:** 640px
- **Backdrop:** Blur-sm with semi-transparent overlay

### Form Fields

1. **Title** (required)
   - Input type: text
   - Placeholder: "e.g., User Login Flow"
   - Max length: 200 characters
   - Validation: Required, 1-200 characters

2. **Description** (optional)
   - Input type: MarkdownEditor
   - Placeholder: "Describe the user story requirements and expected behavior..."

3. **Priority** (required)
   - Input type: Select dropdown
   - Options: High, Medium (default), Low
   - Each option has a colored dot matching priority colors (red, amber, green)

4. **Epic** (required)
   - Input type: Select dropdown
   - Options: All epics in the current project (title displayed)
   - Grouped by lifecycle status (Draft, Ready)
   - Pre-selected if creating from within an epic context
   - Read-only in edit mode (epic cannot be changed after creation)

```tsx
// apps/web/src/components/stories/create-edit-story-modal.tsx
// Combined create/edit modal for user stories.
// Includes priority selection and epic assignment.
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateStory, useUpdateStory } from "@/hooks/use-stories";
import { useProjectEpics } from "@/hooks/use-epics";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Zod schema for story creation/editing.
// Priority is required and must be one of the three valid values.
// Epic is required for creation but read-only during editing.
const storyFormSchema = z.object({
  title: z
    .string()
    .min(1, "Story title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z.string().optional(),
  priority: z.enum(["high", "medium", "low"], {
    required_error: "Priority is required",
  }),
  epicId: z.string().min(1, "Epic selection is required"),
});

type StoryFormData = z.infer<typeof storyFormSchema>;
```

## Acceptance Criteria

- [ ] Modal opens in create mode from "+ Add Story" button (on epic detail or project stories tab)
- [ ] Modal opens in edit mode from "Edit" button on story detail page
- [ ] Title field is required with 1-200 character validation
- [ ] Description uses MarkdownEditor with write/preview toggle
- [ ] Priority select shows High, Medium, Low options with colored dot indicators
- [ ] Priority defaults to "Medium" in create mode
- [ ] Epic select shows all epics in the project, grouped by lifecycle status
- [ ] Epic is pre-selected when creating from within an epic context
- [ ] Epic is read-only (displayed but not changeable) in edit mode
- [ ] In edit mode, form fields are pre-filled with existing story data
- [ ] Form validation uses React Hook Form + Zod with inline error messages
- [ ] Cancel button closes modal and resets form
- [ ] Submit button calls `useCreateStory` (create) or `useUpdateStory` (edit)
- [ ] Submit button shows loading spinner during submission
- [ ] On success: modal closes, success toast, relevant caches invalidated
- [ ] On error: inline error alert at top of form
- [ ] New stories are created in Draft status
- [ ] Priority select uses `Controller` from React Hook Form for custom component integration

## Technical Notes

- Use `Controller` from React Hook Form to integrate the shadcn `Select` component, which is a controlled component that does not work with `register`.
- The epic options should be fetched via `useProjectEpics(projectId)` and filtered to show only Draft and Ready epics (Published epics that the story can be added to).
- Priority colored dots can use the `StatusBadge` dot styling pattern — small 8px circles in red (high), amber (medium), or green (low) next to the option text.
- In edit mode, the epic field should be rendered as a disabled select or as a read-only text display showing the current epic title. Changing the epic after creation would require moving the story, which is a different operation.
- Consider using `SelectGroup` from shadcn to group epics by lifecycle status in the dropdown.

## References

- **Design Specification:** Section 7.4 (Create/Edit Story Modal)
- **Functional Requirements:** FR-STORY-009 (story creation), FR-STORY-010 (story editing), FR-STORY-011 (priority assignment)
- **React Hook Form Docs:** Controller for custom components, zodResolver
- **Zod Docs:** enum validation, required_error
- **UI Components:** Dialog, MarkdownEditor, Select, Input, Button (from Epic 8)

## Estimated Complexity

Medium — Four form fields with different input types (text, Markdown, select, select), React Hook Form Controller integration for selects, and create/edit mode switching add moderate complexity.
