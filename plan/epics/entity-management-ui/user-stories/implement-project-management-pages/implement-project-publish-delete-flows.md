# Implement Project Publish Delete Flows

## Task Details

- **Title:** Implement Project Publish Delete Flows
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Project Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Project Detail Page, Implement Project Settings Tab

## Description

Implement the publish validation flow and delete confirmation flow for projects. These are critical lifecycle management operations that require validation guards and clear user communication about consequences.

### Publish Flow

The publish flow transitions a project from Draft to Published (Ready) status. Before publishing, all child entities must be validated:

1. **Trigger:** User clicks "Publish" button (on header or in Settings > Lifecycle)
2. **Validation Check:** Call API to validate all children are ready for publishing
3. **If Valid:** Show success confirmation, transition project to Ready status
4. **If Invalid:** Show validation error dialog listing all issues:
   - Epics without stories
   - Stories without tasks
   - Tasks without personas assigned
   - Tasks without acceptance criteria
   - Circular dependency detected

```tsx
// apps/web/src/components/projects/publish-project-flow.tsx
// Publish validation flow for projects.
// Validates all child entities before transitioning to Ready status.
import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePublishProject } from '@/hooks/use-projects';

interface ValidationIssue {
  entityType: string; // e.g., "epic", "story", "task"
  entityName: string; // e.g., "User Authentication"
  issue: string; // e.g., "No stories defined"
}

interface PublishProjectFlowProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

// The flow has three states:
// 1. "validating" — checking child entities
// 2. "errors" — validation failed, showing issues
// 3. "confirming" — validation passed, confirming publish
type FlowState = 'validating' | 'errors' | 'confirming';
```

### Delete Flow

The delete flow permanently removes a project and all its child entities:

1. **Trigger:** User clicks "Delete Project" in the Danger Zone
2. **In-Progress Check:** If the project has in-progress work, show a block message: "Cannot delete project with in-progress work. Stop all workers first."
3. **If No In-Progress Work:** Show ConfirmDialog with entity counts:
   - Title: "Delete Project '{name}'?"
   - Description: "This will permanently delete {epicCount} epics, {storyCount} stories, and {taskCount} tasks. This action cannot be undone."
   - Confirm: "Delete Project" (destructive button)
4. **On Confirm:** Call delete API, show success toast, redirect to `/projects`

```tsx
// apps/web/src/components/projects/delete-project-flow.tsx
// Delete confirmation flow with entity count display and in-progress work guard.
import { useRouter } from 'next/router';
import { useDeleteProject } from '@/hooks/use-projects';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';

interface EntityCounts {
  epics: number;
  stories: number;
  tasks: number;
}

interface DeleteProjectFlowProps {
  projectId: string;
  projectName: string;
  entityCounts: EntityCounts;
  hasInProgressWork: boolean;
  open: boolean;
  onClose: () => void;
}
```

## Acceptance Criteria

### Publish Flow

- [ ] Publish button triggers a validation check API call
- [ ] Loading state shows spinner with "Validating..." message during the check
- [ ] If validation passes: show success message and transition project to Ready status
- [ ] If validation fails: show dialog listing all validation issues grouped by type
- [ ] Validation issues show entity name and specific issue (e.g., "Task 'Build Form': No persona assigned")
- [ ] Validation dialog has a "Fix Issues" button that closes the dialog (user fixes manually)
- [ ] Validation dialog has a scrollable issue list for projects with many issues
- [ ] After successful publish: success toast, KPI bar and status badge update

### Delete Flow

- [ ] Delete button is blocked (disabled with tooltip) when project has in-progress work
- [ ] When allowed, delete button opens ConfirmDialog
- [ ] ConfirmDialog title includes the project name
- [ ] ConfirmDialog description includes accurate entity counts (epics, stories, tasks)
- [ ] Confirm button text is "Delete Project" (not generic "Confirm" or "Delete")
- [ ] Confirm button shows loading spinner during deletion
- [ ] On successful delete: success toast appears, user is redirected to `/projects`
- [ ] On delete error: error toast appears, dialog stays open for retry
- [ ] ConfirmDialog uses `role="alertdialog"` for screen reader announcement

### General

- [ ] Both flows handle API errors gracefully with user-friendly error messages
- [ ] Both flows prevent double-submission during async operations
- [ ] Both flows are accessible (keyboard navigation, screen reader announcements)

## Technical Notes

- The publish validation API should be a separate endpoint (e.g., `POST /api/projects/{projectId}/validate`) that returns the list of validation issues without changing state. The actual publish is a separate `POST /api/projects/{projectId}/publish` call.
- The delete flow should check `hasInProgressWork` from the project detail data. If the project has stories with `status = "in_progress"`, the delete button should be disabled with a tooltip explaining why.
- The entity counts for the delete confirmation can come from the project detail API response (aggregated counts of child entities).
- For the validation issue list, group issues by entity type and show them in a scrollable container with a max height.
- Use the `ConfirmDialog` component from Epic 8 for the delete confirmation.
- The redirect after delete uses `router.replace("/projects")` (not `push`) so the deleted project page is not in the browser history.

## References

- **Design Specification:** Section 5.5 (Project Lifecycle Flows), Section 5.5.1 (Publish Validation), Section 5.5.2 (Delete Confirmation)
- **Functional Requirements:** FR-PROJ-012 (publish validation), FR-PROJ-013 (publish transition), FR-PROJ-014 (delete confirmation), FR-PROJ-015 (delete cascade)
- **UI Components:** ConfirmDialog, Dialog, Button, Toast (from Epic 8)
- **API Endpoints:** Project validate, publish, delete

## Estimated Complexity

High — The publish validation flow requires coordinating a validation API call, displaying categorized issues, and handling the success/error states. The delete flow requires entity count fetching, in-progress work guards, and post-delete redirect. Both flows require careful error handling and loading states.
