# Implement Create Edit Epic Modal

## Task Details

- **Title:** Implement Create Edit Epic Modal
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Epic Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Epic Detail Page

## Description

Build a combined create/edit modal for epics. The modal supports both creating new epics (in Draft status under a selected project) and editing existing epics. The form uses React Hook Form with Zod validation and includes a Markdown editor for the description field.

### Modal Layout

- **Title:** "Create Epic" (create mode) or "Edit Epic" (edit mode)
- **Max Width:** 640px
- **Backdrop:** Blur-sm with semi-transparent overlay

### Form Fields

1. **Title** (required)
   - Input type: text
   - Placeholder: "e.g., User Authentication & Authorization"
   - Max length: 200 characters
   - Validation: Required, 1-200 characters

2. **Description** (optional)
   - Input type: MarkdownEditor component
   - Placeholder: "Describe the epic's scope, goals, and key deliverables..."
   - Preview toggle for rendered Markdown

3. **Project** (create mode only, read-only in edit mode)
   - If opening from within a project context, pre-selected and read-only
   - If opening from a global context, select dropdown of user's projects in Draft status

### Footer

- Cancel button (outline variant) — closes modal
- Create Epic / Save Changes button (primary variant) — submits form

```tsx
// apps/web/src/components/epics/create-edit-epic-modal.tsx
// Combined create/edit modal for epics.
// In create mode: creates a new epic in Draft status under the selected project.
// In edit mode: updates the title and description of an existing epic.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateEpic, useUpdateEpic } from "@/hooks/use-epics";

const epicFormSchema = z.object({
  title: z
    .string()
    .min(1, "Epic title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z.string().optional(),
});

type EpicFormData = z.infer<typeof epicFormSchema>;

interface CreateEditEpicModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Project ID for creating new epics */
  projectId: string;
  /** If provided, modal is in edit mode with pre-filled values */
  epic?: {
    id: string;
    title: string;
    description?: string;
  };
}
```

## Acceptance Criteria

- [ ] Modal opens in create mode from the "+ Add Epic" button on the project detail page
- [ ] Modal opens in edit mode from the "Edit" button on the epic detail page
- [ ] Modal title shows "Create Epic" in create mode and "Edit Epic" in edit mode
- [ ] Title field is required with 1-200 character validation
- [ ] Description uses MarkdownEditor with write/preview toggle
- [ ] In edit mode, form fields are pre-filled with existing epic data
- [ ] In create mode, form fields are empty
- [ ] Project context is automatically set from the parent project (not a user-selectable field in most cases)
- [ ] Form validation uses React Hook Form + Zod with inline error messages
- [ ] Cancel button closes the modal and resets form state
- [ ] Submit button calls `useCreateEpic` (create) or `useUpdateEpic` (edit) mutation
- [ ] Submit button shows loading spinner during submission
- [ ] Submit button text is "Create Epic" (create) or "Save Changes" (edit)
- [ ] On success: modal closes, success toast, relevant query caches invalidated
- [ ] On error: inline error alert at top of form
- [ ] New epics are created in Draft status
- [ ] Modal is accessible: labels, error messages linked via aria-describedby, focus management

## Technical Notes

- The modal uses the same `epicFormSchema` for both create and edit modes. In edit mode, `useForm` is initialized with `defaultValues` from the existing epic data.
- Use `useEffect` to reset the form when switching between create and edit modes, or when the modal reopens with different data.
- The project ID is passed as a prop and included in the create API call body. It is not a form field the user fills out.
- The `useCreateEpic` hook needs the `projectId` for the API call and for cache invalidation (invalidating the epics list under that project).
- Consider using the `Dialog` component from shadcn/ui with `DialogHeader`, `DialogContent`, and `DialogFooter` for consistent modal structure.

## References

- **Design Specification:** Section 6.2 (Create/Edit Epic Modal)
- **Functional Requirements:** FR-EPIC-004 (epic creation), FR-EPIC-005 (epic editing)
- **React Hook Form Docs:** defaultValues, reset, mode switching
- **Zod Docs:** Schema definition, validation messages
- **UI Components:** Dialog, MarkdownEditor, Input, Button (from Epic 8)

## Estimated Complexity

Low — The modal is a straightforward form with two fields (title, description) and standard React Hook Form + Zod patterns. The main consideration is handling create vs. edit mode correctly.
