# Implement Project Settings Tab

## Task Details

- **Title:** Implement Project Settings Tab
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Project Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Project Detail Page

## Description

Build the Settings tab content for the project detail page. The settings tab is organized into four sections: General, Orchestration, Lifecycle, and Danger Zone. Each section is rendered in a Card with a clear heading and purpose description.

### Section Layout

Each section is a Card component with:
- Section heading in H3 typography (16px, semibold)
- Section description in Body Small (13px, zinc-500)
- Form fields or action buttons below

### Sections

1. **General Section:**
   - **Name:** Editable text input, pre-filled with current name. Save on blur or Enter.
   - **Description:** MarkdownEditor with current description pre-filled. Save button below.
   - **Status:** Read-only StatusBadge showing current work status + lifecycle state. Not editable directly (changed via Lifecycle section).

2. **Orchestration Section:**
   - **Worker Inactivity Timeout:** Number input with "minutes" label. Current value pre-filled. Min 5, max 1440. Help text explaining the timeout behavior. Save button.

3. **Lifecycle Section:**
   - **Publish:** Button to transition project from Draft to Published (Ready). Shows validation requirements. Only visible when project is in Draft status.
   - **Revert to Draft:** Button to transition project from Ready back to Draft. Only visible when project is in Ready status and has no in-progress work.
   - Status information showing current lifecycle state and available transitions.

4. **Danger Zone Section:**
   - Red border (border-red-200), light red background (red-50/50)
   - Heading: "Danger Zone" in red-700 text
   - **Delete Project:** Button (destructive variant) that triggers the ConfirmDialog with entity counts ("This will permanently delete 3 epics, 12 stories, and 47 tasks.")

```tsx
// apps/web/src/components/projects/project-settings-tab.tsx
// Settings tab for project detail page.
// Organized into General, Orchestration, Lifecycle, and Danger Zone sections.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateProject, useDeleteProject } from "@/hooks/use-projects";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Settings form schema — separate from create schema because
// all fields are optional (partial update) and some fields are read-only.
const settingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  workerInactivityTimeoutMinutes: z.number().min(5).max(1440).optional(),
});
```

## Acceptance Criteria

- [ ] Settings tab renders four sections: General, Orchestration, Lifecycle, Danger Zone
- [ ] Each section is wrapped in a Card component with heading and description
- [ ] **General:** Name field is editable with current value pre-filled, saves on blur or Save button
- [ ] **General:** Description uses MarkdownEditor pre-filled with current description
- [ ] **General:** Status shows a read-only StatusBadge (not editable in this section)
- [ ] **Orchestration:** Timeout input shows current value, validates 5-1440 minutes
- [ ] **Orchestration:** Save button updates the timeout via `useUpdateProject` mutation
- [ ] **Lifecycle:** Publish button visible only when project is in Draft status
- [ ] **Lifecycle:** Revert to Draft button visible only when project is in Ready status
- [ ] **Lifecycle:** Publish button triggers validation before transitioning (see publish flow task)
- [ ] **Danger Zone:** Section has red-200 border and red-50 background
- [ ] **Danger Zone:** Delete Project button uses destructive variant
- [ ] **Danger Zone:** Delete button opens ConfirmDialog with entity count message
- [ ] Form fields show validation errors inline (red-500 text below field)
- [ ] All save operations show loading state and success/error toast notifications
- [ ] Changes are saved via partial update API (only modified fields are sent)
- [ ] Unsaved changes show a confirmation dialog if the user navigates away

## Technical Notes

- Use React Hook Form with `defaultValues` set from the project data. When the project data changes (e.g., after save), reset the form with the new values using `form.reset(newData)`.
- The General section can use inline saving (save on blur for name, Save button for description) or a single Save button for all fields. Choose the approach that provides the best UX.
- The Lifecycle section buttons trigger flows that are implemented in the separate "Publish/Delete Flows" task. This component should provide callbacks/props that the parent component uses to coordinate those flows.
- The Danger Zone visual treatment (red border + background) signals to users that the actions in this section are irreversible.
- Use the `useUpdateProject` mutation hook for saving changes. The hook automatically invalidates the project detail and list caches on success.
- Consider using `useBeforeUnload` or `router.events` to warn about unsaved changes when navigating away.

## References

- **Design Specification:** Section 5.4 (Project Settings Tab), Section 5.4.1 (Section Layout)
- **Functional Requirements:** FR-PROJ-009 (project settings), FR-PROJ-010 (timeout configuration), FR-PROJ-011 (lifecycle management)
- **UI Components:** Card, Input, MarkdownEditor, StatusBadge, ConfirmDialog, Button (from Epic 8)
- **React Hook Form Docs:** defaultValues, reset, partial validation

## Estimated Complexity

High — Four distinct sections with different interaction patterns (inline editing, form submission, lifecycle transitions, destructive actions), status-gated visibility, and unsaved changes detection create significant complexity.
