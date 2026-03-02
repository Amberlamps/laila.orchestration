# Implement Create Project Modal

## Task Details

- **Title:** Implement Create Project Modal
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Project Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Project List Page

## Description

Build the Create Project modal dialog (640px max-width) that allows users to create a new project in Draft status. The form uses React Hook Form for state management and Zod for validation, with the Markdown editor for the description field.

### Modal Layout

- **Title:** H3 "Create Project"
- **Close:** X button top-right
- **Max Width:** 640px
- **Backdrop:** Blur-sm with semi-transparent overlay

### Form Fields

1. **Name** (required)
   - Input type: text
   - Placeholder: "e.g., E-commerce Platform Redesign"
   - Max length: 200 characters
   - Validation: Required, 1-200 characters
   - Character counter: "123 / 200" shown below field

2. **Description** (optional)
   - Input type: MarkdownEditor component
   - Placeholder: "Describe your project goals, scope, and key objectives..."
   - Preview toggle for rendered Markdown

3. **Worker Inactivity Timeout** (required, with default)
   - Input type: number
   - Default value: 30
   - Min: 5, Max: 1440 (24 hours)
   - Unit label: "minutes"
   - Help text: "Workers will be automatically unassigned after this period of inactivity."

### Footer

- Cancel button (outline variant) — closes modal without saving
- Create Project button (primary variant) — submits the form

```tsx
// apps/web/src/components/projects/create-project-modal.tsx
// Create Project modal with React Hook Form + Zod validation.
// Creates a new project in Draft status.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateProject } from "@/hooks/use-projects";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// Zod schema defining the validation rules for project creation.
// Name is required (1-200 chars), description is optional,
// timeout defaults to 30 and must be between 5-1440 minutes.
const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(200, "Project name must be 200 characters or fewer"),
  description: z.string().optional(),
  workerInactivityTimeoutMinutes: z
    .number()
    .min(5, "Minimum timeout is 5 minutes")
    .max(1440, "Maximum timeout is 1440 minutes (24 hours)")
    .default(30),
});

type CreateProjectFormData = z.infer<typeof createProjectSchema>;
```

## Acceptance Criteria

- [ ] Modal opens from the "+ New Project" button on the project list page
- [ ] Modal has 640px max-width with backdrop blur and semi-transparent overlay
- [ ] Modal title is "Create Project" in H3 typography
- [ ] Name field is required with 1-200 character validation
- [ ] Name field shows character counter ("X / 200") below the input
- [ ] Description field uses MarkdownEditor component with write/preview toggle
- [ ] Worker Inactivity Timeout field defaults to 30, validates between 5-1440
- [ ] Timeout field shows "minutes" unit label and help text
- [ ] Form validation uses React Hook Form + Zod with inline error messages
- [ ] Error messages appear below the field in red-500 text with 13px font
- [ ] Cancel button closes the modal without saving (resets form state)
- [ ] Create Project button submits the form and calls the `useCreateProject` mutation
- [ ] Create Project button shows loading spinner during submission
- [ ] Create Project button is disabled when form is invalid or submitting
- [ ] On success: modal closes, success toast appears, project list refreshes
- [ ] On error: inline error alert appears at the top of the form
- [ ] New project is created in Draft status
- [ ] Modal can be closed by clicking the backdrop (unless form is dirty — show unsaved changes warning)
- [ ] Form is accessible: labels associated with inputs, error messages linked via aria-describedby

## Technical Notes

- Use `useForm` from React Hook Form with `zodResolver` from `@hookform/resolvers/zod` for type-safe form validation.
- The `useCreateProject` mutation hook handles the API call and cache invalidation. On success, the project list query is automatically invalidated.
- The MarkdownEditor component integrates with React Hook Form via `Controller` or `register` with `forwardRef`.
- The character counter for the name field can read from `watch("name")?.length` in React Hook Form.
- Consider using the `onSettled` callback of the mutation to always close the loading state, regardless of success or error.
- The "unsaved changes" guard on modal close can use `formState.isDirty` from React Hook Form to detect if the user has modified any field.

## References

- **Design Specification:** Section 5.2 (Create Project Modal), Section 5.2.1 (Form Fields)
- **Functional Requirements:** FR-PROJ-004 (project creation), FR-PROJ-005 (default Draft status)
- **React Hook Form Docs:** useForm, zodResolver, Controller
- **Zod Docs:** Schema definition, validation messages
- **UI Components:** MarkdownEditor, Dialog, Button, Input (from Epic 8)

## Estimated Complexity

Medium — Standard form with React Hook Form + Zod, but the MarkdownEditor integration, character counter, timeout validation, and loading/error states add moderate complexity.
