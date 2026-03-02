# Implement Story Action Flows

## Task Details

- **Title:** Implement Story Action Flows
- **Status:** Not Started
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement User Story Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Story Detail Page, Implement Story Tasks Tab

## Description

Implement the four lifecycle action flows for user stories: Publish (with validation), Reset (Failed to system-determined), Unassign (worker removal), and Delete (with guards and cascade). These actions are triggered from the story detail page header buttons.

### 1. Publish Flow

Transitions a story from Draft to Ready (published). Before publishing, validates:
- All tasks have personas assigned
- All tasks have acceptance criteria defined
- No circular dependencies exist in the task graph

If validation fails, show a dialog listing incomplete items:

```tsx
// Validation issue dialog for story publish.
// Lists tasks that are not ready for publishing.
interface StoryValidationIssue {
  taskId: string;
  taskTitle: string;
  issues: string[]; // e.g., ["No persona assigned", "Missing acceptance criteria"]
}
```

### 2. Reset Flow

Transitions a Failed story back to a system-determined status (typically "Not Started" or "Ready"). This allows re-execution by a different worker.

- Trigger: "Reset" button visible only when story status is "failed"
- Show confirmation dialog: "Reset '{story title}'? This will clear the error state and make the story available for re-assignment."
- On confirm: call reset API, success toast, status badge updates

### 3. Unassign Flow

Removes the current worker assignment from a story. Used when a worker is stuck or needs to be replaced.

- Trigger: "Unassign" button visible when story has an assigned worker
- Show ConfirmDialog: "Unassign worker '{worker name}' from '{story title}'? The story will become available for assignment to another worker."
- On confirm: call unassign API, success toast, worker field updates to "Unassigned"

### 4. Delete Flow

Permanently removes a story and cascades to all child tasks.

- Trigger: "Delete" button (ghost destructive icon)
- Guard: Blocked if story status is "in_progress" (tooltip: "Cannot delete story with in-progress work")
- ConfirmDialog: "Delete Story '{title}'?" / "This will permanently delete {taskCount} tasks."
- On confirm: soft-delete cascade, success toast, redirect to parent epic detail page

```tsx
// apps/web/src/components/stories/story-action-flows.tsx
// Lifecycle action flows for stories: publish, reset, unassign, delete.
// Each flow uses a dialog/confirmation pattern with appropriate guards.
import { useState } from "react";
import { useRouter } from "next/router";
import {
  usePublishStory, useResetStory, useUnassignStory, useDeleteStory,
} from "@/hooks/use-stories";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
```

## Acceptance Criteria

### Publish Flow
- [ ] Publish button triggers validation API call
- [ ] If valid: story transitions to Ready, success toast
- [ ] If invalid: dialog lists tasks with missing personas or acceptance criteria
- [ ] Each task issue shows task title and specific missing items
- [ ] Publish button only visible when story is in Draft status

### Reset Flow
- [ ] Reset button visible only when story status is "failed"
- [ ] Confirmation dialog explains the reset action and its effect
- [ ] On confirm: story status changes from Failed to system-determined status
- [ ] Error message is cleared after successful reset
- [ ] Success toast confirms the reset

### Unassign Flow
- [ ] Unassign button visible when story has an assigned worker
- [ ] ConfirmDialog shows worker name and story title
- [ ] On confirm: worker is removed, story status updates accordingly
- [ ] The unassigned worker's current work card updates
- [ ] Success toast confirms the unassignment

### Delete Flow
- [ ] Delete blocked (disabled + tooltip) when story is in_progress
- [ ] ConfirmDialog shows story title and child task count
- [ ] Confirm button text is "Delete Story"
- [ ] On success: toast, redirect to parent epic detail page
- [ ] Cascade soft-delete includes all child tasks

### General
- [ ] All flows prevent double-submission
- [ ] All flows handle API errors with user-friendly messages
- [ ] All flows use proper ARIA attributes on dialogs
- [ ] Cache invalidation occurs after each successful action (story detail, story lists, parent epic, project stats)

## Technical Notes

- Each flow uses a dedicated mutation hook (`usePublishStory`, `useResetStory`, `useUnassignStory`, `useDeleteStory`) that handles the API call and cache invalidation.
- The publish validation endpoint should return the list of issues as structured data, not just a boolean. This enables the UI to show specific task-level issues.
- The reset flow changes the story status based on server-side logic — the client does not specify the target status. The server determines whether to set it to "not_started" or "ready" based on the project and epic states.
- Unassignment may trigger a worker status change (from working to idle). The cache invalidation should include the worker detail and worker list queries.
- After delete, use `router.replace` (not `push`) to navigate to the parent epic, preventing the deleted story from appearing in browser history.
- Consider consolidating these flows into a single component with a state machine to manage which dialog is currently open.

## References

- **Design Specification:** Section 7.5 (Story Action Flows), Section 7.5.1 (Publish), Section 7.5.2 (Reset), Section 7.5.3 (Unassign), Section 7.5.4 (Delete)
- **Functional Requirements:** FR-STORY-012 (publish validation), FR-STORY-013 (reset), FR-STORY-014 (unassign), FR-STORY-015 (delete cascade)
- **UI Components:** ConfirmDialog, Dialog, Button, Toast (from Epic 8)

## Estimated Complexity

High — Four distinct flows, each with its own guards, validation, confirmation UI, and cache invalidation requirements. The publish flow adds complexity with the task-level validation issue display.
